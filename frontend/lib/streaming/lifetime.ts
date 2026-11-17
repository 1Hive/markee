import { createSnapshotCache } from '@/lib/sdk/snapshot-cache'
import { snapshotStorage } from '@/lib/sdk/cached-display'
import { parseAbiItem, type Address } from 'viem'
import { lifetimeDeps } from '@/lib/streaming/lifetime-deps'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'

const REORG_SAFETY_BLOCKS = 100n

const BACKER_UPDATED = parseAbiItem(
  'event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)',
)
const TOP_CHANGED = parseAbiItem(
  'event TopChanged(address indexed oldTop, address indexed newTop, uint256 newTopRate)',
)

interface Checkpoint {
  streamed: string
  refunded: string
  lastBlock: string
  rate: string
  isTop: boolean
  since: number
}

interface ReplayState {
  streamed: bigint
  refunded: bigint
  rate: bigint
  isTop: boolean
  since: number
}

type ReplayLog =
  | { eventName: 'BackerUpdated'; blockNumber: bigint; logIndex: number; blockTimestamp: number; args: { flowRate: bigint } }
  | { eventName: 'TopChanged'; blockNumber: bigint; logIndex: number; blockTimestamp: number; args: { oldTop: Address; newTop: Address } }


function replay(state: ReplayState, logs: ReplayLog[], markee: string): ReplayState {
  let { streamed, refunded, rate, isTop, since } = state
  for (const log of logs) {
    const at = log.blockTimestamp
    const elapsed = BigInt(Math.max(0, at - since))
    if (elapsed > 0n && rate > 0n) {
      if (isTop) streamed += rate * elapsed
      else refunded += rate * elapsed
    }
    if (log.eventName === 'BackerUpdated') {
      rate = log.args.flowRate
    } else {
      const { oldTop, newTop } = log.args
      if (newTop.toLowerCase() === markee) isTop = true
      else if (oldTop.toLowerCase() === markee) isTop = false
    }
    since = at
  }
  return { streamed, refunded, rate, isTop, since }
}

export interface LifetimeStreamed {
  streamedWei: string
  refundedWei: string
  currentRateWei: string
  isTop: boolean
  since: number
}

export async function readLifetimeStreamed(board: string, markee: string, backer: string): Promise<LifetimeStreamed> {
  board = board.toLowerCase()
  markee = markee.toLowerCase()
  backer = backer.toLowerCase()
  const result = await createSnapshotCache(snapshotStorage.get())(`rental-lifetime:${board}:${markee}:${backer}`, async () => {
    const client = lifetimeDeps.client()
    const key = `streaming:lifetime:${board}:${markee}:${backer}`
    const checkpoint = await lifetimeDeps.get<Checkpoint>(key)

    const fromBlock = checkpoint ? BigInt(checkpoint.lastBlock) + 1n : BASE_MARKEE_EVENTS_FROM_BLOCK
    const currentBlock = await client.getBlockNumber()
    const safeToBlock = currentBlock > REORG_SAFETY_BLOCKS ? currentBlock - REORG_SAFETY_BLOCKS : 0n

    let persisted: ReplayState = checkpoint
      ? { streamed: BigInt(checkpoint.streamed), refunded: BigInt(checkpoint.refunded), rate: BigInt(checkpoint.rate), isTop: checkpoint.isTop, since: checkpoint.since }
      : { streamed: 0n, refunded: 0n, rate: 0n, isTop: false, since: Math.floor(Date.now() / 1000) }
    let display = persisted

    if (fromBlock <= currentBlock) {
      const [backerLogs, promotedLogs, demotedLogs] = await Promise.all([
        client.getLogs({
          address: board as Address, event: BACKER_UPDATED, args: { backer: backer as Address, markee: markee as Address },
          fromBlock, toBlock: currentBlock,
        }),
        client.getLogs({
          address: board as Address, event: TOP_CHANGED, args: { newTop: markee as Address },
          fromBlock, toBlock: currentBlock,
        }),
        client.getLogs({
          address: board as Address, event: TOP_CHANGED, args: { oldTop: markee as Address },
          fromBlock, toBlock: currentBlock,
        }),
      ])

      const merged = [...backerLogs, ...promotedLogs, ...demotedLogs].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1
        return a.logIndex < b.logIndex ? -1 : a.logIndex > b.logIndex ? 1 : 0
      })

      if (merged.length > 0) {
        const uniqueBlocks = Array.from(new Set(merged.map(l => l.blockNumber)))
        const blocks = await Promise.all(uniqueBlocks.map(bn => client.getBlock({ blockNumber: bn })))
        const tsByBlock = new Map(blocks.map(b => [b.number, Number(b.timestamp)]))
        const withTimestamps: ReplayLog[] = merged.map(log => ({
          ...log, blockTimestamp: tsByBlock.get(log.blockNumber)!,
        }) as ReplayLog)

        const safeLogs = withTimestamps.filter(l => l.blockNumber <= safeToBlock)
        const tailLogs = withTimestamps.filter(l => l.blockNumber > safeToBlock)

        persisted = replay(persisted, safeLogs, markee)

        display = replay(persisted, tailLogs, markee)
      }
    }

    if (safeToBlock >= fromBlock) {
      await lifetimeDeps.set(key, {
        streamed: persisted.streamed.toString(), refunded: persisted.refunded.toString(),
        lastBlock: safeToBlock.toString(), rate: persisted.rate.toString(),
        isTop: persisted.isTop, since: persisted.since,
      } satisfies Checkpoint)
    }
    return {
      streamedWei: display.streamed.toString(), refundedWei: display.refunded.toString(),
      currentRateWei: display.rate.toString(), isTop: display.isTop, since: display.since,
    }
  }, 30, 0)
  return result.data
}

// Net ETH the backer has paid for its own message up to `nowSec`: only time spent at #1 is charged,
// since a non-#1 backer is refunded its own rate in full.
export function netStreamedWei(lifetime: LifetimeStreamed, nowSec: number): bigint {
  const streamed = BigInt(lifetime.streamedWei)
  const rate = BigInt(lifetime.currentRateWei)
  if (!lifetime.isTop || rate === 0n) return streamed
  return streamed + rate * BigInt(Math.max(0, nowSec - lifetime.since))
}
