/**
 * Moderation API Route
 *
 * GET  /api/moderation          → Flagged markee keys:
 *                                    flagged     -- board flags, set by a board's owner or the
 *                                                   moderators they added. Every site showing the
 *                                                   board hides these (embeds read this field).
 *                                    siteFlagged -- markee.xyz-only flags, set by global admins.
 * POST /api/moderation          → Flag, unflag, or approve markees. Applies in every scope the
 *                                  signer holds for each markee (see authorizedScopes).
 *
 * Markee keys use the format: `{chainId}:{lowercase markeeId}` to support multi-chain.
 *
 * Storage: Vercel KV (Upstash Redis). Flags live in one Set per scope for O(1) lookups; review state
 * for the /account queue lives per markee (see lib/moderation/scan.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { ADDRESS_PATTERN, MAX_REVIEW_BATCH, SCOPES, reviewItem, reviewMessage, type ModerationAction, type ModerationItem, type ScopeReview } from '@/lib/moderation/queue'
import {
  FLAGGED_KEYS, authorizedScopes, flagKey, flagKeyVariants, itemKey, pendingKey, readAllFlagged, readItems,
} from '@/lib/moderation/server'

// @vercel/kv leaves fetch caching to Next, which would otherwise store (and can replay) KV reads.
export const dynamic = 'force-dynamic'

const ACTIONS: readonly ModerationAction[] = ['flag', 'unflag', 'approve']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ── GET: list all flagged keys ───────────────────────────────────────

export async function GET() {
  try {
    const { board, site } = await readAllFlagged()
    return NextResponse.json({ flagged: board, siteFlagged: site }, { headers: CORS })
  } catch (error) {
    console.error('[moderation] GET error:', error)
    return NextResponse.json({ flagged: [], siteFlagged: [] }, { headers: CORS })
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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: CORS })
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Use "flag", "unflag" or "approve".' }, { status: 400, headers: CORS })
    }
    if (ids.length > MAX_REVIEW_BATCH || ids.some(id => !ADDRESS_PATTERN.test(id))) {
      return NextResponse.json({ error: 'Invalid markee ids' }, { status: 400, headers: CORS })
    }
    if (!ADDRESS_PATTERN.test(adminAddress)) {
      return NextResponse.json({ error: 'Invalid admin address' }, { status: 400, headers: CORS })
    }

    // Reject signatures older than 5 minutes
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401, headers: CORS })
    }

    // Verify the caller actually controls the wallet they claim
    const message = reviewMessage(action, chainId, ids, timestamp)
    const valid = await verifyMessage({ address: adminAddress as `0x${string}`, message, signature }).catch(() => false)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401, headers: CORS })
    }

    const { scopes, boardMap } = await authorizedScopes(adminAddress, ids)
    if (ids.some(id => !scopes.has(id.toLowerCase()))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers: CORS })
    }

    const items = await readItems(ids)
    const reviewedAt = Math.floor(Date.now() / 1000)
    const pipeline = kv.pipeline()
    ids.forEach((id, i) => {
      const held = scopes.get(id.toLowerCase())!
      held.forEach(scope => {
        if (action === 'flag') pipeline.sadd(FLAGGED_KEYS[scope], flagKey(id))
        else pipeline.srem(FLAGGED_KEYS[scope], ...flagKeyVariants(id))
      })

      let item = items[i]
      // When a moderator flags a markee that has never been scanned, create a stub item so the
      // flag appears in the queue immediately rather than waiting for the next cron run.
      if (!item && action === 'flag') {
        const board = boardMap.get(id.toLowerCase())
        if (board) {
          const pending = (): ScopeReview => ({ status: 'pending', reviewedBy: null, reviewedAt: null })
          const flagged = (): ScopeReview => ({ status: 'flagged', reviewedBy: adminAddress, reviewedAt })
          item = {
            markee: id.toLowerCase(),
            board,
            kind: 'created',
            message: '',
            name: '',
            author: '',
            previousMessage: null,
            blockNumber: '0',
            at: reviewedAt,
            reviews: {
              board: held.includes('board') ? flagged() : pending(),
              site: held.includes('site') ? flagged() : pending(),
            },
          } satisfies ModerationItem
        }
      }
      if (item) {
        pipeline.set(itemKey(id), reviewItem(item, action, adminAddress, reviewedAt, held))
        // Flagged items surface via FLAGGED_KEYS (already written above), not the pending sorted set.
        // Stub items (first flag, never scanned) were never in pending, so nothing to remove.
        if (items[i]) held.forEach(scope => pipeline.zrem(pendingKey(scope, item!.board), item!.markee))
      }
    })
    await pipeline.exec()

    const { board, site } = await readAllFlagged()
    return NextResponse.json({
      success: true,
      action,
      keys: ids.map(flagKey),
      flagged: board,
      siteFlagged: site,
    }, { headers: CORS })
  } catch (error) {
    console.error('[moderation] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS })
  }
}
