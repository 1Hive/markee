// app/api/account/verification-status/route.ts
//
// Streaming ("For Rent") boards are no longer split by platform -- a single streaming leaderboard can
// be integrated on a website, a GitHub repo, both, or neither, independent of whatever platform tag it
// was created with. So "is this board verified" can't be read off the platform-specific leaderboard
// listing routes (github/superfluid/openinternet/streaming) -- it has to be looked up per address,
// the same way regardless of platform: linked GitHub files (KV, keyed by address) and website
// verifiedUrls (KV, keyed by address) both exist independent of how the board was created.

import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { verificationStatusFor } from '@/lib/leaderboards/verificationStatus'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

// Unauthenticated and uncached, and each call fans out to a strong-consistency KV read. Generous
// enough that a real account page (one call per mount) never sees it, tight enough to bound a script.
const RATE_WINDOW = 60
const RATE_MAX = 60

function parseAddresses(raw: string[]): string[] {
  return [...new Set(raw.map(a => a.trim().toLowerCase()).filter(a => isAddress(a)))].slice(0, 200)
}

function rateLimited() {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(RATE_WINDOW) } })
}

// POST rather than GET: a comma-joined query string of 200 addresses is ~8.4KB, past the point
// where CDNs and proxies start dropping the request URL.
export async function POST(request: NextRequest) {
  try {
    if (!await underRateLimit('verification-status', clientIp(request), RATE_MAX, RATE_WINDOW)) return rateLimited()
    const body = await request.json().catch(() => ({}))
    const raw: unknown = body?.addresses
    if (!Array.isArray(raw)) return NextResponse.json({}, { headers: NO_CACHE })
    return NextResponse.json(await verificationStatusFor(parseAddresses(raw.filter((a): a is string => typeof a === 'string'))), { headers: NO_CACHE })
  } catch (err) {
    console.error('[account/verification-status] error:', err)
    // 500, not {} with 200 -- the caller needs to tell "nothing is verified" apart from "we couldn't
    // check", since the latter would otherwise flash every board into "Ready to Add to Your Site".
    return NextResponse.json({ error: 'Unable to load verification status' }, { status: 500, headers: NO_CACHE })
  }
}
