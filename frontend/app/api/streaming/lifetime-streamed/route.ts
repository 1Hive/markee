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
import { isAddress } from 'viem'
import { lifetimeDeps } from '@/lib/streaming/lifetime-deps'
import { readLifetimeStreamed } from '@/lib/streaming/lifetime'
import { clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const RATE_WINDOW = 60
const RATE_MAX = 30

export async function GET(request: Request) {
  const url = new URL(request.url)
  const board = url.searchParams.get('board')?.toLowerCase().trim()
  const markee = url.searchParams.get('markee')?.toLowerCase().trim()
  const backer = url.searchParams.get('backer')?.toLowerCase().trim()
  if (!board || !isAddress(board) || !markee || !isAddress(markee) || !backer || !isAddress(backer)) {
    return NextResponse.json({ error: 'Valid board, markee, and backer addresses required' }, { status: 400, headers: NO_CACHE })
  }

  try {
    if (!await lifetimeDeps.underRateLimit('streaming:lifetime-streamed', clientIp(request), RATE_MAX, RATE_WINDOW)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(RATE_WINDOW) } })
    }

    return NextResponse.json(await readLifetimeStreamed(board, markee, backer), { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/lifetime-streamed] error:', err)
    return NextResponse.json({ error: 'Failed to compute lifetime streamed' }, { status: 500, headers: NO_CACHE })
  }
}
