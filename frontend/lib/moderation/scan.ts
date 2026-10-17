import 'server-only'
import { kv } from '@vercel/kv'
import { FACTORIES, STREAMING_ENABLED, STREAMING_FACTORY, V13_LEADERBOARDS } from '@/lib/contracts/addresses'
import { SCOPES, isPendingIn, observeMessage, type MessageObservation } from '@/lib/moderation/queue'
import { BASELINE_KEY, flagKey, getModerationClient, itemKey, pendingKey, readAllFlagged, readItems } from '@/lib/moderation/server'

const PAGE_ABI = [
  { inputs: [], name: 'leaderboardCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getLeaderboards', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getMarkees', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees', outputs: [{ type: 'address[]' }, { type: 'uint256[]' }], stateMutability: 'view', type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const PAGE_SIZE = 1000n
// Per board, the newest RECENT_MARKEES (markees are append-only, so these are the latest created)
// plus the TOP_MARKEES currently ranked highest. The top read covers an old markee that gets funded
// back to the top and then edited, since the top messages are the ones sites actually show.
const RECENT_MARKEES = 1000n
const TOP_MARKEES = 50n
const BOARD_CHUNK = 500
const MARKEE_CHUNK = 500
const WRITE_CHUNK = 500
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type Client = ReturnType<typeof getModerationClient>
type CallResult = { status: 'success' | 'failure'; result?: unknown }

export interface ScanReport {
  boards: number
  markees: number
  queued: number
  baseline: boolean
  // Board address → count of newly queued pending items this run (empty when baseline or no new items).
  pendingByBoard: Record<string, number>
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function multicallChunked(client: Client, contracts: unknown[], size: number, blockNumber: bigint): Promise<CallResult[]> {
  if (contracts.length === 0) return []
  const results = await Promise.all(
    chunk(contracts, size).map(slice =>
      client.multicall({ contracts: slice as Parameters<Client['multicall']>[0]['contracts'], blockNumber, batchSize: 0 }),
    ),
  )
  return results.flat() as CallResult[]
}

function addresses(result: CallResult | undefined): string[] {
  if (result?.status !== 'success' || !Array.isArray(result.result)) return []
  return (result.result as string[]).filter(a => a && a !== ZERO_ADDRESS).map(a => a.toLowerCase())
}

function count(result: CallResult | undefined): bigint | null {
  return result?.status === 'success' && typeof result.result === 'bigint' ? result.result : null
}

const call = (address: string, functionName: (typeof PAGE_ABI)[number]['name'], args: readonly bigint[] = []) =>
  ({ address: address as `0x${string}`, abi: PAGE_ABI, functionName, args })

// The same boards the listing routes show: the v1.3 factories (earlier versions were migrated
// into them), the migrated partner boards, and the streaming factory. Every page is read.
async function listBoards(client: Client, blockNumber: bigint): Promise<string[]> {
  const factories: string[] = [...Object.values(FACTORIES), ...(STREAMING_ENABLED ? [STREAMING_FACTORY] : [])]
  const counts = await multicallChunked(client, factories.map(f => call(f, 'leaderboardCount')), BOARD_CHUNK, blockNumber)
  const pageCalls = factories.flatMap((f, i) => {
    const counted = count(counts[i])
    if (counted === null) console.warn(`[moderation/scan] leaderboardCount failed on ${f}, reading only its first page`)
    const total = counted ?? PAGE_SIZE
    const offsets: bigint[] = []
    for (let offset = 0n; offset < total; offset += PAGE_SIZE) offsets.push(offset)
    return offsets.map(offset => call(f, 'getLeaderboards', [offset, PAGE_SIZE]))
  })
  const pages = await multicallChunked(client, pageCalls, BOARD_CHUNK, blockNumber)
  const boards = [...pages.flatMap(addresses), ...Object.values(V13_LEADERBOARDS).map(b => b.toLowerCase())]
  return [...new Set(boards)]
}

async function listMarkees(client: Client, boards: string[], blockNumber: bigint): Promise<{ board: string; markee: string }[]> {
  const [counts, tops] = await Promise.all([
    multicallChunked(client, boards.map(b => call(b, 'markeeCount')), BOARD_CHUNK, blockNumber),
    multicallChunked(client, boards.map(b => call(b, 'getTopMarkees', [TOP_MARKEES])), BOARD_CHUNK, blockNumber),
  ])
  const recent = await multicallChunked(
    client,
    boards.map((b, i) => {
      const total = count(counts[i]) ?? 0n
      return call(b, 'getMarkees', [total > RECENT_MARKEES ? total - RECENT_MARKEES : 0n, RECENT_MARKEES])
    }),
    BOARD_CHUNK,
    blockNumber,
  )
  return boards.flatMap((board, i) => {
    const top = tops[i]
    const topAddresses = top?.status === 'success' ? addresses({ status: 'success', result: (top.result as unknown[])[0] }) : []
    return [...new Set([...addresses(recent[i]), ...topAddresses])].map(markee => ({ board, markee }))
  })
}

// Reads current markee text with batched eth_calls (no log scans) and diffs it against the stored
// items. A markee seen for the first time is a new message, changed text is an edit. The first run
// records the baseline, so everything already live then starts approved.
export async function runModerationScan(): Promise<ScanReport> {
  const client = getModerationClient()
  const [block, baseline] = await Promise.all([client.getBlock({ blockTag: 'latest' }), kv.get(BASELINE_KEY)])
  const isBaseline = !baseline

  const boards = await listBoards(client, block.number)
  const pairs = await listMarkees(client, boards, block.number)

  const reads = await multicallChunked(
    client,
    pairs.flatMap(p => MARKEE_ABI.map(fn => ({ address: p.markee as `0x${string}`, abi: MARKEE_ABI, functionName: fn.name }))),
    MARKEE_CHUNK * MARKEE_ABI.length,
    block.number,
  )

  // A failed name read keeps the stored name, so it never reads as a rename.
  const observations: (Omit<MessageObservation, 'name'> & { name: string | null })[] = []
  pairs.forEach((p, i) => {
    const [message, name, owner] = reads.slice(i * 3, i * 3 + 3)
    if (message?.status !== 'success') return
    observations.push({
      markee: p.markee,
      board: p.board,
      message: message.result as string,
      name: name?.status === 'success' ? (name.result as string) : null,
      author: owner?.status === 'success' ? (owner.result as string).toLowerCase() : '',
      blockNumber: block.number.toString(),
      at: Number(block.timestamp),
    })
  })

  const unnamed = observations.filter(o => o.name === null).length
  if (unnamed > 0) console.warn(`[moderation/scan] name read failed for ${unnamed} markees, kept their stored names`)

  const report: ScanReport = { boards: boards.length, markees: observations.length, queued: 0, baseline: isBaseline, pendingByBoard: {} }
  if (observations.length === 0) return report

  const [prevs, flagged] = await Promise.all([readItems(observations.map(o => o.markee)), readAllFlagged()])
  const flaggedSets = { board: new Set(flagged.board), site: new Set(flagged.site) }
  const changed = observations.flatMap((obs, i) => {
    const key = flagKey(obs.markee)
    const prev = prevs[i] ?? null
    const next = observeMessage(prev, { ...obs, name: obs.name ?? prev?.name ?? '' }, {
      flagged: { board: flaggedSets.board.has(key), site: flaggedSets.site.has(key) },
      preexisting: isBaseline,
    })
    return next ? [next] : []
  })
  // Upstash caps a request body, and a baseline run writes every markee at once.
  for (const batch of chunk(changed, WRITE_CHUNK)) {
    const pipeline = kv.pipeline()
    batch.forEach(next => {
      pipeline.set(itemKey(next.markee), next)
      SCOPES.forEach(scope => {
        if (next.reviews[scope].status === 'pending') pipeline.zadd(pendingKey(scope, next.board), { score: next.at, member: next.markee })
        else pipeline.zrem(pendingKey(scope, next.board), next.markee)
      })
    })
    await pipeline.exec()
  }
  const pendingItems = changed.filter(next => isPendingIn(next, SCOPES))
  report.queued = pendingItems.length
  if (!isBaseline) {
    for (const item of pendingItems) {
      report.pendingByBoard[item.board] = (report.pendingByBoard[item.board] ?? 0) + 1
    }
  }
  if (isBaseline) await kv.set(BASELINE_KEY, block.number.toString())
  return report
}
