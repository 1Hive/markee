import 'server-only'
import { kv } from '@vercel/kv'
import { parseAbiItem } from 'viem'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'
import { observeMessage, type MessageObservation, type ModerationItem } from '@/lib/moderation/queue'
import {
  BASELINE_KEY, CURSORS_KEY, boardMarkeesKey, flagKey, getModerationClient, itemKey, listModeratedBoards, pendingKey, readFlagged, readItems,
} from '@/lib/moderation/server'

const BOARD_EVENTS = [
  parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name, uint256 amount)'),
  parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name)'),
  parseAbiItem('event MarkeeMigratedFromLegacy(address indexed newMarkeeAddress, address indexed oldMarkeeAddress, address indexed owner, uint256 historicalFunds)'),
  parseAbiItem('event MarkeeRegistered(address indexed markeeAddress, address indexed pool)'),
  parseAbiItem('event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage)'),
] as const

// Streaming markees accept setMessage from their owner directly, which only the markee itself logs.
const MARKEE_MESSAGE_CHANGED = parseAbiItem('event MessageChanged(string newMessage, address indexed changedBy)')

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const ADDRESS_CHUNK = 200
const READ_CHUNK = 50

type Client = ReturnType<typeof getModerationClient>

interface Touch {
  markee: string
  board: string
  blockNumber: bigint
  logIndex: number
  txHash: string
}

