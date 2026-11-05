// GET /api/views/strategy-totals
// Returns { fixed: number, streaming: number } — every board's views (lib/views/boards.ts), summed
// by pricing strategy. Result is cached 5 minutes.
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { underRateLimit, clientIp } from '@/lib/rate-limit'
import { LISTING_ROUTES, readListing } from '@/lib/leaderboards/listing-reader'
import { readBoardViews } from '@/lib/views/boards'

export const dynamic = 'force-dynamic'

const RESULT_KEY = 'cache:strategy-view-totals'
const RESULT_TTL = 300
const RATE_WINDOW = 60
const RATE_MAX_MISSES = 10


export async function GET(request: NextRequest) {
  const cached = await kv.get<{ fixed: number; streaming: number }>(RESULT_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, max-age=300' } })
  }

  // Only gates the cache-miss path -- a fixed-window counter, same helper/limits as
  // streaming/deposit-manager, so a burst of concurrent misses during cache expiry can't all fan out
  // into the full multi-KV-call pipeline in parallel.
  if (!await underRateLimit('views:strategy-totals', clientIp(request), RATE_MAX_MISSES, RATE_WINDOW)) {
    return NextResponse.json(
      { fixed: 0, streaming: 0, error: 'rate_limited' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(RATE_WINDOW) } },
    )
  }

  // Read the shared listing snapshots directly; cold lists use the same in-process loaders.
  // Never cache incomplete totals when a listing is unavailable.
  let lists
  try { lists = await Promise.all(LISTING_ROUTES.map(readListing)) }
  catch { return NextResponse.json({ error: 'Leaderboards temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '15' } }) }
  const seen = new Set<string>()
  const boards = lists.flatMap((list, i) => (list?.leaderboards ?? []).map(lb => ({ ...lb, streaming: i === 4 || lb.strategy === 'streaming' })))
    .filter(lb => !seen.has(lb.address.toLowerCase()) && !!seen.add(lb.address.toLowerCase()))
  const views = await readBoardViews(boards)

  let fixed = 0
  let streaming = 0
  for (const lb of boards) {
    const n = views.get(lb.address.toLowerCase()) ?? 0
    if (lb.streaming) streaming += n
    else fixed += n
  }

  const result = { fixed, streaming }
  await kv.set(RESULT_KEY, result, { ex: RESULT_TTL })

  return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
