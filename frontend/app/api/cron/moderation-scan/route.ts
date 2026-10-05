/**
 * Moderation scan: feeds the /account moderation queue.
 *
 *   GET /api/cron/moderation-scan
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Scans every v1.x fixed and streaming board for new messages and edits since that board's stored
 * cursor block and queues each changed message for review (see lib/moderation/scan.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { runModerationScan } from '@/lib/moderation/scan'
import { SCAN_LOCK_KEY } from '@/lib/moderation/server'
import { logger } from '@/lib/server/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LOCK_TTL = maxDuration + 30

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const acquired = await kv.set(SCAN_LOCK_KEY, Date.now(), { nx: true, ex: LOCK_TTL }) === 'OK'
  if (!acquired) return NextResponse.json({ ok: true, skipped: 'previous run still in flight' })

  try {
    const report = await runModerationScan()
    return NextResponse.json({ ok: true, ...report })
  } catch (e) {
    await logger.error('moderation scan failed', e)
    return NextResponse.json({ error: 'moderation scan failed, see function logs' }, { status: 500 })
  } finally {
    await kv.del(SCAN_LOCK_KEY)
  }
}
