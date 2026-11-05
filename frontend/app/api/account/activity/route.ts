// app/api/account/activity/route.ts
//
// GET /api/account/activity?wallet=0x...  → { events: ActivityEvent[] } newest first
//
// The /account Activity Feed. Events are written by the moderation scan cron (lib/activity/server.ts)
// from on-chain state, so they're public and need no signature to read.

import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { readActivity } from '@/lib/activity/server'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const RATE_WINDOW = 60
const RATE_MAX = 60

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')?.trim().toLowerCase()
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet' }, { status: 400, headers: NO_CACHE })
  }
  try {
    if (!await underRateLimit('account-activity', clientIp(request), RATE_MAX, RATE_WINDOW)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_CACHE })
    }
    return NextResponse.json({ events: await readActivity(wallet) }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[account/activity] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_CACHE })
  }
}
