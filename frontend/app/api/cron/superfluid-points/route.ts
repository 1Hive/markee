/**
 * GET /api/cron/superfluid-points
 *
 * Vercel cron job — runs every hour.
 * Authoritative source of truth for Superfluid campaign points.
 * Works regardless of which frontend the user transacted on.
 *
 * Two data sources:
 *
 * 1. Legacy TopDawg (0x7A6CE4d457AC1A31513BDEFf924FF942150D293E)
 *    → Subgraph (already indexed, reliable)
 *
 * 2. LeaderboardFactory v1.3 (0xC497187AAa35C26b0008B43C10A6F6300b7eBcad) and its
 *    beacon-backed v1.4 successor factory
 *    → RPC via Alchemy: call getLeaderboards() on each factory to get child
 *      strategy addresses, then getLogs for FundsAdded events on each.
 *      Scales automatically as new leaderboards are created. Migrated
 *      successors are seeded by migrateFromLegacy, which emits no FundsAdded,
 *      so carried-over totals are never awarded twice.
 *
 * Farcaster: fetch followers of Markee FID via api.farcaster.xyz,
 * award 1 point per unique FID (deduped in KV, permanent).
 * Wallet address pulled from extras.ethWallets / extras.custodyAddress.
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import { base } from 'viem/chains'
import { BOARD_MIGRATORS, V14_FACTORIES, V14_FACTORIES_DEPLOY_BLOCK } from '@/lib/contracts/addresses'
import { visibleBoards } from '@/lib/contracts/migration'
import { isBoostedBoard, successorsOf } from '@/lib/contracts/successorAliases'
import { pushBatch, ethToPoints, type PushEventInput } from '@/lib/superfluid/points'
import type { BoostedMarkee } from '@/app/api/superfluid/boosted/route'

const BOOSTED_KEY = 'superfluid:s6:boosted'
const BOOSTED_MULTIPLIER = 5

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─── Contract addresses ───────────────────────────────────────────────────────

const LEADERBOARD_FACTORY_ADDRESS = '0xc497187aaa35c26b0008b43c10a6f6300b7ebcad'
// v1.3 Superfluid leaderboard (migrated from v1.2 via migrate-to-v13.sh)
const SF_MIGRATION_LEADERBOARD = '0xaa37d049dfbfc07f9e8526a4a9bde418df9f1b79'

const FACTORY_DEPLOY_BLOCK = 46059000n
// From subgraph.yaml — TopDawgPartnerStrategySuperfluid startBlock

// ─── Config ───────────────────────────────────────────────────────────────────

const ALCHEMY_URL = process.env.ALCHEMY_BASE_URL
const MARKEE_FARCASTER_FID = process.env.MARKEE_FARCASTER_FID
const FARCASTER_API_KEY = process.env.FARCASTER_API_KEY

// ─── KV keys ─────────────────────────────────────────────────────────────────

// Each address family has its own last-processed block so adding a new source
// doesn't cause it to silently skip events that happened before the addition.
const KV_RPC_LAST_BLOCK = 'superfluid:cron:rpcLastBlock'        // factory leaderboards
const KV_V14_LAST_BLOCK = 'superfluid:cron:v14LastBlock'        // v1.4 factory leaderboards
const KV_SF_MIG_LAST_BLOCK = 'superfluid:cron:sfMigLastBlock'   // SF migration leaderboard
const KV_FARCASTER_PREFIX = 'superfluid:farcaster:fid:'

const API_BATCH_SIZE = 100

// ─── RPC events ───────────────────────────────────────────────────────────────

// v1.1 leaderboard contracts (factory children + SF migration leaderboard)
const FUNDS_ADDED_EVENT = parseAbiItem(
  'event FundsAdded(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 newMarkeeTotal)'
)


const FACTORY_ABI = [
  {
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    name: 'getLeaderboards',
    outputs: [{ name: 'result', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

function getRpcClient() {
  if (!ALCHEMY_URL) throw new Error('ALCHEMY_BASE_URL is not set')
  return createPublicClient({ chain: base, transport: http(ALCHEMY_URL) })
}

async function fetchLeaderboardAddresses(factory: string): Promise<string[]> {
  const client = getRpcClient()
  const addresses = await client.readContract({
    address: factory as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'getLeaderboards',
    args: [0n, 1000n],
  })
  return (addresses as string[]).map(a => a.toLowerCase())
}

type FactoryScan = { factory: string; boards: string[]; blockKey: string; deployBlock: bigint }

interface RpcFundsEvent {
  leaderboardAddress: string
  addedBy: string
  amount: bigint
  transactionHash: string
  blockNumber: bigint
  logIndex: number
}

async function fetchRpcEvents(
  leaderboardAddresses: string[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RpcFundsEvent[]> {
  if (leaderboardAddresses.length === 0) return []

  const client = getRpcClient()
  const CHUNK_SIZE = 9000n
  const all: RpcFundsEvent[] = []
  let start = fromBlock

  while (start <= toBlock) {
    const end = start + CHUNK_SIZE - 1n > toBlock ? toBlock : start + CHUNK_SIZE - 1n

    const logs = await client.getLogs({
      address: leaderboardAddresses as `0x${string}`[],
      event: FUNDS_ADDED_EVENT,
      fromBlock: start,
      toBlock: end,
    })

    all.push(...logs
      .filter(log => log.transactionHash && log.blockNumber !== null)
      .map(log => ({
        leaderboardAddress: log.address.toLowerCase(),
        addedBy: ((log.args as any).addedBy as string).toLowerCase(),
        amount: (log.args as any).amount as bigint,
        transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!,
        logIndex: log.logIndex ?? 0,
      }))
    )

    start = end + 1n
  }

  return all
}

// ─── 3. Farcaster (api.farcaster.xyz — requires FARCASTER_API_KEY) ───────────

interface WarpcastFollower {
  fid: number
  username: string
}

async function fetchMarkeeFollowerFids(): Promise<WarpcastFollower[]> {
  if (!MARKEE_FARCASTER_FID) return []

  const followers: WarpcastFollower[] = []
  let cursor: string | undefined

  while (true) {
    const url = `https://api.farcaster.xyz/v2/followers?fid=${MARKEE_FARCASTER_FID}&limit=50${cursor ? `&cursor=${cursor}` : ''}`
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Markee/1.0; +https://markee.xyz)',
        ...(FARCASTER_API_KEY ? { 'Authorization': FARCASTER_API_KEY } : {}),
      },
    })

    if (!res.ok) {
      console.error('[cron] Warpcast followers error:', res.status)
      break
    }

    const data = await res.json()
    const users = data?.result?.users ?? []
    followers.push(...users.map((u: any) => ({ fid: u.fid, username: u.username ?? '' })))

    cursor = data?.result?.next?.cursor
    if (!cursor) break
  }

  return followers
}

async function fetchUserAddress(fid: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.farcaster.xyz/v2/user-by-fid?fid=${fid}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(FARCASTER_API_KEY ? { 'Authorization': FARCASTER_API_KEY } : {}),
        },
      }
    )
    if (!res.ok) {
      console.error(`[cron] user-by-fid ${fid} HTTP ${res.status}`)
      return null
    }

    const data = await res.json()
    const extras = data?.result?.extras ?? {}

    // Prefer wallet labeled "primary" (user's chosen primary wallet in Warpcast)
    const walletLabels: any[] = extras.walletLabels ?? []
    const primaryLabel = walletLabels.find(
      (w: any) => w.labels?.includes('primary') && typeof w.address === 'string' && w.address.startsWith('0x')
    )
    if (primaryLabel?.address) return primaryLabel.address.toLowerCase()

    // Fall back to first ethWallet
    const ethWallets: string[] = extras.ethWallets ?? []
    if (ethWallets.length > 0) return ethWallets[0].toLowerCase()

    // Last resort: custody address
    if (typeof extras.custodyAddress === 'string' && extras.custodyAddress.startsWith('0x')) {
      return extras.custodyAddress.toLowerCase()
    }

    return null
  } catch (e: any) {
    console.error(`[cron] fetchUserAddress ${fid} error:`, e.message)
    return null
  }
}

// ─── Batch push helper ────────────────────────────────────────────────────────

async function pushInBatches(events: PushEventInput[]): Promise<{ pushed: number; failed: number }> {
  let pushed = 0
  let failed = 0

  for (let i = 0; i < events.length; i += API_BATCH_SIZE) {
    const batch = events.slice(i, i + API_BATCH_SIZE)
    const result = await pushBatch(batch)
    if (result.success) {
      pushed += result.eventCount ?? batch.length
    } else {
      failed += batch.length
      console.error('[cron] Batch push failed:', result.error)
    }
    if (i + API_BATCH_SIZE < events.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return { pushed, failed }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const results = {
    factory:  { leaderboards: 0, fetched: 0, pushed: 0, failed: 0, newHighBlock: 0 },
    sfMig:    { fetched: 0, pushed: 0, failed: 0 },
    farcaster: { followers: 0, newAwards: 0, failed: 0 },
    durationMs: 0,
  }

  if (ALCHEMY_URL) {
    const client = getRpcClient()
    const latestBlock = await client.getBlockNumber()

    // Fetch boosted set once for multiplier checks
    const boostedList = await kv.get<BoostedMarkee[]>(BOOSTED_KEY).catch(() => null)
    const boostedAddrs = new Set((boostedList ?? []).map(b => b.address.toLowerCase()))

    // ── 1. LeaderboardFactory children (v1.1 FundsAdded event) ────────────────
    // v1.4 children keep their own block key so they backfill from the v1.4 factory deploy
    // regardless of when this scan was added; uniqueId dedup prevents double-awards.
    let predecessorOf = new Map<string, Address>()
    try {
      const [v13Boards, v14Boards] = await Promise.all([
        fetchLeaderboardAddresses(LEADERBOARD_FACTORY_ADDRESS),
        fetchLeaderboardAddresses(V14_FACTORIES.SUPERFLUID),
      ])
      const leaderboardAddresses = [...v13Boards, ...v14Boards]
      results.factory.leaderboards = leaderboardAddresses.length
      console.log(`[cron] Factory: ${v13Boards.length} v1.3 + ${v14Boards.length} v1.4 leaderboard(s)`)
      predecessorOf = (await visibleBoards(client, BOARD_MIGRATORS.SUPERFLUID, leaderboardAddresses as Address[])).predecessorOf

      const scans: FactoryScan[] = [
        { factory: LEADERBOARD_FACTORY_ADDRESS, boards: v13Boards, blockKey: KV_RPC_LAST_BLOCK, deployBlock: FACTORY_DEPLOY_BLOCK },
        { factory: V14_FACTORIES.SUPERFLUID, boards: v14Boards, blockKey: KV_V14_LAST_BLOCK, deployBlock: V14_FACTORIES_DEPLOY_BLOCK },
      ]
      for (const scan of scans) {
        if (scan.boards.length === 0) continue
        const storedBlock = await kv.get<string>(scan.blockKey)
        const fromBlock = storedBlock ? BigInt(storedBlock) : scan.deployBlock

        console.log(`[cron] Factory ${scan.factory}: getLogs ${fromBlock}→${latestBlock}`)
        const events = await fetchRpcEvents(scan.boards, fromBlock, latestBlock)
        results.factory.fetched += events.length

        if (events.length > 0) {
          const pushInputs: PushEventInput[] = events
            .filter(e => !leaderboardAddresses.includes(e.addedBy))
            .map(e => {
              const multiplier = isBoostedBoard(e.leaderboardAddress, predecessorOf, boostedAddrs) ? BOOSTED_MULTIPLIER : 1
              return {
                event: 'ADD_FUNDS' as const,
                account: e.addedBy,
                points: ethToPoints(e.amount) * multiplier,
                uniqueId: `${e.transactionHash}-${e.logIndex}`,
              }
            })
          const { pushed, failed } = await pushInBatches(pushInputs)
          results.factory.pushed += pushed
          results.factory.failed += failed
        }

        await kv.set(scan.blockKey, latestBlock.toString())
      }
      results.factory.newHighBlock = Number(latestBlock)
    } catch (e: any) {
      console.error('[cron] Factory RPC error:', e.message)
    }

    // ── 2. SF migration leaderboard (v1.1 FundsAdded, separate block key) ─────
    // Uses its own block key so it backfills from FACTORY_DEPLOY_BLOCK regardless
    // of when it was added to the cron — uniqueId dedup prevents double-awards.
    try {
      const storedBlock = await kv.get<string>(KV_SF_MIG_LAST_BLOCK)
      const fromBlock = storedBlock ? BigInt(storedBlock) : FACTORY_DEPLOY_BLOCK

      console.log(`[cron] SF migration: getLogs ${fromBlock}→${latestBlock}`)
      const sfMigrationBoards = [SF_MIGRATION_LEADERBOARD, ...successorsOf(SF_MIGRATION_LEADERBOARD, predecessorOf)]
      const events = await fetchRpcEvents(sfMigrationBoards, fromBlock, latestBlock)
      results.sfMig.fetched = events.length

      if (events.length > 0) {
        const pushInputs: PushEventInput[] = events
          .filter(e => !sfMigrationBoards.includes(e.addedBy))
          .map(e => {
            const multiplier = isBoostedBoard(e.leaderboardAddress, predecessorOf, boostedAddrs) ? BOOSTED_MULTIPLIER : 1
            return {
              event: 'ADD_FUNDS' as const,
              account: e.addedBy,
              points: ethToPoints(e.amount) * multiplier,
              uniqueId: `${e.transactionHash}-${e.logIndex}`,
            }
          })
        const { pushed, failed } = await pushInBatches(pushInputs)
        results.sfMig.pushed = pushed
        results.sfMig.failed = failed
      }

      await kv.set(KV_SF_MIG_LAST_BLOCK, latestBlock.toString())
    } catch (e: any) {
      console.error('[cron] SF migration RPC error:', e.message)
    }

  } else {
    console.log('[cron] Skipping RPC scans — ALCHEMY_BASE_URL not set')
  }

  // ── Farcaster follows ─────────────────────────────────────────────────────

  if (MARKEE_FARCASTER_FID) {
    try {
      const followers = await fetchMarkeeFollowerFids()
      results.farcaster.followers = followers.length
      console.log(`[cron] Farcaster: ${followers.length} followers`)

      const followPushInputs: PushEventInput[] = []

      for (const follower of followers) {
        const kvKey = `${KV_FARCASTER_PREFIX}${follower.fid}`
        const alreadyAwarded = await kv.get(kvKey)
        if (alreadyAwarded) continue

        const address = await fetchUserAddress(follower.fid)
        if (!address) continue

        followPushInputs.push({
          event: 'FARCASTER_FOLLOW' as const,
          account: address,
          points: 1,
          uniqueId: `fid:${follower.fid}`,
        })

        await kv.set(kvKey, address, { ex: 60 * 60 * 24 * 365 })
        await new Promise(r => setTimeout(r, 100))
      }

      if (followPushInputs.length > 0) {
        console.log(`[cron] Farcaster: awarding ${followPushInputs.length} new followers`)
        const { pushed, failed } = await pushInBatches(followPushInputs)
        results.farcaster.newAwards = pushed
        results.farcaster.failed = failed
      }
    } catch (e: any) {
      console.error('[cron] Farcaster error:', e.message)
    }
  } else {
    console.log('[cron] Skipping Farcaster — MARKEE_FARCASTER_FID not set')
  }

  results.durationMs = Date.now() - startTime
  console.log('[cron] Done:', results)

  return NextResponse.json({ ok: true, ...results })
}
