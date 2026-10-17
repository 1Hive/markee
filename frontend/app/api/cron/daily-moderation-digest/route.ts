/**
 * Daily moderation digest: sends a summary email to moderators of boards whose email
 * frequency is set to 'daily' and that have pending items in the queue.
 *
 *   GET /api/cron/daily-moderation-digest
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { listModeratedBoards } from '@/lib/moderation/server'
import { sendDailyDigest } from '@/lib/moderation/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const boards = await listModeratedBoards()
    const { sent, errors } = await sendDailyDigest(boards)
    return NextResponse.json({ ok: true, sent, errors })
  } catch (e) {
    console.error('[daily-moderation-digest] failed:', e)
    return NextResponse.json({ error: 'daily digest failed' }, { status: 500 })
  }
}
