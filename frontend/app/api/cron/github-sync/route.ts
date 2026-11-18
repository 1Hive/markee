/**
 * Keeps verified README billboards in step with the chain.
 *
 *   GET /api/cron/github-sync
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Purchases from the SDK, other apps or direct contract calls never hit the sync route, so this
 * re-renders every linked board and syncs only those whose message or price changed. A daily
 * resync also restores blocks someone edited by hand. A board whose sync fails for a lasting
 * reason (missing delimiters, revoked GitHub access, missing file) is not retried for the same
 * billboard until FAILED_RETRY_MS passes, so a broken link costs one attempt every few hours instead
 * of every run. Temporary failures (GitHub 5xx, conflicts, rate limits) retry on the next run. A
 * board counts as synced only when every one of its files is; each file's last outcome is saved
 * (github:file-sync:{board}) and shown per embed in the Manage drawer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { currentBoardsForLegacy, getLinkedFiles } from '@/lib/github/linkedFiles'
import { mapSettled } from '@/lib/concurrency'
import { billboardSignature, readBillboardState, syncMarkeeFile } from '@/lib/github/markeeSync'
import { FAILED_RETRY_MS, boardSyncResult, syncDecision, syncFailedKey, type SyncFileResult, type SyncRecord } from '@/lib/github/syncSchedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LINKED_PREFIX = 'github:markee:'
const syncedKey = (board: string) => `github:synced:${board}`
const LOCK_KEY = 'github:sync:lock'
const SYNC_CONCURRENCY = 4

type BoardOutcome = 'skipped' | 'synced' | 'unchanged' | 'failed' | 'backoff'

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

async function syncBoard(board: string): Promise<BoardOutcome> {
  const files = await getLinkedFiles(board)
  if (!files.some(f => f.verified)) return 'skipped'
  // A legacy alias is not a live board (some are beneficiary wallets), so reading it as one only
  // reverts. Its current board's sync already matches the alias's delimiters; surface links that
  // were left under the alias instead of the current board.
  const successors = currentBoardsForLegacy(board)
  if (successors.length) {
    console.warn(`[cron/github-sync] ${board} is a legacy alias of ${successors.join(', ')}; its verified links are not synced until moved to the current board`)
    return 'skipped'
  }
  try {
    const state = await readBillboardState(board as `0x${string}`)
    const signature = billboardSignature(state)
    const [previous, lastFailure] = await Promise.all([
      kv.get<SyncRecord>(syncedKey(board)),
      kv.get<SyncRecord>(syncFailedKey(board)),
    ])
    const decision = syncDecision(signature, previous, lastFailure)
    if (decision !== 'sync') return decision
    const outcome = await syncMarkeeFile(board as `0x${string}`, state)
    const results = (outcome.body.results ?? []) as SyncFileResult[]
    const result = boardSyncResult(results)
    if (result === 'synced') {
      await kv.set(syncedKey(board), { signature, at: Date.now() })
      return 'synced'
    }
    // Only a board whose every file is current is recorded as synced. Otherwise a file that failed
    // would keep its old message until the daily resync.
    const failed = results.filter(r => !r.success)
    const reason = failed.map(r => `${r.repoFullName}/${r.filePath}: ${r.error}`).join('; ') || (outcome.body.error as string | undefined) || `status ${outcome.status}`
    const partial = failed.length < results.length ? ` (${results.length - failed.length} of ${results.length} files synced)` : ''
    if (result === 'backoff') {
      console.warn(`[cron/github-sync] ${board} sync failed${partial}: ${reason}; retrying in ${FAILED_RETRY_MS / 3_600_000}h unless its billboard changes`)
      await kv.set(syncFailedKey(board), { signature, at: Date.now() }, { ex: Math.ceil(FAILED_RETRY_MS / 1000) })
    } else {
      console.warn(`[cron/github-sync] ${board} sync failed${partial}: ${reason}; temporary, retrying next run`)
    }
    return 'failed'
  } catch (err) {
    console.error(`[cron/github-sync] ${board}`, err)
    return 'failed'
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: maxDuration + 30 })) return NextResponse.json({ skipped: 'already running' })
  try {
    const boards = await linkedBoards()
    const outcomes = await mapSettled(boards, SYNC_CONCURRENCY, syncBoard)
    const summary = { boards: 0, synced: 0, unchanged: 0, failed: 0, backoff: 0 }
    outcomes.forEach((result, i) => {
      if (result.status === 'rejected') console.error(`[cron/github-sync] ${boards[i]}`, result.reason)
      const outcome = result.status === 'fulfilled' ? result.value : 'failed'
      if (outcome === 'skipped') return
      summary.boards++
      summary[outcome]++
    })
    console.log('[cron/github-sync] summary', JSON.stringify(summary))
    return NextResponse.json(summary)
  } finally {
    await kv.del(LOCK_KEY)
  }
}
