import 'server-only'
import { autoEnabled, evaluateObserved } from './automatic'
import { kv } from '@vercel/kv'
import { parseAbi } from 'viem'
import { FACTORIES, STREAMING_ENABLED, STREAMING_FACTORY, V13_LEADERBOARDS } from '@/lib/contracts/addresses'
import { SCOPES, isPendingIn, observeMessage, type MessageObservation } from '@/lib/moderation/queue'
import { BASELINE_KEY, flagKey, getModerationClient, itemKey, pendingKey, readAllFlagged, readItems } from '@/lib/moderation/server'
import { recordActivity, type BoardTop } from '@/lib/activity/server'
import { notifyLowBudgets, notifyStatusChanges } from '@/lib/notifications/buyer'
import { updateTopHistories } from '@/lib/leaderboard/topHistory'

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

const STRATEGY_ABI = [
  { inputs: [], name: 'pricingStrategy', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

// Emitted by the markee contract itself on every v1.x fixed and streaming board.
const EDIT_EVENTS = parseAbi([
  'event MessageChanged(string newMessage, address indexed changedBy)',
  'event NameChanged(string newName, address indexed changedBy)',
])
const LOG_CURSOR_KEY = 'moderation:scan:logBlock'
const LOG_RANGE = 2_000n
// About 11 hours of Base blocks. A longer outage only loses edits outside the recent/top window.
const MAX_LOG_CATCHUP = 20_000n

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

export const scanDeps = {
  client: getModerationClient, recordActivity, notifyLowBudgets, notifyStatusChanges, updateTopHistories,
  get: <T>(key: string) => kv.get<T>(key),
  set: (key: string, value: unknown) => kv.set(key, value),
  mget: <T extends unknown[]>(...keys: string[]) => kv.mget<T>(...keys),
  pipeline: () => kv.pipeline(), readItems, readAllFlagged,
}
type Client = ReturnType<typeof getModerationClient>
interface BoardScanState { count: string; ids: string[]; reconciledAt: number }
const boardStateKey = (board: string) => `moderation:scan:v2:${board}`
const RECONCILE_SECONDS = 3600
type CallResult = { status: 'success' | 'failure'; result?: unknown }

export interface ScanReport {
  boards: number
  markees: number
  queued: number
  baseline: boolean
  // Markees outside the recent/top window read only because an edit event named them.
  fromLogs: number
  activity: number
  // Message Status Change and Low Budget emails sent this run (daily round-up ones are queued, not counted).
  buyerEmails?: number
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
  const results: CallResult[][] = []
  // Bound concurrency: a large network must not launch every multicall at once.
  for (const slice of chunk(contracts, size)) {
    results.push(await client.multicall({ contracts: slice as Parameters<Client['multicall']>[0]['contracts'], blockNumber, batchSize: 0 }) as CallResult[])
  }
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
async function listBoards(client: Client, blockNumber: bigint): Promise<{ boards: string[]; streaming: Set<string> }> {
  const factories: string[] = [...Object.values(FACTORIES), ...(STREAMING_ENABLED ? [STREAMING_FACTORY] : [])]
  const counts = await multicallChunked(client, factories.map(f => call(f, 'leaderboardCount')), BOARD_CHUNK, blockNumber)
  const pageOwners: string[] = []
  const pageCalls = factories.flatMap((f, i) => {
    const counted = count(counts[i])
    if (counted === null) console.warn(`[moderation/scan] leaderboardCount failed on ${f}, reading only its first page`)
    const total = counted ?? PAGE_SIZE
    const offsets: bigint[] = []
    for (let offset = 0n; offset < total; offset += PAGE_SIZE) offsets.push(offset)
    offsets.forEach(() => pageOwners.push(f))
    return offsets.map(offset => call(f, 'getLeaderboards', [offset, PAGE_SIZE]))
  })
  const pages = await multicallChunked(client, pageCalls, BOARD_CHUNK, blockNumber)
  const boards = [...pages.flatMap(addresses), ...Object.values(V13_LEADERBOARDS).map(b => b.toLowerCase())]
  const streaming = new Set(STREAMING_ENABLED ? pages.flatMap((p, i) => pageOwners[i] === STREAMING_FACTORY ? addresses(p) : []) : [])
  return { boards: [...new Set(boards)], streaming }
}

export async function listMarkees(client: Client, boards: string[], blockNumber: bigint, at: number) {
  const stored = boards.length ? await scanDeps.mget<(BoardScanState | null)[]>(...boards.map(boardStateKey)) : []
  const reconcile = new Set(boards.filter((_, i) => !stored[i] || at - stored[i]!.reconciledAt >= RECONCILE_SECONDS))
  const [counts, tops] = await Promise.all([
    multicallChunked(client, boards.map(b => call(b, 'markeeCount')), BOARD_CHUNK, blockNumber),
    multicallChunked(client, boards.map(b => call(b, 'getTopMarkees', [TOP_MARKEES])), BOARD_CHUNK, blockNumber),
  ])
  const offsets = boards.map((board, i) => {
    const total = count(counts[i])
    if (total === null) throw new Error('Moderation count read failed; retaining checkpoints')
    const previous = stored[i] ? BigInt(stored[i]!.count) : null
    if (previous !== null && total < previous) reconcile.add(board)
    return reconcile.has(board) ? (total > RECENT_MARKEES ? total - RECENT_MARKEES : 0n) : previous!
  })
  const changed = boards.map((board, i) => ({ board, i })).filter(({ i }) => offsets[i] < count(counts[i])!)
  const recentReads = await multicallChunked(client, changed.map(({ board, i }) => call(board, 'getMarkees', [offsets[i], RECENT_MARKEES])), BOARD_CHUNK, blockNumber)
  const recent = new Map(changed.map(({ board }, i) => {
    if (recentReads[i]?.status !== 'success') throw new Error('Moderation page read failed; retaining checkpoints')
    return [board, addresses(recentReads[i])]
  }))
  const states = new Map<string, BoardScanState>()
  const boardTops = new Map<string, BoardTop>()
  const pairs = boards.flatMap((board, i) => {
    const top = tops[i]
    if (top?.status !== 'success') throw new Error('Moderation top read failed; retaining checkpoints')
    const [topList, values] = top?.status === 'success' ? (top.result as [string[], bigint[]]) : [[], []]
    const topAddresses = addresses({ status: 'success', result: topList })
    if (topList[0] && topList[0] !== ZERO_ADDRESS) {
      boardTops.set(board, {
        markee: topList[0].toLowerCase(),
        value: values[0] ?? 0n,
        values: new Map(topList.map((m, j) => [m.toLowerCase(), values[j] ?? 0n])),
      })
    }
    const ids = (reconcile.has(board) ? recent.get(board) ?? [] : [...(stored[i]?.ids ?? []), ...(recent.get(board) ?? [])]).slice(-Number(RECENT_MARKEES))
    // Advance only through successfully fetched pages, never past a backlog.
    const total = count(counts[i])!
    const scanned = offsets[i] + BigInt(recent.get(board)?.length ?? 0)
    const state = { count: (scanned < total ? scanned : total).toString(), ids, reconciledAt: reconcile.has(board) ? at : stored[i]!.reconciledAt }
    if (JSON.stringify(state) !== JSON.stringify(stored[i])) states.set(board, state)
    return [...new Set([...ids, ...topAddresses])].map(markee => ({ board, markee }))
  })
  return { pairs, tops: boardTops, states, reconcile }
}

// The recent/top window misses an older markee edited deep in a busy board; its edit event doesn't.
// Scans every log since the last run by event signature alone (no address filter), so the caller
// keeps only markees whose board is one it lists. Returns null when the logs couldn't be read, so
// the cursor stays put and the next run retries the same range.
async function editedMarkees(client: Client, toBlock: bigint): Promise<string[] | null> {
  const cursor = await scanDeps.get<string>(LOG_CURSOR_KEY)
  if (!cursor) return []
  let from = BigInt(cursor) > 100n ? BigInt(cursor) - 100n : 0n
  if (toBlock - from > MAX_LOG_CATCHUP) {
    console.warn(`[moderation/scan] edit log scan is ${toBlock - from} blocks behind, scanning only the last ${MAX_LOG_CATCHUP}`)
    from = toBlock - MAX_LOG_CATCHUP
  }
  const ranges: [bigint, bigint][] = []
  for (let start = from; start <= toBlock; start += LOG_RANGE) {
    ranges.push([start, start + LOG_RANGE - 1n < toBlock ? start + LOG_RANGE - 1n : toBlock])
  }
  try {
    const logs = []
    for (const [fromBlock, to] of ranges) logs.push(await client.getLogs({ events: EDIT_EVENTS, fromBlock, toBlock: to }))
    return [...new Set(logs.flat().map(l => l.address.toLowerCase()))]
  } catch (e) {
    console.warn('[moderation/scan] edit log scan failed, will retry next run', e)
    return null
  }
}

// Reads current markee text with batched eth_calls and diffs it against the stored items. Which
// markees get read: each board's newest and top ones, plus any named by an edit event since the
// last run (see editedMarkees). A markee seen for the first time is a new message, changed text
// is an edit. The first run records the baseline, so everything already live then starts approved.
export async function runModerationScan(): Promise<ScanReport> {
  const client = scanDeps.client()
  const [block, baseline] = await Promise.all([client.getBlock({ blockTag: 'latest' }), scanDeps.get(BASELINE_KEY)])
  const isBaseline = !baseline

  const { boards, streaming } = await listBoards(client, block.number)
  const [{ pairs, tops, states, reconcile }, logged] = await Promise.all([listMarkees(client, boards, block.number, Number(block.timestamp)), editedMarkees(client, block.number)])

  const known = new Set(pairs.map(p => p.markee))
  const extra = (logged ?? []).filter(m => !known.has(m))
  let fromLogs = 0
  if (extra.length) {
    const boardSet = new Set(boards)
    const strategies = await multicallChunked(
      client,
      extra.map(m => ({ address: m as `0x${string}`, abi: STRATEGY_ABI, functionName: 'pricingStrategy' as const })),
      MARKEE_CHUNK,
      block.number,
    )
    extra.forEach((markee, i) => {
      const board = strategies[i]?.status === 'success' ? String(strategies[i].result).toLowerCase() : null
      if (board && boardSet.has(board)) { pairs.push({ board, markee }); fromLogs++ }
    })
  }

  const previous = pairs.length ? await scanDeps.readItems(pairs.map(p => p.markee)) : []
  const editSet = new Set(logged ?? [])
  const needsRead = pairs.map((p, i) => ({ ...p, i })).filter(p => !previous[p.i] || isBaseline || logged === null || reconcile.has(p.board) || editSet.has(p.markee))
  const reads = await multicallChunked(
    client,
    needsRead.flatMap(p => MARKEE_ABI.map(fn => ({ address: p.markee as `0x${string}`, abi: MARKEE_ABI, functionName: fn.name }))),
    MARKEE_CHUNK * MARKEE_ABI.length,
    block.number,
  )
  // Any incomplete read retains the old cursor and board counts for a safe retry.
  if (reads.some(r => r.status !== 'success')) throw new Error('Moderation message read failed; retaining checkpoints')
  // Keep authors of ranked messages current for activity notifications without
  // rereading all message text or scanning Base-wide OwnershipTransferred logs.
  const ranked = new Set([...tops.values()].flatMap(top => [...top.values.keys()]))
  const fullIds = new Set(needsRead.map(p => p.markee))
  const ownerIds = [...ranked].filter(id => !fullIds.has(id))
  const ownerReads = await multicallChunked(client, ownerIds.map(address => ({ address: address as `0x${string}`, abi: MARKEE_ABI, functionName: 'owner' })), MARKEE_CHUNK, block.number)
  if (ownerReads.some(r => r.status !== 'success')) throw new Error('Moderation owner read failed; retaining checkpoints')
  const owners = new Map(ownerIds.map((id, i) => [id, String(ownerReads[i].result).toLowerCase()]))
  const fresh = new Map(needsRead.map((p, i) => [p.markee, reads.slice(i * 3, i * 3 + 3)]))
  const observations: (Omit<MessageObservation, 'name'> & { name: string | null })[] = pairs.map((p, i) => {
    const read = fresh.get(p.markee)
    const prior = previous[i]!
    return {
      markee: p.markee, board: p.board,
      message: read ? read[0].result as string : prior.message,
      name: read ? read[1].result as string : prior.name,
      author: read ? String(read[2].result).toLowerCase() : owners.get(p.markee) ?? prior.author,
      blockNumber: block.number.toString(), at: Number(block.timestamp),
    }
  })

  const unnamed = observations.filter(o => o.name === null).length
  if (unnamed > 0) console.warn(`[moderation/scan] name read failed for ${unnamed} markees, kept their stored names`)

  const report: ScanReport = { boards: boards.length, markees: observations.length, queued: 0, baseline: isBaseline, pendingByBoard: {}, fromLogs, activity: 0 }

  const prevs = previous
  const flagged = await scanDeps.readAllFlagged()
  const flaggedSets = { board: new Set(flagged.board), site: new Set(flagged.site) }
  if (autoEnabled()) {
    for (const batch of chunk(observations, 25)) await Promise.all(batch.map(obs => evaluateObserved(obs.markee, obs.message, obs.board, { board: flaggedSets.board.has(flagKey(obs.markee)), site: flaggedSets.site.has(flagKey(obs.markee)) })))
  }
  const changed = observations.flatMap((obs, i) => {
    const key = flagKey(obs.markee)
    const prev = prevs[i] ?? null
    const next = observeMessage(prev, { ...obs, name: obs.name || prev?.name || '' }, {
      flagged: { board: flaggedSets.board.has(key), site: flaggedSets.site.has(key) },
      preexisting: isBaseline,
    })
    return next ? [next] : []
  })
  // Upstash caps a request body, and a baseline run writes every markee at once.
  for (const batch of chunk(changed, WRITE_CHUNK)) {
    const pipeline = scanDeps.pipeline()
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
  if (isBaseline) await scanDeps.set(BASELINE_KEY, block.number.toString())
  for (const [board, state] of states) await scanDeps.set(boardStateKey(board), state)
  if (logged !== null) await scanDeps.set(LOG_CURSOR_KEY, block.number.toString())

  // The feed is secondary to the queue: a failure here never fails the scan.
  try {
    const seen = new Map(observations.map(o => [o.markee, { author: o.author, message: o.message, name: o.name ?? '' }]))
    const edited = isBaseline ? [] : changed.filter(next => next.kind === 'edited')
    const { events, byWallet } = await scanDeps.recordActivity({ tops, streamingBoards: streaming, seen, edited, blockNumber: block.number, at: Number(block.timestamp) })
    report.activity = events
    if (!isBaseline) report.buyerEmails = await scanDeps.notifyStatusChanges(byWallet)
  } catch (e) {
    console.warn('[moderation/scan] activity recording failed', e)
  }
  // Also secondary, and each guarded on its own: Low Budget alerts (throttled to every 30 min inside)
  // and the per-board history of who held #1 that account rows and top-since read.
  try {
    report.buyerEmails = (report.buyerEmails ?? 0) + await scanDeps.notifyLowBudgets([...streaming])
  } catch (e) {
    console.warn('[moderation/scan] low budget check failed', e)
  }
  try {
    await scanDeps.updateTopHistories(client, boards.map(address => ({ address, kind: streaming.has(address) ? 'streaming' : 'sale' })), block.number)
  } catch (e) {
    console.warn('[moderation/scan] top history update failed', e)
  }
  return report
}
