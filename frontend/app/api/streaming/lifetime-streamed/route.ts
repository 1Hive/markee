// app/api/streaming/lifetime-streamed/route.ts
//
// "How much has this backer actually streamed to this Markee, net of GDA refunds" -- across every
// win/lose cycle, not just the current streak. Unlike top-since (a forward-only KV approximation,
// see its own comment on why historical CFA flow amounts aren't reconstructable in general), this
// IS reconstructable for a single (board, markee, backer) triple: BackerUpdated and TopChanged are
// both logged events with real block timestamps, and a backer can only ever back one Markee at a
// time (backerMarkee is single-valued -- moving to a different Markee always closes the old stream
// first, emitting BackerUpdated(..., 0, ...)). So replaying those two event streams for one backer
// on one Markee gives an exact rate-times-duration history, cheap to query since it's scoped to a
// single wallet's activity, not the whole board.
//
// Refund math follows the contract directly (see StreamingLeaderboard.sol): only the enforced #1
// pays without refund; every other backer is refunded via a GDA pool whose units equal their own
// flow rate, i.e. refunded at exactly their own contributed rate while not #1. So "net streamed" is
// just the sum of rate*duration over periods this backer's Markee was #1 -- streamed and refunded
// are tracked as separate running totals (not just netted) so the UI can show a breakdown.
//
// Checkpointed in KV so repeat calls only replay events since the last processed block, not the
// whole history (same pattern as /api/streaming/ever-funded). Unlike that route's Set-based
// accumulation (idempotent -- reprocessing a block twice is harmless), this one adds rate*duration
// arithmetically, so re-processing a block after a reorg swapped its events would silently corrupt
// the total. The checkpoint is therefore only advanced up to REORG_SAFETY_BLOCKS behind the chain
// head; the more-recent tail is replayed on top for the response every call, but never persisted,
// so a reorg there just gets redone correctly next time instead of double-counted.
//
// The trailing period since the last known event/checkpoint is intentionally left for the client to
// tick forward live (useFlowingAmount, anchored on `since` below) rather than flushed here on a
// timer -- that would reintroduce exactly the polling-drift problem this exists to avoid.

import { NextResponse } from 'next/server'
import { createPublicClient, http, isAddress, parseAbiItem, type Address } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const RATE_WINDOW = 60
const RATE_MAX = 30
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

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const board = url.searchParams.get('board')?.toLowerCase().trim()
  const markee = url.searchParams.get('markee')?.toLowerCase().trim()
  const backer = url.searchParams.get('backer')?.toLowerCase().trim()
  if (!board || !isAddress(board) || !markee || !isAddress(markee) || !backer || !isAddress(backer)) {
    return NextResponse.json({ error: 'Valid board, markee, and backer addresses required' }, { status: 400, headers: NO_CACHE })
  }

  try {
    if (!await underRateLimit('streaming:lifetime-streamed', clientIp(request), RATE_MAX, RATE_WINDOW)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(RATE_WINDOW) } })
    }

    const client = getClient()
    const key = `streaming:lifetime:${board}:${markee}:${backer}`
    const checkpoint = await kv.get<Checkpoint>(key)

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
        if (safeLogs.length > 0) {
          await kv.set(key, {
            streamed: persisted.streamed.toString(), refunded: persisted.refunded.toString(),
            lastBlock: safeToBlock.toString(), rate: persisted.rate.toString(),
            isTop: persisted.isTop, since: persisted.since,
          } satisfies Checkpoint)
        }

        display = replay(persisted, tailLogs, markee)
      }
    }

    return NextResponse.json({
      streamedWei: display.streamed.toString(), refundedWei: display.refunded.toString(),
      currentRateWei: display.rate.toString(), isTop: display.isTop, since: display.since,
    }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/lifetime-streamed] error:', err)
    return NextResponse.json({ error: 'Failed to compute lifetime streamed' }, { status: 500, headers: NO_CACHE })
  }
}
