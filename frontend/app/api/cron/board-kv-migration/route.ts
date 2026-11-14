/**
 * Board KV migration: copies address-keyed KV state from each migrated legacy board and Markee to its
 * successor (see lib/migration/boardKv.ts). Safe to repeat, so it runs every few minutes and picks up
 * boards as their migrations finish.
 *
 *   GET /api/cron/board-kv-migration
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { V14_FACTORIES_DEPLOY_BLOCK } from '@/lib/contracts/addresses'
import {
  COPIED_BOARDS_KEY, LOG_CURSOR_KEY, attachTimestamps, buildPlan, executePlan, fetchMigrationLogs,
  finishedMigrationMap, restStore, restrictMap, type Client, type MigrationLog,
} from '@/lib/migration/boardKv'
import { logger } from '@/lib/server/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LOCK_KEY = 'lock:cron:board-kv-migration'
const LOCK_TTL = maxDuration + 30
const MAX_BLOCKS_PER_RUN = 200_000n
const MAX_BOARDS_PER_RUN = 100

type StoredLog = Omit<MigrationLog, 'blockNumber'> & { blockNumber: string }
interface LogCursor { toBlock: string; logs: StoredLog[] }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === secret
}

function client(): Client {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
  }) as Client
}

async function syncLogs(chain: Client, copied: ReadonlySet<string>): Promise<{ logs: MigrationLog[]; caughtUp: boolean }> {
  const cursor = await kv.get<LogCursor>(LOG_CURSOR_KEY)
  const notCopied = (log: { legacyBoard: string }) => !copied.has(log.legacyBoard.toLowerCase())
  const stored = (cursor?.logs ?? []).filter(notCopied).map(log => ({ ...log, blockNumber: BigInt(log.blockNumber) }) as MigrationLog)
  const from = cursor ? BigInt(cursor.toBlock) + 1n : V14_FACTORIES_DEPLOY_BLOCK
  const head = await chain.getBlockNumber()
  if (from > head) return { logs: stored, caughtUp: true }
  const to = from + MAX_BLOCKS_PER_RUN - 1n < head ? from + MAX_BLOCKS_PER_RUN - 1n : head
  const logs = [...stored, ...(await fetchMigrationLogs(chain, from, to)).filter(notCopied)]
  await kv.set(LOG_CURSOR_KEY, { toBlock: to.toString(), logs: logs.map(log => ({ ...log, blockNumber: log.blockNumber.toString() })) })
  return { logs, caughtUp: to === head }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return NextResponse.json({ error: 'KV is not configured' }, { status: 500 })

  const acquired = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: LOCK_TTL }) === 'OK'
  if (!acquired) return NextResponse.json({ ok: true, skipped: 'previous run still in flight' })

  try {
    const chain = client()
    const copied = new Set((await kv.smembers(COPIED_BOARDS_KEY)).map(board => String(board).toLowerCase()))
    const { logs, caughtUp } = await syncLogs(chain, copied)
    const map = await finishedMigrationMap(chain, logs)
    const waiting = [...map.boards.keys()].filter(board => !copied.has(board))
    if (waiting.length === 0) return NextResponse.json({ ok: true, copied: copied.size, caughtUp })

    const batch = restrictMap(map, { only: new Set(waiting), limit: MAX_BOARDS_PER_RUN })
    await attachTimestamps(chain, batch)
    const store = restStore(url, token)
    const plan = await buildPlan(store, batch)
    const writes = await executePlan(store, plan)
    const boards = [...batch.boards.keys()]
    await kv.sadd(COPIED_BOARDS_KEY, boards[0], ...boards.slice(1))

    const report = {
      ok: true, caughtUp, copied: copied.size + boards.length, copiedThisRun: boards.length, remaining: waiting.length - boards.length,
      writes, scanned: plan.scanned, unclassified: plan.unclassified.length, mismatched: plan.mismatched.length,
    }
    logger.info('cron/board-kv-migration copied', report)
    return NextResponse.json(report)
  } catch (error) {
    await logger.error('board kv migration failed', error)
    return NextResponse.json({ error: 'Board KV migration failed' }, { status: 500 })
  } finally {
    await kv.del(LOCK_KEY).catch(() => {})
  }
}
