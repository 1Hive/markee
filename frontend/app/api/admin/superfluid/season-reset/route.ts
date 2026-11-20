/**
 * GET /api/admin/superfluid/season-reset
 *
 * Resets the points cron's block pointers so a new season's accumulation
 * starts at the current block. Leaderboard listings always show live on-chain
 * funds, so this also removes any per-board season baselines left in KV.
 *
 * Usage:
 *   curl -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/superfluid/season-reset
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { BOARD_MIGRATORS, V14_FACTORIES } from '@/lib/contracts/addresses'
import { listVisibleBoards } from '@/lib/contracts/migration'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPERFLUID_FACTORY = '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as `0x${string}`

const BASELINE_PREFIX = 'superfluid:s6:baseline:'
const KV_RPC_LAST_BLOCK = 'superfluid:cron:rpcLastBlock'
const KV_SF_MIG_LAST_BLOCK = 'superfluid:cron:sfMigLastBlock'
const KV_V14_LAST_BLOCK = 'superfluid:cron:v14LastBlock'
const CACHE_KEY = 'cache:superfluid:leaderboards'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org'),
  })

  const { boards: addresses, predecessorOf } = await listVisibleBoards(client, BOARD_MIGRATORS.SUPERFLUID, [SUPERFLUID_FACTORY, V14_FACTORIES.SUPERFLUID])

  // Migrated boards copy their legacy board's KV keys, so clear the legacy keys as well.
  const boards = [...new Set([...addresses, ...predecessorOf.values()].map(a => a.toLowerCase()))]
  const baselineKeys = boards.map(a => `${BASELINE_PREFIX}${a}`)
  const removedBaselines = baselineKeys.length > 0 ? await kv.del(...baselineKeys) : 0

  const latestBlock = await client.getBlockNumber()
  await Promise.all([
    kv.set(KV_RPC_LAST_BLOCK, latestBlock.toString()),
    kv.set(KV_SF_MIG_LAST_BLOCK, latestBlock.toString()),
    kv.set(KV_V14_LAST_BLOCK, latestBlock.toString()),
    kv.del(CACHE_KEY),
    kv.del(`sdk:snapshots:v1:listings:${CACHE_KEY}`),
  ])

  return NextResponse.json({
    ok: true,
    removedBaselines,
    seasonStartBlock: latestBlock.toString(),
  })
}
