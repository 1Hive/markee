// GET /api/views/strategy-totals
// Returns { fixed: number, streaming: number } — aggregate view counts across all markees
// grouped by pricing strategy. Reads existing leaderboard KV caches for addresses, then
// batch-fetches views:total:{address} for each. Result is cached 5 minutes.
import { kv } from '@vercel/kv'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RESULT_KEY = 'cache:strategy-view-totals'
const RESULT_TTL = 300

type LBCache = { leaderboards: { address: string }[] }

export async function GET() {
  const cached = await kv.get<{ fixed: number; streaming: number }>(RESULT_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, max-age=300' } })
  }

  const [oi, sf, gh, st] = await Promise.all([
    kv.get<LBCache>('cache:openinternet:leaderboards'),
    kv.get<LBCache>('cache:superfluid:leaderboards'),
    kv.get<LBCache>('cache:github:leaderboards'),
    kv.get<LBCache>('cache:streaming:leaderboards'),
  ])

  const fixedAddrs = [
    ...(oi?.leaderboards ?? []),
    ...(sf?.leaderboards ?? []),
    ...(gh?.leaderboards ?? []),
  ].map(l => l.address.toLowerCase())

  const streamingAddrs = (st?.leaderboards ?? []).map(l => l.address.toLowerCase())

  // Deduplicate in case any address appears in multiple caches
  const uniqueFixed = [...new Set(fixedAddrs)]
  const uniqueStreaming = [...new Set(streamingAddrs)]
  const allAddrs = [...new Set([...uniqueFixed, ...uniqueStreaming])]

  if (allAddrs.length === 0) {
    return NextResponse.json({ fixed: 0, streaming: 0 })
  }

  const keys = allAddrs.map(a => `views:total:${a}`)
  const counts = await kv.mget<number[]>(...keys)

  const viewsMap = new Map<string, number>()
  allAddrs.forEach((addr, i) => viewsMap.set(addr, counts[i] ?? 0))

  const fixed = uniqueFixed.reduce((sum, a) => sum + (viewsMap.get(a) ?? 0), 0)
  const streaming = uniqueStreaming.reduce((sum, a) => sum + (viewsMap.get(a) ?? 0), 0)

  const result = { fixed, streaming }
  await kv.set(RESULT_KEY, result, { ex: RESULT_TTL })

  return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
