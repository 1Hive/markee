// app/api/openinternet/meta/route.ts
//
// GET  /api/openinternet/meta?address=0x...  → fetch metadata for one leaderboard
// POST /api/openinternet/meta                → set logoUrl/siteUrl or remove a verified URL
//   { leaderboardAddress, logoUrl?, siteUrl?, removeVerifiedUrl?, owner, signature, timestamp }
//   Only a board owner (on-chain admin or creator) can sign it; the signature covers
//   metaUpdateMessage(8453, leaderboardAddress, { logoUrl, siteUrl, removeVerifiedUrl }, timestamp).
//
// KV key: oi:meta:{address}
// { logoUrl?: string; siteUrl?: string; verifiedUrl?: string; status: 'pending' | 'verified' }

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import { readBoardOwners } from '@/lib/moderation/server'
import { metaUpdateMessage } from '@/lib/openinternet/meta'

export const dynamic = 'force-dynamic'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/

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
    const { leaderboardAddress: rawBoard, logoUrl, siteUrl, removeVerifiedUrl, owner: rawOwner, signature, timestamp } = body as {
      leaderboardAddress?: string
      logoUrl?: string
      siteUrl?: string
      removeVerifiedUrl?: string
      owner?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const board = rawBoard?.toLowerCase()
    const owner = rawOwner?.toLowerCase()

    if (!board || !ADDRESS_PATTERN.test(board)) {
      return NextResponse.json({ error: 'Missing or invalid leaderboardAddress' }, { status: 400 })
    }
    if (!owner || !ADDRESS_PATTERN.test(owner)) {
      return NextResponse.json({ error: 'Missing or invalid owner address' }, { status: 400 })
    }
    if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    const valid = await verifyMessage({
      address: owner as `0x${string}`,
      message: metaUpdateMessage(base.id, board, { logoUrl, siteUrl, removeVerifiedUrl }, timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const [owners] = await readBoardOwners([board])
    if (!owners.includes(owner)) {
      return NextResponse.json({ error: "Only this board's owner can change its site details" }, { status: 403 })
    }

    const key = `oi:meta:${board}`
    const existing = await kv.get<Record<string, unknown>>(key) ?? {}

    // Only update provided fields; preserve verifiedUrl and status set by admin
    const updated: Record<string, unknown> = {
      ...existing,
      ...(logoUrl && { logoUrl }),
      ...(siteUrl && { siteUrl }),
      status: existing.status ?? 'pending',
    }

    if (removeVerifiedUrl) {
      const existingUrls: string[] = Array.isArray(existing.verifiedUrls)
        ? (existing.verifiedUrls as string[])
        : existing.verifiedUrl ? [existing.verifiedUrl as string] : []
      const newUrls = existingUrls.filter(u => u !== removeVerifiedUrl)
      updated.verifiedUrls = newUrls
      updated.verifiedUrl = newUrls[0] ?? null
      if (newUrls.length === 0) updated.status = 'pending'
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
