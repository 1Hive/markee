// app/api/streaming/ever-funded/route.ts
//
// Which of a streaming board's markees have ever actually been backed. createMarkee happens before
// the stream is opened (a separate approve + batchCall), so an abandoned or failed flow leaves a
// real markee contract on-chain with a real message but zero rate and zero history -- indistinguishable
// from a message whose stream is just current unfunded/never-had-a-bid by looking at current state
// alone. BackerUpdated is emitted every time a backer's flow rate to a markee changes, so a markee
// that has never appeared in one has genuinely never received a single payment; that's the signal
// used to drop dead-on-arrival markees from the leaderboard rather than showing them as "inactive".
// The scan itself (and its permanent KV checkpoint) is lib/streaming/messages.ts getBackingHistory,
// shared with the account routes. Only boards the streaming factory recognizes are scanned.

import { NextRequest, NextResponse } from 'next/server'
import { isAddress, type Address } from 'viem'
import { everFundedMarkees } from '@/lib/streaming/messages'
import { everFundedDeps } from '@/lib/streaming/ever-funded-deps'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const CACHE_TTL = 60 // seconds

export async function GET(request: NextRequest) {
  const board = new URL(request.url).searchParams.get('board')?.toLowerCase().trim()
  if (!board || !isAddress(board)) {
    return NextResponse.json({ error: 'Valid board address is required' }, { status: 400, headers: NO_CACHE })
  }

  const cacheKey = `cache:streaming:ever-funded:${board}`
  const cached = await everFundedDeps.get<{ markees: string[] }>(cacheKey).catch(() => null)
  if (cached) return NextResponse.json(cached, { headers: NO_CACHE })

  if (await everFundedDeps.rateLimited(request, 'streaming-ever-funded', 120)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429, headers: NO_CACHE })
  }

  try {
    if (!await everFundedDeps.isStreamingBoard(board as Address)) {
      return NextResponse.json({ error: 'Not a streaming board' }, { status: 404, headers: NO_CACHE })
    }
    const history = await everFundedDeps.backingHistory(board)
    const payload = { markees: [...everFundedMarkees(history)] }
    await everFundedDeps.set(cacheKey, payload, CACHE_TTL)
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (error) {
    console.error('[streaming/ever-funded] error:', error)
    return NextResponse.json({ error: 'Failed to load funding history' }, { status: 500, headers: NO_CACHE })
  }
}
