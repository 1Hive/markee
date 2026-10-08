import 'server-only'
import { kv } from '@vercel/kv'
import { FACTORIES, STREAMING_ENABLED, STREAMING_FACTORY, V13_LEADERBOARDS } from '@/lib/contracts/addresses'
import { observeMessage, type MessageObservation } from '@/lib/moderation/queue'
import { BASELINE_KEY, flagKey, getModerationClient, itemKey, pendingKey, readFlagged, readItems } from '@/lib/moderation/server'

const PAGE_ABI = [
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getLeaderboards', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getMarkees', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const PAGE_SIZE = 1000n
const BOARD_CHUNK = 500
const MARKEE_CHUNK = 500
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

type Client = ReturnType<typeof getModerationClient>
type CallResult = { status: string; result?: unknown }

export interface ScanReport {
  boards: number
  markees: number
  queued: number
  baseline: boolean
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function multicallChunked(client: Client, contracts: unknown[], size: number, blockNumber: bigint): Promise<CallResult[]> {
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

// The same boards the listing routes show: the v1.3 factories (earlier versions were migrated
// into them), the migrated partner boards, and the streaming factory.
async function listBoards(client: Client, blockNumber: bigint): Promise<string[]> {
  const factories: string[] = [...Object.values(FACTORIES), ...(STREAMING_ENABLED ? [STREAMING_FACTORY] : [])]
  const pages = await multicallChunked(
    client,
    factories.map(f => ({ address: f as `0x${string}`, abi: PAGE_ABI, functionName: 'getLeaderboards' as const, args: [0n, PAGE_SIZE] as const })),
    BOARD_CHUNK,
    blockNumber,
  )
  const boards = [...pages.flatMap(addresses), ...Object.values(V13_LEADERBOARDS).map(b => b.toLowerCase())]
  return [...new Set(boards)]
}

// Reads every markee's current text with batched eth_calls (no log scans) and diffs it against the
// stored items. A markee seen for the first time is a new message, changed text is an edit. The
// first run records the baseline, so everything already live then starts approved.
export async function runModerationScan(): Promise<ScanReport> {
  const client = getModerationClient()
  const [block, baseline] = await Promise.all([client.getBlock({ blockTag: 'latest' }), kv.get(BASELINE_KEY)])
  const isBaseline = !baseline

  const boards = await listBoards(client, block.number)
  const markeePages = await multicallChunked(
    client,
    boards.map(b => ({ address: b as `0x${string}`, abi: PAGE_ABI, functionName: 'getMarkees' as const, args: [0n, PAGE_SIZE] as const })),
    BOARD_CHUNK,
    block.number,
  )
  const pairs = boards.flatMap((board, i) => addresses(markeePages[i]).map(markee => ({ board, markee })))

  const reads = await multicallChunked(
    client,
    pairs.flatMap(p => MARKEE_ABI.map(fn => ({ address: p.markee as `0x${string}`, abi: MARKEE_ABI, functionName: fn.name }))),
    MARKEE_CHUNK * MARKEE_ABI.length,
    block.number,
  )

  const observations: MessageObservation[] = []
  pairs.forEach((p, i) => {
    const [message, name, owner] = reads.slice(i * 3, i * 3 + 3)
    if (message?.status !== 'success') return
    observations.push({
      markee: p.markee,
      board: p.board,
      message: message.result as string,
      name: name?.status === 'success' ? (name.result as string) : '',
      author: owner?.status === 'success' ? (owner.result as string).toLowerCase() : '',
      blockNumber: block.number.toString(),
      at: Number(block.timestamp),
    })
  })

  const report: ScanReport = { boards: boards.length, markees: observations.length, queued: 0, baseline: isBaseline }
  if (observations.length === 0) return report

  const [prevs, flagged] = await Promise.all([readItems(observations.map(o => o.markee)), readFlagged()])
  const flaggedSet = new Set(flagged)
  const pipeline = kv.pipeline()
  let writes = 0
  observations.forEach((obs, i) => {
    const next = observeMessage(prevs[i] ?? null, obs, { flagged: flaggedSet.has(flagKey(obs.markee)), preexisting: isBaseline })
    if (!next) return
    writes++
    pipeline.set(itemKey(next.markee), next)
    if (next.status === 'pending') {
      pipeline.zadd(pendingKey(next.board), { score: next.at, member: next.markee })
      report.queued++
    } else {
      pipeline.zrem(pendingKey(next.board), next.markee)
    }
  })
  if (writes > 0) await pipeline.exec()
  if (isBaseline) await kv.set(BASELINE_KEY, block.number.toString())
  return report
}
