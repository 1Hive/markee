// GET /api/account/funded?owner=0x...
// Returns markees the wallet has funded but does not own.
import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { BASE_MARKEE_EVENTS_FROM_BLOCK, BOARD_MIGRATORS } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import { fetchBackerPositions, type BackerPosition } from '@/lib/streaming/subgraph'
import { withWinTimes } from '@/lib/leaderboard/topHistory'
import { netStreamedWei, readLifetimeStreamed } from '@/lib/streaming/lifetime'
import { markeeSuccessors } from '@/lib/contracts/migration'
import { fundedSnapshotKey, snapshotTotals } from '@/lib/stats/daily'
import { readRateLimited } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const LEADERBOARD_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'offset', type: 'uint256' },
      { internalType: 'uint256', name: 'limit', type: 'uint256' },
    ],
    name: 'getMarkees',
    outputs: [{ name: 'result', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Emitted by individual markee contracts when anyone adds funds (v1.1+ standalone-markee boards).
const FUNDS_ADDED_EVENT = parseAbiItem(
  'event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)'
)

// Older partner-strategy boards (e.g. Gardens) emit funds-added from the *leaderboard* contract
// itself, keyed by markee address, rather than from each markee's own contract. Same intent,
// different shape -- both must be scanned or partner-board contributions silently disappear.
const LEGACY_FUNDS_ADDED_EVENT = parseAbiItem(
  'event FundsAdded(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 newMarkeeTotal)'
)

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org', {
      fetchOptions: { cache: 'no-store' },
    }),
  })
}

async function chunkedMulticall(
  client: ReturnType<typeof getClient>,
  contracts: Parameters<typeof client.multicall>[0]['contracts'],
) {
  const CHUNK = 50
  const results = []
  for (let i = 0; i < contracts.length; i += CHUNK) {
    const slice = contracts.slice(i, i + CHUNK) as Parameters<typeof client.multicall>[0]['contracts']
    results.push(...await client.multicall({ contracts: slice }))
  }
  return results
}

interface FundedMessage {
  address: string
  message: string
  name: string
  totalFundsAdded: string
  totalContributed: string
  strategyId: string
  strategyName: string
  isTop: boolean
  topFundsRaw: string
  strategy: 'fixed' | 'streaming'
  rank: number | null
  flowRateRaw: string
  platform: string | null
  admin: string | null
  verifiedUrls: string[]
  linkedFiles: unknown[]
  siteUrl: string | null
  repoFullName: string | null
  repoHtmlUrl: string | null
}

type Board = {
  address: string
  name: string
  topMarkeeAddress: string | null
  topFundsAddedRaw: string
  platform?: string
  admin?: string
  verifiedUrls?: string[]
  linkedFiles?: unknown[]
  siteUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
  migratedFrom?: string | null
}

