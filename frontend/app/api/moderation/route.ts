/**
 * Moderation API Route
 * 
 * GET  /api/moderation          → Returns all flagged markee keys
 * POST /api/moderation          → Flag or unflag a markee (admin only)
 * 
 * Markee keys use the format: `{chainId}:{markeeId}` to support multi-chain.
 * 
 * Storage: Vercel KV (Upstash Redis) using a single Set for O(1) lookups.
 * 
 How to add to your site:
 *   - Drop this file into your app/api/moderation/route.ts
 *   - Ensure @vercel/kv is installed and KV_REST_API_URL + KV_REST_API_TOKEN are set
 *   - Update ADMIN_ADDRESSES in lib/moderation/config.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { ADMIN_ADDRESSES } from '@/lib/moderation/config'

const KV_KEY = 'moderation:flagged'

// ── Helpers ──────────────────────────────────────────────────────────

function isAdmin(address: string | null): boolean {
  if (!address) return false
  return ADMIN_ADDRESSES.some(
    (admin) => admin.toLowerCase() === address.toLowerCase()
  )
}

function markeeKey(chainId: number | string, markeeId: string): string {
  return `${chainId}:${markeeId}`
}

// ── GET: list all flagged keys ───────────────────────────────────────

export async function GET() {
  try {
    const flagged = await kv.smembers(KV_KEY)
    return NextResponse.json({ flagged: flagged ?? [] })
  } catch (error) {
    console.error('[moderation] GET error:', error)
    return NextResponse.json({ flagged: [] })
  }
}

// ── POST: flag or unflag ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { markeeId, chainId, action, adminAddress } = body as {
      markeeId: string
      chainId: number | string
      action: 'flag' | 'unflag'
      adminAddress: string
    }

    // Validate
    if (!markeeId || !chainId || !action || !adminAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: markeeId, chainId, action, adminAddress' },
        { status: 400 }
      )
    }

    if (!isAdmin(adminAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const key = markeeKey(chainId, markeeId)

    if (action === 'flag') {
      await kv.sadd(KV_KEY, key)
    } else if (action === 'unflag') {
      await kv.srem(KV_KEY, key)
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "flag" or "unflag".' },
        { status: 400 }
      )
    }

    // Return updated list
    const flagged = await kv.smembers(KV_KEY)
    return NextResponse.json({ success: true, action, key, flagged: flagged ?? [] })
  } catch (error) {
    console.error('[moderation] POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
