// GET /api/moderation/queue?moderator=0x...
//
// Moderation items for every board the moderator reviews: boards they own or were added to (board
// scope) and, for global admins, every board (site scope). Public, like the on-chain text and the
// flag lists it is built from, so the dashboard polls it without a wallet signature. Every action
// on it still needs one (POST /api/moderation).

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { isFlaggedIn, isPendingIn, type ModerationItem, type ModerationScope, type QueueBoard, type QueueResponse } from '@/lib/moderation/queue'
import { PENDING_SITE_KEY, flagKey, isGlobalAdmin, listModeratedBoards, pendingKey, readAllFlagged, readItems } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

const EMPTY: QueueResponse = { boards: [], items: [], flagged: [] }

export async function GET(req: NextRequest) {
  const moderator = req.nextUrl.searchParams.get('moderator')?.toLowerCase()
  if (!moderator || !/^0x[0-9a-f]{40}$/.test(moderator)) {
    return NextResponse.json({ error: 'Missing or invalid moderator address' }, { status: 400 })
  }

  try {
    const global = isGlobalAdmin(moderator)
    const boards: QueueBoard[] = (await listModeratedBoards()).flatMap(b => {
      const scopes: ModerationScope[] = []
      if (b.moderators.includes(moderator)) scopes.push('board')
      if (global) scopes.push('site')
      return scopes.length > 0 ? [{ address: b.address, name: b.name, platform: b.platform, scopes }] : []
    })
    if (boards.length === 0) return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } })

    const scopesOf = new Map(boards.map(b => [b.address, b.scopes]))
    const boardScoped = boards.filter(b => b.scopes.includes('board'))
    const pipeline = kv.pipeline()
    boardScoped.forEach(b => pipeline.zrange(pendingKey('board', b.address), 0, -1))
    if (global) pipeline.zrange(PENDING_SITE_KEY, 0, -1)
    const [pending, flags] = await Promise.all([pipeline.exec<string[][]>(), readAllFlagged()])

    // Flagged markees are only known by key, so read them all and keep the viewer's boards below.
    const flaggedMarkees = [...new Set([...flags.board, ...(global ? flags.site : [])])].map(k => k.split(':')[1])
    const markees = [...new Set([...pending.flat(), ...flaggedMarkees])]
    const all = (await readItems(markees)).filter((it): it is ModerationItem => !!it && scopesOf.has(it.board))

    const boardFlagged = new Set(flags.board)
    const items: ModerationItem[] = []
    const flagged: ModerationItem[] = []
    all.forEach(it => {
      const scopes = scopesOf.get(it.board)!
      if (isFlaggedIn(it, scopes)) flagged.push(it)
      // A board flag already hides the message on markee.xyz, so a site review would change nothing.
      else if (isPendingIn(it, scopes) && !(scopes.length === 1 && scopes[0] === 'site' && boardFlagged.has(flagKey(it.markee)))) items.push(it)
    })
    items.sort((a, b) => b.at - a.at)
    flagged.sort((a, b) => b.at - a.at)

    const response: QueueResponse = { boards, items, flagged }
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[moderation/queue] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
