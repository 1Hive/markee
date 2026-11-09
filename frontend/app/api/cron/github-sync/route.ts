/**
 * Keeps verified README billboards in step with the chain.
 *
 *   GET /api/cron/github-sync
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Purchases from the SDK, other apps or direct contract calls never hit the sync route, so this
 * re-renders every linked board and syncs only those whose message or price changed. A daily
 * resync also restores blocks someone edited by hand.
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getLinkedFiles } from '@/lib/github/linkedFiles'
import { billboardSignature, readBillboardState, syncMarkeeFile } from '@/lib/github/markeeSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LINKED_PREFIX = 'github:markee:'
const syncedKey = (board: string) => `github:synced:${board}`
const RESYNC_AFTER_MS = 24 * 60 * 60_000
const LOCK_KEY = 'github:sync:lock'

interface SyncedState { signature: string; at: number }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === secret
}

async function linkedBoards(): Promise<string[]> {
  const boards: string[] = []
  let cursor = '0'
  do {
    const [next, keys] = await kv.scan(cursor, { match: `${LINKED_PREFIX}*`, count: 500 })
    cursor = String(next)
    boards.push(...keys.map(k => k.slice(LINKED_PREFIX.length).toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a)))
  } while (cursor !== '0')
  return [...new Set(boards)]
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: maxDuration + 30 })) return NextResponse.json({ skipped: 'already running' })
  try {
    const summary = { boards: 0, synced: 0, unchanged: 0, failed: 0 }
    for (const board of await linkedBoards()) {
      const files = await getLinkedFiles(board)
      if (!files.some(f => f.verified)) continue
      summary.boards++
      try {
        const signature = billboardSignature(await readBillboardState(board as `0x${string}`))
        const previous = await kv.get<SyncedState>(syncedKey(board))
        if (previous?.signature === signature && Date.now() - previous.at < RESYNC_AFTER_MS) { summary.unchanged++; continue }
        const outcome = await syncMarkeeFile(board as `0x${string}`)
        if (outcome.body.success) {
          await kv.set(syncedKey(board), { signature, at: Date.now() })
          summary.synced++
        } else summary.failed++
      } catch (err) {
        console.error(`[cron/github-sync] ${board}`, err)
        summary.failed++
      }
    }
    return NextResponse.json(summary)
  } finally {
    await kv.del(LOCK_KEY)
  }
}
