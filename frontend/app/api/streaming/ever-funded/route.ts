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
// shared with the account routes.

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, isAddress } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { getBackingHistory, everFundedMarkees } from '@/lib/streaming/messages'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const CACHE_TTL = 60 // seconds

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

export async function GET(request: NextRequest) {
  const board = new URL(request.url).searchParams.get('board')?.toLowerCase().trim()
  if (!board || !isAddress(board)) {
    return NextResponse.json({ error: 'Valid board address is required' }, { status: 400, headers: NO_CACHE })
  }

  const cacheKey = `cache:streaming:ever-funded:${board}`
  const cached = await kv.get<{ markees: string[] }>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: NO_CACHE })

  try {
    const history = await getBackingHistory(getClient(), board)
    const payload = { markees: [...everFundedMarkees(history)] }
    await kv.set(cacheKey, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (error) {
    console.error('[streaming/ever-funded] error:', error)
    return NextResponse.json({ error: 'Failed to load funding history' }, { status: 500, headers: NO_CACHE })
  }
}
