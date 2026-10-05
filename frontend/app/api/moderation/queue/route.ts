// GET /api/moderation/queue?moderator=0x...&signature=0x...&timestamp=<unix>
//
// Pending moderation items across every board the moderator can moderate (global admins see all).
// The signature covers queueSessionMessage(moderator, timestamp) and stays valid for a day, so the
// dashboard can poll without a wallet prompt on every refresh.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { QUEUE_SESSION_TTL_SECONDS, queueSessionMessage, type ModerationItem, type QueueResponse } from '@/lib/moderation/queue'
import { isGlobalAdmin, listModeratedBoards, pendingKey, readItems } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

const CLOCK_SKEW_SECONDS = 300

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const moderator = params.get('moderator')?.toLowerCase()
  const signature = params.get('signature') as `0x${string}` | null
  const timestamp = Number(params.get('timestamp'))

  if (!moderator || !/^0x[0-9a-f]{40}$/.test(moderator) || !signature || !/^0x[0-9a-fA-F]+$/.test(signature) || !Number.isInteger(timestamp)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = Math.floor(Date.now() / 1000)
  if (timestamp > now + CLOCK_SKEW_SECONDS || now - timestamp > QUEUE_SESSION_TTL_SECONDS) {
    return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
  }

  const valid = await verifyMessage({
    address: moderator as `0x${string}`,
    message: queueSessionMessage(moderator, timestamp),
    signature,
  }).catch(() => false)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  try {
    const boards = await listModeratedBoards()
    const moderated = isGlobalAdmin(moderator) ? boards : boards.filter(b => b.moderators.includes(moderator))
    if (moderated.length === 0) return NextResponse.json({ boards: [], items: [] } satisfies QueueResponse)

    const pipeline = kv.pipeline()
    moderated.forEach(b => pipeline.zrange(pendingKey(b.address), 0, -1))
    const pendingPerBoard = await pipeline.exec<string[][]>()
    const markees = [...new Set(pendingPerBoard.flat())]
    const items = (await readItems(markees))
      .filter((it): it is ModerationItem => !!it && it.status === 'pending')
      .sort((a, b) => b.at - a.at)

    const response: QueueResponse = {
      boards: moderated.map(b => ({ address: b.address, name: b.name, platform: b.platform })),
      items,
    }
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[moderation/queue] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
