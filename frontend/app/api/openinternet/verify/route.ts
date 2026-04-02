// app/api/openinternet/verify/route.ts
//
// POST /api/openinternet/verify
//
// Admin-only endpoint. Sets verifiedUrl and status: 'verified' on a leaderboard's
// KV metadata, moving it into the "Top Verified Markees" section.
//
// Body: { leaderboardAddress, verifiedUrl, adminAddress, signature, timestamp }
// The signature must cover: `markee-verify:{leaderboardAddress}:{verifiedUrl}:{timestamp}`

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'

export const dynamic = 'force-dynamic'

const ADMIN_ADDRESS = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { leaderboardAddress, verifiedUrl, adminAddress, signature, timestamp } = body as {
      leaderboardAddress: string
      verifiedUrl: string
      adminAddress: string
      signature: `0x${string}`
      timestamp: number
    }

    if (!leaderboardAddress || !verifiedUrl || !adminAddress || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Reject signatures older than 5 minutes
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    // Verify admin wallet signature
    const message = `markee-verify:${leaderboardAddress.toLowerCase()}:${verifiedUrl}:${timestamp}`
    const valid = await verifyMessage({ address: adminAddress as `0x${string}`, message, signature })
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    if (adminAddress.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const key = `oi:meta:${leaderboardAddress.toLowerCase()}`
    const existing = await kv.get<Record<string, unknown>>(key) ?? {}
    const updated = { ...existing, verifiedUrl, status: 'verified' }
    await kv.set(key, updated)

    // Bust openinternet and ecosystem leaderboards caches
    await Promise.all([
      kv.del('cache:openinternet:leaderboards'),
      kv.del('cache:ecosystem:leaderboards'),
    ])

    return NextResponse.json({ success: true, meta: updated })
  } catch (err) {
    console.error('[openinternet/verify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