export interface ScanReport {
  boards: number
  toBlock: string
  touched: number
  queued: number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function markeeOf(log: { eventName: string; args: Record<string, unknown> }): string | undefined {
  const addr = log.eventName === 'MarkeeMigratedFromLegacy' ? log.args.newMarkeeAddress : log.args.markeeAddress
  return typeof addr === 'string' ? addr.toLowerCase() : undefined
}

type ScannedBoard = { address: string; strategy: string; fromBlock: bigint }

async function collectTouches(client: Client, boards: ScannedBoard[], toBlock: bigint) {
  const touches = new Map<string, Touch>()
  const record = (t: Touch) => {
    const prev = touches.get(t.markee)
    if (!prev || t.blockNumber > prev.blockNumber || (t.blockNumber === prev.blockNumber && t.logIndex > prev.logIndex)) {
      touches.set(t.markee, t)
    }
  }

  const byFromBlock = new Map<bigint, ScannedBoard[]>()
  boards.forEach(b => byFromBlock.set(b.fromBlock, [...(byFromBlock.get(b.fromBlock) ?? []), b]))
  const groups = [...byFromBlock.entries()].map(([fromBlock, members]) => ({ fromBlock, members }))

  const boardLogs = (await Promise.all(groups.flatMap(({ fromBlock, members }) =>
    chunk(members.map(b => b.address as `0x${string}`), ADDRESS_CHUNK).map(address =>
      client.getLogs({ address, events: BOARD_EVENTS, fromBlock, toBlock }),
    ),
  ))).flat()

  const discovered = new Map<string, Set<string>>()
  for (const log of boardLogs) {
    const markee = markeeOf(log as unknown as { eventName: string; args: Record<string, unknown> })
    if (!markee) continue
    const board = log.address.toLowerCase()
    record({ markee, board, blockNumber: log.blockNumber ?? 0n, logIndex: log.logIndex ?? 0, txHash: log.transactionHash ?? '' })
    if (!discovered.has(board)) discovered.set(board, new Set())
    discovered.get(board)!.add(markee)
  }

  const streamingBoards = boards.filter(b => b.strategy === 'streaming')
  const known = await Promise.all(streamingBoards.map(b => kv.smembers(boardMarkeesKey(b.address))))
  const boardOfMarkee = new Map<string, string>()
  streamingBoards.forEach((b, i) => (known[i] ?? []).forEach(m => boardOfMarkee.set(m, b.address)))

  const markeeLogs = (await Promise.all(groups.flatMap(({ fromBlock, members }) => {
    const streamingMembers = new Set(members.filter(b => b.strategy === 'streaming').map(b => b.address))
    const markees = [...boardOfMarkee].filter(([, board]) => streamingMembers.has(board)).map(([m]) => m as `0x${string}`)
    return chunk(markees, ADDRESS_CHUNK).map(address =>
      client.getLogs({ address, event: MARKEE_MESSAGE_CHANGED, fromBlock, toBlock }),
    )
  }))).flat()
  for (const log of markeeLogs) {
    const markee = log.address.toLowerCase()
    const board = boardOfMarkee.get(markee)
    if (!board) continue
    record({ markee, board, blockNumber: log.blockNumber ?? 0n, logIndex: log.logIndex ?? 0, txHash: log.transactionHash ?? '' })
  }

  return { touches: [...touches.values()], discovered }
}

async function observe(client: Client, touches: Touch[], toBlock: bigint): Promise<MessageObservation[]> {
  const reads = (await Promise.all(
    chunk(touches, READ_CHUNK).map(slice =>
      client.multicall({
        blockNumber: toBlock,
        contracts: slice.flatMap(t => MARKEE_ABI.map(fn => ({ address: t.markee as `0x${string}`, abi: MARKEE_ABI, functionName: fn.name }))),
      }),
    ),
  )).flat()

  const blockNumbers = [...new Set(touches.map(t => t.blockNumber))]
  const timestamps = new Map<bigint, number>()
  for (const slice of chunk(blockNumbers, 20)) {
    const blocks = await Promise.all(slice.map(blockNumber => client.getBlock({ blockNumber })))
    blocks.forEach(b => timestamps.set(b.number, Number(b.timestamp)))
  }

  return touches.map((t, i) => ({
    markee: t.markee,
    board: t.board,
    message: (reads[i * 3]?.result as string | undefined) ?? '',
    name: (reads[i * 3 + 1]?.result as string | undefined) ?? '',
    author: ((reads[i * 3 + 2]?.result as string | undefined) ?? '').toLowerCase(),
    blockNumber: t.blockNumber.toString(),
    txHash: t.txHash,
    at: timestamps.get(t.blockNumber) ?? 0,
  }))
}

// Scans every listed board from its own cursor and folds each touched markee's current on-chain text
// into its moderation item. Cursors are per board, so a board the listing routes miss on one run (or
// list for the first time) is scanned from where it left off once it shows up, and they only advance
// after every write lands.
export async function runModerationScan(): Promise<ScanReport> {
  const client = getModerationClient()
  const [listed, latest] = await Promise.all([listModeratedBoards(), client.getBlockNumber()])
  await kv.set(BASELINE_KEY, latest.toString(), { nx: true })
  const baseline = BigInt((await kv.get<string>(BASELINE_KEY)) ?? latest.toString())
  const cursors = listed.length > 0
    ? await kv.hmget<Record<string, string>>(CURSORS_KEY, ...listed.map(b => b.address))
    : null
  const boards = listed
    .map(b => ({ ...b, fromBlock: cursors?.[b.address] ? BigInt(cursors[b.address]) + 1n : BASE_MARKEE_EVENTS_FROM_BLOCK }))
    .filter(b => b.fromBlock <= latest)

  const report: ScanReport = { boards: boards.length, toBlock: latest.toString(), touched: 0, queued: 0 }
  if (boards.length === 0) return report

  const { touches, discovered } = await collectTouches(client, boards, latest)
  report.touched = touches.length

  if (touches.length > 0) {
    const [observations, prevs, flagged] = await Promise.all([
      observe(client, touches, latest),
      readItems(touches.map(t => t.markee)),
      readFlagged(),
    ])
    const flaggedSet = new Set(flagged)
    const pipeline = kv.pipeline()
    let writes = discovered.size
    observations.forEach((obs, i) => {
      const next: ModerationItem | null = observeMessage(prevs[i] ?? null, obs, {
        flagged: flaggedSet.has(flagKey(obs.markee)),
        preexisting: BigInt(obs.blockNumber) <= baseline,
      })
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
    discovered.forEach((markees, board) => pipeline.sadd(boardMarkeesKey(board), ...([...markees] as [string, ...string[]])))
    if (writes > 0) await pipeline.exec()
  }

  await kv.hset(CURSORS_KEY, Object.fromEntries(boards.map(b => [b.address, latest.toString()])))
  return report
}
