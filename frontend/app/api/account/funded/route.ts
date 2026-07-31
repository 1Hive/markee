// GET /api/account/funded?owner=0x...
// Returns markees the wallet has funded but does not own.
import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import { fetchBackerPositions, type BackerPosition } from '@/lib/streaming/subgraph'

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

// Emitted by individual markee contracts when anyone adds funds
const FUNDS_ADDED_EVENT = parseAbiItem(
  'event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)'
)

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org', {
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
}

type Board = {
  address: string
  name: string
  topMarkeeAddress: string | null
  topFundsAddedRaw: string
}

// Lump-sum boards: a backer is whoever emitted FundsAdded on a markee.
async function fixedFunded(
  client: ReturnType<typeof getClient>,
  owner: string,
  origin: string,
  headers: HeadersInit,
): Promise<FundedMessage[]> {
  const [sfData, ghData, oiData] = await Promise.all([
    fetch(`${origin}/api/superfluid/leaderboards`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/github/leaderboards`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/openinternet/leaderboards`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  const leaderboards: Board[] = [
    ...(sfData?.leaderboards ?? []),
    ...(ghData?.leaderboards ?? []),
    ...(oiData?.leaderboards ?? []),
  ].filter((lb: any) => lb.markeeCount > 0)

  if (leaderboards.length === 0) return []

  // Get all markee addresses from every leaderboard
  const markeeListResults = await chunkedMulticall(
    client,
    leaderboards.map(lb => ({
      address: lb.address as `0x${string}`,
      abi: LEADERBOARD_ABI,
      functionName: 'getMarkees' as const,
      args: [0n, 1000n] as const,
    })),
  )

  type Entry = { lbIndex: number; markeeAddress: `0x${string}` }
  const entries: Entry[] = []
  for (let i = 0; i < leaderboards.length; i++) {
    const addrs = (markeeListResults[i]?.result as string[]) ?? []
    for (const addr of addrs) {
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        entries.push({ lbIndex: i, markeeAddress: addr as `0x${string}` })
      }
    }
  }

  if (entries.length === 0) return []

  const allMarkeeAddresses = [...new Set(entries.map(e => e.markeeAddress))]

  // Query FundsAdded on all markee contracts filtered by addedBy == owner
  const fundsAddedLogs = await client.getLogs({
    address: allMarkeeAddresses,
    event: FUNDS_ADDED_EVENT,
    args: { addedBy: owner as `0x${string}` },
    fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
    toBlock: 'latest',
  }).catch(() => [])

  if (fundsAddedLogs.length === 0) return []

  // Aggregate total contributed by user per markee
  const markeeContribs = new Map<string, bigint>()
  for (const log of fundsAddedLogs) {
    const addr = log.address.toLowerCase()
    const amount = (log.args as { amount: bigint }).amount ?? 0n
    markeeContribs.set(addr, (markeeContribs.get(addr) ?? 0n) + amount)
  }

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

  if (externalAddrs.length === 0) return []

  // Fetch message, name, totalFundsAdded for externally-funded markees
  const detailResults = await chunkedMulticall(
    client,
    externalAddrs.flatMap(addr => [
      { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'message' as const },
      { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'name' as const },
      { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'totalFundsAdded' as const },
    ]),
  )

  // Build markee → leaderboard lookup
  const markeeToLb = new Map<string, typeof leaderboards[0]>()
  for (const e of entries) {
    const key = e.markeeAddress.toLowerCase()
    if (!markeeToLb.has(key)) markeeToLb.set(key, leaderboards[e.lbIndex])
  }

  return externalAddrs.map((addr, i) => {
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
    }
  })
}

// Streaming boards: a backer holds one position per board, recorded on-chain as backerMarkee.
// There are no FundsAdded logs to scan, and the amount put in is the net ETHx streamed.
async function streamingFunded(
  client: ReturnType<typeof getClient>,
  owner: string,
  origin: string,
  headers: HeadersInit,
): Promise<FundedMessage[]> {
  const data = await fetch(`${origin}/api/streaming/leaderboards`, { headers })
    .then(r => r.ok ? r.json() : null).catch(() => null)

  const boards: Board[] = (data?.leaderboards ?? []).filter((lb: any) => lb.markeeCount > 0)
  if (boards.length === 0) return []

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
      const contributed = positions.get(b.lb.address.toLowerCase())?.contributed ?? 0n
      return {
        address: b.markee,
        message: (detailResults[o]?.result as string) ?? '',
        name: (detailResults[o + 1]?.result as string) ?? '',
        totalFundsAdded: totalFundsAdded.toString(),
        totalContributed: contributed.toString(),
        strategyId: b.lb.address,
        strategyName: b.lb.name ?? 'Unknown Leaderboard',
        isTop: b.lb.topMarkeeAddress?.toLowerCase() === b.markee,
        topFundsRaw: b.lb.topFundsAddedRaw ?? '0',
      }
    })
    .filter((m): m is FundedMessage => m !== null)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = internalOrigin()
  const owner = searchParams.get('owner')?.toLowerCase()
  if (!owner || !/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
  }

  const client = getClient()
  const headers = internalHeaders()

  // One strategy failing should not blank out the other's positions.
  const [fixed, streaming] = await Promise.all([
    fixedFunded(client, owner, origin, headers).catch(() => []),
    streamingFunded(client, owner, origin, headers).catch(() => []),
  ])

  return NextResponse.json({ funded: [...fixed, ...streaming] })
}
