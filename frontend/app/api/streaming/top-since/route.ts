// app/api/streaming/top-since/route.ts
//
// "How long has the current #1 message been on top" -- Superfluid CFA streams flow into the board
// contract as one pooled inflow with no per-message cumulative-streamed entity on-chain or in the
// subgraph, so there's no way to reconstruct this historically. This is a lightweight, self-verifying
// substitute: the server reads the board's own topMarkee() (never trusts a client-supplied address),
// compares it to what's stored in KV, and resets the timestamp the moment the top changes. Powers
// both the "Manage Your Stream" modal's time-winning stat and the leaderboard's live "Total Streamed"
// column (rate x elapsed since this timestamp) -- an honest approximation, not a real historical total.

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, isAddress } from 'viem'
import { base } from 'viem/chains'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const RATE_WINDOW = 60
const RATE_MAX = 30

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

export async function GET(request: Request) {
  const board = new URL(request.url).searchParams.get('board')?.toLowerCase().trim()
  if (!board || !isAddress(board)) return NextResponse.json({ error: 'Valid board address required' }, { status: 400, headers: NO_CACHE })

  try {
    if (!await underRateLimit('streaming:top-since', clientIp(request), RATE_MAX, RATE_WINDOW)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(RATE_WINDOW) } })
    }
    const client = getClient()
    const topMarkee = (await client.readContract({
      address: board as `0x${string}`, abi: StreamingLeaderboardABI, functionName: 'topMarkee',
    })) as string

    const key = `streaming:topsince:${board}`
    const stored = await kv.get<{ address: string; since: number }>(key)

    if (stored && stored.address.toLowerCase() === topMarkee.toLowerCase()) {
      return NextResponse.json({ address: topMarkee, since: stored.since }, { headers: NO_CACHE })
    }

    const since = Math.floor(Date.now() / 1000)
    await kv.set(key, { address: topMarkee, since })
    return NextResponse.json({ address: topMarkee, since }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/top-since] error:', err)
    return NextResponse.json({ error: 'Failed to read top-since' }, { status: 500, headers: NO_CACHE })
  }
}
