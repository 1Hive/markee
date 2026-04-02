// app/api/openinternet/meta/route.ts
//
// GET  /api/openinternet/meta?address=0x...  → fetch metadata for one leaderboard
// POST /api/openinternet/meta                → set logoUrl and/or siteUrl (creator only)
//
// KV key: oi:meta:{address}
// { logoUrl?: string; siteUrl?: string; verifiedUrl?: string; status: 'pending' | 'verified' }

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.toLowerCase()
  if (!address) {
    return NextResponse.json({ error: 'Missing address param' }, { status: 400 })
  }

  const meta = await kv.get(`oi:meta:${address}`)
  return NextResponse.json(meta ?? {}, { headers: NO_CACHE })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { leaderboardAddress, logoUrl, siteUrl } = body as {
      leaderboardAddress: string
      logoUrl?: string
      siteUrl?: string
    }

    if (!leaderboardAddress) {
      return NextResponse.json({ error: 'Missing leaderboardAddress' }, { status: 400 })
    }

    const key = `oi:meta:${leaderboardAddress.toLowerCase()}`
    const existing = await kv.get<Record<string, unknown>>(key) ?? {}

    // Only update provided fields; preserve verifiedUrl and status set by admin
    const updated = {
      ...existing,
      ...(logoUrl !== undefined && { logoUrl }),
      ...(siteUrl !== undefined && { siteUrl }),
      status: existing.status ?? 'pending',
    }

    await kv.set(key, updated)

    // Bust openinternet leaderboards cache so new metadata is visible
    await kv.del('cache:openinternet:leaderboards')

    return NextResponse.json({ success: true, meta: updated })
  } catch (err) {
    console.error('[openinternet/meta] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
