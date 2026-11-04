import { softRecords, contentHash, automaticDeps } from '@/lib/moderation/automatic'
// GET /api/moderation/queue?moderator=0x...
//
// Moderation items for every board the moderator reviews: boards they own or were added to (board
// scope) and, for global admins, every board (site scope). Public, like the on-chain text and the
// flag lists it is built from, so the dashboard polls it without a wallet signature. Every action
// on it still needs one (POST /api/moderation).

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { ADDRESS_PATTERN, isFlaggedIn, isPendingIn, type ModerationItem, type ModerationScope, type QueueBoard, type QueueResponse } from '@/lib/moderation/queue'
import { PENDING_SITE_KEY, flagKey, isGlobalAdmin, listModeratedBoards, markeeOfFlagKey, pendingKey, readAllFlagged, readItems } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

const EMPTY: QueueResponse = { boards: [], items: [], flagged: [] }

export async function GET(req: NextRequest) {
  const moderator = req.nextUrl.searchParams.get('moderator')?.toLowerCase()
  if (!moderator || !ADDRESS_PATTERN.test(moderator)) {
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
    if (boards.length === 0) return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'private, no-store' } })

    const scopesOf = new Map(boards.map(b => [b.address, b.scopes]))
    const boardScoped = boards.filter(b => b.scopes.includes('board'))
    const pipeline = kv.pipeline()
    boardScoped.forEach(b => pipeline.zrange(pendingKey('board', b.address), 0, -1))
    if (global) pipeline.zrange(PENDING_SITE_KEY, 0, -1)
    const [pending, flags] = await Promise.all([pipeline.exec<string[][]>(), readAllFlagged()])

    // Flagged markees are only known by key, so read them all and keep the viewer's boards below.
    const flaggedMarkees = [...new Set([...flags.board, ...(global ? flags.site : [])])].map(markeeOfFlagKey)
    const soft = (await softRecords()).filter(r => r.state === 'soft-flagged' && r.siteState !== 'visible' && scopesOf.has(r.board!))
    const softMap = new Map(soft.map(r => [r.markee, r]))
    const markees = [...new Set([...pending.flat(), ...flaggedMarkees, ...soft.map(r => r.markee)])]
    const stored = (await readItems(markees)).filter((it): it is ModerationItem => !!it && scopesOf.has(it.board))
    const fresh = soft.length ? await automaticDeps.read(soft.map(r => r.markee)) : []
    const freshById = new Map(fresh.map(o => [o.markee, o]))
    const all = [...stored]
    for (const record of soft) {
      const observation = freshById.get(record.markee)
      if (!observation || contentHash(observation.message) !== record.contentHash) { softMap.delete(record.markee); continue }
      const existing = all.find(it => it.markee === record.markee)
      if (existing) existing.message = observation.message
      else all.push({ markee: record.markee, board: observation.board, message: observation.message, name: '', author: '', kind: 'created', previousMessage: null, blockNumber: '0', at: 0, reviews: { board: { status: 'approved', reviewedBy: null, reviewedAt: null }, site: { status: 'approved', reviewedBy: null, reviewedAt: null } } })
    }

    const boardFlagged = new Set(flags.board)
    // A board flag already hides the message on markee.xyz, so a site review would change nothing.
    const siteReviewIsMoot = (it: ModerationItem, scopes: ModerationScope[]) =>
      scopes.length === 1 && scopes[0] === 'site' && boardFlagged.has(flagKey(it.markee))
    const items: ModerationItem[] = []
    const flagged: ModerationItem[] = []
    all.forEach(it => {
      const scopes = scopesOf.get(it.board)!
      if (isFlaggedIn(it, scopes)) flagged.push(it)
      else if (softMap.has(it.markee)) flagged.push({ ...it, automatic: softMap.get(it.markee)! })
      else if (isPendingIn(it, scopes) && !siteReviewIsMoot(it, scopes)) items.push(it)
    })
    items.sort((a, b) => b.at - a.at)
    flagged.sort((a, b) => b.at - a.at)

    const response: QueueResponse = { boards, items, flagged }
    return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[moderation/queue] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
