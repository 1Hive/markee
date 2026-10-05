/**
 * Moderation API Route
 *
 * GET  /api/moderation          → Returns all flagged markee keys
 * POST /api/moderation          → Flag, unflag, or approve markees (global admin, or each markee's
 *                                  board's on-chain admin/creator, see authorizedMarkees)
 *
 * Markee keys use the format: `{chainId}:{lowercase markeeId}` to support multi-chain.
 *
 * Storage: Vercel KV (Upstash Redis). Flags live in a single Set for O(1) lookups; review state for
 * the /account queue lives per markee (see lib/moderation/scan.ts).
 *
 How to add to your site:
 *   - Drop this file into your app/api/moderation/route.ts
 *   - Ensure @vercel/kv is installed and KV_REST_API_URL + KV_REST_API_TOKEN are set
 *   - Update ADMIN_ADDRESSES in lib/moderation/config.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { MAX_REVIEW_BATCH, reviewItem, reviewMessage, type ModerationAction } from '@/lib/moderation/queue'
import {
  FLAGGED_KEY, authorizedMarkees, flagKey, flagKeyVariants, itemKey, pendingKey, readFlagged, readItems,
} from '@/lib/moderation/server'

const ACTIONS: readonly ModerationAction[] = ['flag', 'unflag', 'approve']

// ── GET: list all flagged keys ───────────────────────────────────────

export async function GET() {
  try {
    return NextResponse.json({ flagged: await readFlagged() })
  } catch (error) {
    console.error('[moderation] GET error:', error)
    return NextResponse.json({ flagged: [] })
  }
}

// ── POST: flag, unflag, or approve ───────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { markeeId, markeeIds, chainId, action, adminAddress, signature, timestamp } = body as {
      markeeId?: string
      markeeIds?: string[]
      chainId: number | string
      action: ModerationAction
      adminAddress: string
      signature: `0x${string}`
      timestamp: number
    }
    const ids = markeeIds ?? (markeeId ? [markeeId] : [])

    if (ids.length === 0 || !chainId || !action || !adminAddress || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Use "flag", "unflag" or "approve".' }, { status: 400 })
    }
    if (ids.length > MAX_REVIEW_BATCH || ids.some(id => !/^0x[0-9a-fA-F]{40}$/.test(id))) {
      return NextResponse.json({ error: 'Invalid markee ids' }, { status: 400 })
    }

    // Reject signatures older than 5 minutes
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    // Verify the caller actually controls the wallet they claim
    const message = reviewMessage(action, chainId, ids, timestamp)
    const valid = await verifyMessage({ address: adminAddress as `0x${string}`, message, signature })
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const allowed = await authorizedMarkees(adminAddress, ids)
    if (ids.some(id => !allowed.has(id.toLowerCase()))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const items = await readItems(ids)
    const pipeline = kv.pipeline()
    ids.forEach((id, i) => {
      if (action === 'flag') pipeline.sadd(FLAGGED_KEY, flagKey(id))
      else pipeline.srem(FLAGGED_KEY, ...flagKeyVariants(id))

      const item = items[i]
      if (item) {
        pipeline.set(itemKey(id), reviewItem(item, action, adminAddress, now))
        pipeline.zrem(pendingKey(item.board), item.markee)
      }
    })
    await pipeline.exec()

    return NextResponse.json({
      success: true,
      action,
      keys: ids.map(flagKey),
      key: flagKey(ids[0]),
      flagged: await readFlagged(),
    })
  } catch (error) {
    console.error('[moderation] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