// Lump-sum boards: a backer is whoever emitted FundsAdded on a markee.
//
// Every part that reads is shown, so one failed read never hides the rest. `complete` says whether
// every part read: only then is the wallet's funded total snapshotted.
async function fixedFunded(
  client: ReturnType<typeof getClient>,
  owner: string,
  origin: string,
  headers: HeadersInit,
): Promise<{ rows: FundedMessage[]; complete: boolean }> {
  let complete = true
  const incomplete = (what: string, e?: unknown) => { complete = false; console.warn(`[account/funded] ${what} failed`, e ?? '') }
  const [sfData, ghData, oiData, fsData] = await Promise.all([
    fetch(`${origin}/api/superfluid/leaderboards`, { cache: 'no-store', headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/github/leaderboards`, { cache: 'no-store', headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/openinternet/leaderboards`, { cache: 'no-store', headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/forsale/leaderboards`, { cache: 'no-store', headers }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  const leaderboards: Board[] = [
    // See messages/route.ts for why superfluid's own listing route needs platform/verification
    // fields backfilled here -- it carries neither today, and streaming-strategy boards are
    // always verification-gated regardless, so empty is correct.
    ...(sfData?.leaderboards ?? []).map((lb: any) => ({ ...lb, platform: 'superfluid', verifiedUrls: [], linkedFiles: [] })),
    ...(ghData?.leaderboards ?? []),
    ...(oiData?.leaderboards ?? []),
    // For Sale factory boards come from their own listing route, not the openinternet one.
    ...(fsData?.leaderboards ?? []),
  ].filter((lb: any, i, all) => lb.markeeCount > 0 && all.findIndex((x: any) => x.address.toLowerCase() === lb.address.toLowerCase()) === i)

  if (leaderboards.length === 0) return { rows: [], complete }

  // Get all markee addresses from every leaderboard, and from each migrated board's legacy original:
  // payments made before the migration were logged on the original Markees, not their copies.
  const legacyBoards = leaderboards.flatMap(lb => lb.migratedFrom ? [lb.migratedFrom.toLowerCase() as `0x${string}`] : [])
  const allListResults = await chunkedMulticall(
    client,
    [...leaderboards.map(lb => lb.address as `0x${string}`), ...legacyBoards].map(address => ({
      address,
      abi: LEADERBOARD_ABI,
      functionName: 'getMarkees' as const,
      args: [0n, 1000n] as const,
    })),
  )
  const markeeListResults = allListResults.slice(0, leaderboards.length)
  const legacyMarkees = legacyBoards.flatMap((board, j) => {
    const read = allListResults[leaderboards.length + j]
    // A legacy board that can't be listed leaves out its contributions, so the total is incomplete.
    if (read?.status !== 'success') { incomplete(`getMarkees on legacy board ${board}`, read?.error); return [] }
    return (read.result as string[])
      .filter(a => a && a !== '0x0000000000000000000000000000000000000000')
      .map(a => a.toLowerCase() as `0x${string}`)
  })

  type Entry = { lbIndex: number; markeeAddress: `0x${string}` }
  const entries: Entry[] = []
  const lbRankMaps = new Map<number, Map<string, number>>()
  for (let i = 0; i < leaderboards.length; i++) {
    const addrs = (markeeListResults[i]?.result as string[]) ?? []
    const ranks = new Map<string, number>()
    let rank = 1
    for (const addr of addrs) {
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        entries.push({ lbIndex: i, markeeAddress: addr as `0x${string}` })
        ranks.set(addr.toLowerCase(), rank++)
      }
    }
    lbRankMaps.set(i, ranks)
  }

  if (entries.length === 0) return { rows: [], complete }

  const allMarkeeAddresses = [...new Set([...entries.map(e => e.markeeAddress), ...legacyMarkees])]
  const allLeaderboardAddresses = [...leaderboards.map(lb => lb.address as `0x${string}`), ...legacyBoards]

  // A chunk whose scan fails is left out and makes the result incomplete, so the snapshot is skipped
  // rather than recorded without those lump sums.
  // Query both FundsAdded shapes filtered by addedBy == owner: per-markee-contract (v1.1+ boards)
  // and per-leaderboard-contract keyed by markeeAddress (older partner-strategy boards).
  // Address lists are chunked: with each migrated board's legacy Markees added there are well over
  // a thousand, more than one request should carry.
  const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOG_ADDRESS_CHUNK) }, (_, i) => xs.slice(i * LOG_ADDRESS_CHUNK, (i + 1) * LOG_ADDRESS_CHUNK))
  const [fundsAddedLogs, legacyFundsAddedLogs] = await Promise.all([
    Promise.all(chunks(allMarkeeAddresses).map(address => client.getLogs({
      address,
      event: FUNDS_ADDED_EVENT,
      args: { addedBy: owner as `0x${string}` },
      fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
      toBlock: 'latest',
    }).catch(e => { incomplete('FUNDS_ADDED_EVENT scan', e); return [] }))).then(r => r.flat()),
    Promise.all(chunks(allLeaderboardAddresses).map(address => client.getLogs({
      address,
      event: LEGACY_FUNDS_ADDED_EVENT,
      args: { addedBy: owner as `0x${string}` },
      fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
      toBlock: 'latest',
    }).catch(e => { incomplete('LEGACY_FUNDS_ADDED_EVENT scan', e); return [] }))).then(r => r.flat()),
  ])

  if (fundsAddedLogs.length === 0 && legacyFundsAddedLogs.length === 0) return { rows: [], complete }

  // Aggregate total contributed by user per markee
  const markeeContribs = new Map<string, bigint>()
  for (const log of fundsAddedLogs) {
    const addr = log.address.toLowerCase()
    const amount = (log.args as { amount: bigint }).amount ?? 0n
    markeeContribs.set(addr, (markeeContribs.get(addr) ?? 0n) + amount)
  }
  for (const log of legacyFundsAddedLogs) {
    const args = log.args as { markeeAddress?: string; amount?: bigint }
    if (!args.markeeAddress) continue
    const addr = args.markeeAddress.toLowerCase()
    const amount = args.amount ?? 0n
    markeeContribs.set(addr, (markeeContribs.get(addr) ?? 0n) + amount)
  }

  // A contribution to a legacy Markee belongs to its copy on the successor board. If the lookup
  // fails, those contributions are left out (they'd point at no listed board) and the rest shown.
  const legacySet = new Set<string>(legacyMarkees)
  await moveToSuccessors(client, markeeContribs, legacySet).catch(e => {
    incomplete('Markee successor lookup', e)
    for (const markee of legacySet) markeeContribs.delete(markee)
  })

  const fundedAddrs = [...markeeContribs.keys()]

  // Filter out markees the user owns — those appear in "bought", not "funded"
  const ownerResults = await chunkedMulticall(
    client,
    fundedAddrs.map(addr => ({
      address: addr as `0x${string}`,
      abi: MarkeeABI,
      functionName: 'owner' as const,
    })),
  )

  const externalAddrs = fundedAddrs.filter((_, i) => {
    const markeeOwner = (ownerResults[i]?.result as string | undefined)?.toLowerCase()
    return markeeOwner !== owner
  })

  if (externalAddrs.length === 0) return { rows: [], complete }

  // Fetch message, name, totalFundsAdded for externally-funded markees
  const detailResults = await chunkedMulticall(
    client,
    externalAddrs.flatMap(addr => [
      { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'message' as const },
      { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'name' as const },
      { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'totalFundsAdded' as const },
    ]),
  )

  // Build markee → leaderboard + rank lookup
  const markeeToLb = new Map<string, typeof leaderboards[0]>()
  const markeeToRank = new Map<string, number>()
  for (const e of entries) {
    const key = e.markeeAddress.toLowerCase()
    if (!markeeToLb.has(key)) {
      markeeToLb.set(key, leaderboards[e.lbIndex])
      const r = lbRankMaps.get(e.lbIndex)?.get(key)
      if (r !== undefined) markeeToRank.set(key, r)
    }
  }

  const rows = externalAddrs.map((addr, i) => {
    const b = i * 3
    const message = (detailResults[b]?.result as string) ?? ''
    const name = (detailResults[b + 1]?.result as string) ?? ''
    const totalFundsAdded = (detailResults[b + 2]?.result as bigint) ?? 0n
    const lb = markeeToLb.get(addr)
    const isTop = lb?.topMarkeeAddress?.toLowerCase() === addr
    return {
      address: addr,
      message,
      name,
      totalFundsAdded: totalFundsAdded.toString(),
      totalContributed: (markeeContribs.get(addr) ?? 0n).toString(),
      strategyId: lb?.address ?? '',
      strategyName: lb?.name ?? 'Unknown Leaderboard',
      isTop,
      topFundsRaw: lb?.topFundsAddedRaw ?? '0',
      strategy: 'fixed' as const,
      rank: markeeToRank.get(addr) ?? null,
      flowRateRaw: '0',
      platform: lb?.platform ?? null,
      admin: lb?.admin ?? null,
      verifiedUrls: lb?.verifiedUrls ?? [],
      linkedFiles: lb?.linkedFiles ?? [],
      siteUrl: lb?.siteUrl ?? null,
      repoFullName: lb?.repoFullName ?? null,
      repoHtmlUrl: lb?.repoHtmlUrl ?? null,
    }
  })
  return { rows, complete }
}

const LOG_ADDRESS_CHUNK = 500
const LUMP_SUM_MIGRATORS = [BOARD_MIGRATORS.SUPERFLUID, BOARD_MIGRATORS.OPEN_INTERNET, BOARD_MIGRATORS.GITHUB, BOARD_MIGRATORS.FOR_SALE]

// Re-keys contributions to legacy Markees onto their copies. A legacy Markee with no copy (excluded
// from the migration) is dropped: it's on no listed board. Throws if the lookup fails, so the caller
// skips the snapshot rather than recording a total without them.
async function moveToSuccessors(client: ReturnType<typeof getClient>, contribs: Map<string, bigint>, legacy: ReadonlySet<string>) {
  const funded = [...contribs.keys()].filter(a => legacy.has(a))
  if (funded.length === 0) return
  const successors = await markeeSuccessors(client, funded, LUMP_SUM_MIGRATORS)
  for (const markee of funded) {
    const amount = contribs.get(markee) ?? 0n
    contribs.delete(markee)
    const successor = successors.get(markee)
    if (successor) contribs.set(successor, (contribs.get(successor) ?? 0n) + amount)
  }
}

// Streaming boards: a backer holds one position per board, recorded on-chain as backerMarkee.
// There are no FundsAdded logs to scan, and the amount put in is the net ETHx streamed.
async function streamingFunded(
  client: ReturnType<typeof getClient>,
  owner: string,
  origin: string,
  headers: HeadersInit,
): Promise<{ rows: FundedMessage[]; legacyOnly: bigint; complete: boolean }> {
  const data = await fetch(`${origin}/api/streaming/leaderboards`, { cache: 'no-store', headers })
    .then(r => r.ok ? r.json() : null).catch(() => null)

  const listed: Board[] = data?.leaderboards ?? []
  const boards = listed.filter((lb: any) => lb.markeeCount > 0)
  const [rows, legacy] = await Promise.all([
    boards.length ? streamingFundedRows(client, owner, boards) : Promise.resolve([] as FundedMessage[]),
    legacyStreamedFunded(client, owner, listed),
  ])
  // What the wallet streamed to other people's messages on legacy originals belongs to each
  // message's copy: added to that row when the wallet backs the copy now, otherwise only to the
  // wallet's total (the copy's board is listed, but the wallet has no position on it to show).
  let legacyOnly = 0n
  for (const [successor, wei] of legacy.byCopy) {
    const row = rows.find(r => r.address.toLowerCase() === successor)
    if (row) row.totalContributed = (BigInt(row.totalContributed) + wei).toString()
    else legacyOnly += wei
  }
  return { rows, legacyOnly: legacyOnly + legacy.uncopied, complete: legacy.complete }
}

const BACKER_UPDATED_EVENT = parseAbiItem('event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)')

// Net ETHx this wallet streamed to other people's messages on migrated boards' legacy originals,
// exact per message: the board's own BackerUpdated events say which messages it streamed to, and
// readLifetimeStreamed replays each one (checkpointed in KV). Its own messages are skipped: they
// count as spend in /api/account/messages. Keyed by each message's copy; messages that weren't
// copied are summed in `uncopied`. Any failed read makes it incomplete.
async function legacyStreamedFunded(
  client: ReturnType<typeof getClient>,
  owner: string,
  listed: Board[],
): Promise<{ byCopy: Map<string, bigint>; uncopied: bigint; complete: boolean }> {
  const byCopy = new Map<string, bigint>()
  let uncopied = 0n
  const legacyBoards = [...new Set(listed.flatMap(lb => lb.migratedFrom ? [lb.migratedFrom.toLowerCase() as `0x${string}`] : []))]
  if (legacyBoards.length === 0) return { byCopy, uncopied, complete: true }
  try {
    const logs = await client.getLogs({
      address: legacyBoards, event: BACKER_UPDATED_EVENT, args: { backer: owner as `0x${string}` },
      fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest',
    })
    const pairs = [...new Map(logs.map(l => {
      const board = l.address.toLowerCase(), markee = (l.args.markee as string).toLowerCase()
      return [`${board}:${markee}`, { board, markee }] as const
    })).values()]
    if (pairs.length === 0) return { byCopy, uncopied, complete: true }
    const owners = await chunkedMulticall(client, pairs.map(p => ({ address: p.markee as `0x${string}`, abi: MarkeeABI, functionName: 'owner' as const })))
    const others = pairs.filter((_, i) => {
      const read = owners[i]
      if (read?.status !== 'success') throw new Error(`owner() failed on ${pairs[i].markee}`)
      return (read.result as string).toLowerCase() !== owner
    })
    if (others.length === 0) return { byCopy, uncopied, complete: true }
    const nowSec = Math.floor(Date.now() / 1000)
    const [successors, lifetimes] = await Promise.all([
      markeeSuccessors(client, others.map(p => p.markee), [BOARD_MIGRATORS.STREAMING]),
      Promise.all(others.map(p => readLifetimeStreamed(p.board, p.markee, owner))),
    ])
    others.forEach((p, i) => {
      const wei = netStreamedWei(lifetimes[i], nowSec)
      const copy = successors.get(p.markee)
      if (copy) byCopy.set(copy, (byCopy.get(copy) ?? 0n) + wei)
      else uncopied += wei
    })
    return { byCopy, uncopied, complete: true }
  } catch (e) {
    console.warn('[account/funded] legacy streams read failed', e)
    return { byCopy: new Map(), uncopied: 0n, complete: false }
  }
}

async function streamingFundedRows(
  client: ReturnType<typeof getClient>,
  owner: string,
  boards: Board[],
): Promise<FundedMessage[]> {
  const backedResults = await chunkedMulticall(
    client,
    boards.map(lb => ({
      address: lb.address as `0x${string}`,
      abi: StreamingLeaderboardABI,
      functionName: 'backerMarkee' as const,
      args: [owner as `0x${string}`] as const,
    })),
  )

  const backed = boards
    .map((lb, i) => ({ lb, markee: (backedResults[i]?.result as string | undefined)?.toLowerCase() }))
    .filter((b): b is { lb: Board; markee: string } =>
      !!b.markee && b.markee !== '0x0000000000000000000000000000000000000000')

  if (backed.length === 0) return []

  const [detailResults, positions] = await Promise.all([
    chunkedMulticall(
      client,
      backed.flatMap(b => [
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'message' as const },
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'name' as const },
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'owner' as const },
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'totalFundsAdded' as const },
      ]),
    ),
    fetchBackerPositions(
      owner,
      backed.map(b => b.lb.address),
      STREAMING_BASE.ethx,
      BigInt(Math.floor(Date.now() / 1000)),
    ).catch(() => new Map<string, BackerPosition>()),
  ])

  return backed
    .map((b, i) => {
      const o = i * 4
      const markeeOwner = (detailResults[o + 2]?.result as string | undefined)?.toLowerCase()
      // Markees the wallet owns belong in "bought", not "funded"
      if (markeeOwner === owner) return null
      const totalFundsAdded = (detailResults[o + 3]?.result as bigint) ?? 0n
      const pos = positions.get(b.lb.address.toLowerCase())
      const contributed = pos?.contributed ?? 0n
      const isTop = b.lb.topMarkeeAddress?.toLowerCase() === b.markee
      return {
        address: b.markee,
        message: (detailResults[o]?.result as string) ?? '',
        name: (detailResults[o + 1]?.result as string) ?? '',
        totalFundsAdded: totalFundsAdded.toString(),
        totalContributed: contributed.toString(),
        strategyId: b.lb.address,
        strategyName: b.lb.name ?? 'Unknown Leaderboard',
        isTop,
        topFundsRaw: b.lb.topFundsAddedRaw ?? '0',
        strategy: 'streaming' as const,
        rank: isTop ? 1 : null,
        flowRateRaw: (pos?.rate ?? 0n).toString(),
        platform: b.lb.platform ?? null,
        admin: b.lb.admin ?? null,
        verifiedUrls: b.lb.verifiedUrls ?? [],
        linkedFiles: b.lb.linkedFiles ?? [],
        siteUrl: b.lb.siteUrl ?? null,
        repoFullName: b.lb.repoFullName ?? null,
        repoHtmlUrl: b.lb.repoHtmlUrl ?? null,
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = internalOrigin()
  const owner = searchParams.get('owner')?.toLowerCase()
  if (!owner || !/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
  }
  if (await readRateLimited(request, 'account-funded', 30)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 })
  }

  const client = getClient()
  const headers = internalHeaders()

  // One strategy failing should not blank out the other's positions.
  const [fixed, streaming] = await Promise.all([
    fixedFunded(client, owner, origin, headers).catch(e => { console.warn('[account/funded] lump-sum read failed', e); return null }),
    streamingFunded(client, owner, origin, headers).catch(() => null),
  ])
  const funded = [...(fixed?.rows ?? []), ...(streaming?.rows ?? [])]

  // The wallet's running total put into other people's messages, for the Buyer Hub chart
  // (lib/stats/daily.ts). Skipped when either read failed, so a partial read can't look like a refund,
  // and for wallets that have never funded anything.
  // Includes what was streamed on legacy boards to messages the wallet no longer backs (no row).
  const total = funded.reduce((sum, m) => sum + BigInt(m.totalContributed || '0'), 0n) + (streaming?.legacyOnly ?? 0n)
  if (fixed?.complete && streaming?.complete && total > 0n) {
    await snapshotTotals([{ key: fundedSnapshotKey(owner), total }]).catch(e => console.error('[account/funded] snapshot failed', e))
  }

  return NextResponse.json({ funded: await withWinTimes(funded) })
}
