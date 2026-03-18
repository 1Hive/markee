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
 * 2. LeaderboardFactory (0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d)
 *    → RPC via Alchemy: call getLeaderboards() on factory to get child
 *      strategy addresses, then getLogs for FundsAdded events on each.
 *      Scales automatically as new leaderboards are created.
 *
 * Farcaster: fetch followers of Markee FID via api.farcaster.xyz,
 * award 1 point per unique FID (deduped in KV, permanent).
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { pushBatch, ethToPoints, type PushEventInput } from '@/lib/superfluid/points'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─── Contract addresses ───────────────────────────────────────────────────────

const LEGACY_TOPDAWG_ADDRESS = '0x7a6ce4d457ac1a31513bdeff924ff942150d293e'
const LEADERBOARD_FACTORY_ADDRESS = '0x45ce642d1dc0638887e3312c95a66fa8fcbae09d'

// Block the LeaderboardFactory was deployed — avoids scanning from genesis
const FACTORY_DEPLOY_BLOCK = 43452028n

// ─── Config ───────────────────────────────────────────────────────────────────

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE ||
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_STUDIO

const ALCHEMY_URL = process.env.ALCHEMY_BASE_URL
const MARKEE_FARCASTER_FID = process.env.MARKEE_FARCASTER_FID
const FARCASTER_API_KEY = process.env.FARCASTER_API_KEY

// ─── KV keys ─────────────────────────────────────────────────────────────────

const KV_SUBGRAPH_LAST_BLOCK = 'superfluid:cron:lastBlock'    // Legacy TopDawg cursor
const KV_RPC_LAST_BLOCK = 'superfluid:cron:rpcLastBlock'      // LeaderboardFactory cursor
const KV_FARCASTER_PREFIX = 'superfluid:farcaster:fid:'

const API_BATCH_SIZE = 100
const SUBGRAPH_PAGE_SIZE = 1000

// ─── 1. Subgraph (Legacy TopDawg) ────────────────────────────────────────────

const FUNDS_ADDED_QUERY = `
  query FundsAddedSince($strategies: [String!]!, $afterBlock: BigInt!, $skip: Int!) {
    fundsAddeds(
      where: {
        markee_: { pricingStrategy_in: $strategies }
        blockNumber_gt: $afterBlock
      }
      orderBy: blockNumber
      orderDirection: asc
      first: ${SUBGRAPH_PAGE_SIZE}
      skip: $skip
    ) {
      id
      addedBy
      amount
      transactionHash
      blockNumber
      markee { pricingStrategy }
    }
  }
`

interface SubgraphFundsEvent {
  id: string
  addedBy: string
  amount: string
  transactionHash: string
  blockNumber: string
  markee: { pricingStrategy: string }
}

async function fetchSubgraphEvents(afterBlock: number): Promise<SubgraphFundsEvent[]> {
  if (!SUBGRAPH_URL) throw new Error('NEXT_PUBLIC_SUBGRAPH_URL_BASE is not set')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const graphToken = process.env.GRAPH_TOKEN || process.env.NEXT_PUBLIC_GRAPH_TOKEN
  if (graphToken) headers['Authorization'] = `Bearer ${graphToken}`

  // debug
  console.log(`[cron] Subgraph URL: ${SUBGRAPH_URL?.slice(0, 60)} Token: ${graphToken ? graphToken.slice(0, 8) + '...' : 'MISSING'}`)

  const all: SubgraphFundsEvent[] = []
  let skip = 0

  while (true) {
    const res = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: FUNDS_ADDED_QUERY,
        variables: {
          strategies: [LEGACY_TOPDAWG_ADDRESS],
          afterBlock: String(afterBlock),
          skip,
        },
      }),
    })

    const json = await res.json()
    if (!res.ok || json.errors) {
      console.error(`[cron] Subgraph HTTP ${res.status}:`, json.errors?.[0]?.message ?? JSON.stringify(json))
      throw new Error(`Subgraph error: ${json.errors?.[0]?.message ?? res.status}`)
    }

    const page: SubgraphFundsEvent[] = json.data?.fundsAddeds ?? []
    all.push(...page)

    if (page.length < SUBGRAPH_PAGE_SIZE) break
    skip += SUBGRAPH_PAGE_SIZE
  }

  return all
}

// ─── 2. RPC (LeaderboardFactory children) ────────────────────────────────────

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

async function fetchLeaderboardAddresses(): Promise<string[]> {
  const client = getRpcClient()
  const addresses = await client.readContract({
    address: LEADERBOARD_FACTORY_ADDRESS as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'getLeaderboards',
    args: [0n, 1000n],
  })
  return (addresses as string[]).map(a => a.toLowerCase())
}

interface RpcFundsEvent {
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
    const user = data?.result?.user ?? {}

    // debug
    console.log(`[cron] FID ${fid} user keys: ${Object.keys(user).join(', ')}`)

    const verified: string[] = user.verifiedAddresses?.eth_addresses ?? user.verifications ?? []
    if (verified.length > 0) return verified[0].toLowerCase()
    if (typeof user.custodyAddress === 'string' && user.custodyAddress.startsWith('0x')) {
      return user.custodyAddress.toLowerCase()
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
    legacy: { fetched: 0, pushed: 0, failed: 0, newHighBlock: 0 },
    factory: { leaderboards: 0, fetched: 0, pushed: 0, failed: 0, newHighBlock: 0 },
    farcaster: { followers: 0, newAwards: 0, failed: 0 },
    durationMs: 0,
  }

  // ── 1. Legacy TopDawg via subgraph ────────────────────────────────────────

  try {
    const lastBlockRaw = await kv.get<number | string>(KV_SUBGRAPH_LAST_BLOCK)
    const lastBlock = lastBlockRaw ? Number(lastBlockRaw) : 0
    console.log(`[cron] Legacy: fetching after block ${lastBlock}`)

    const events = await fetchSubgraphEvents(lastBlock)
    results.legacy.fetched = events.length
    console.log(`[cron] Legacy: found ${events.length} events`)

    if (events.length > 0) {
      const pushInputs: PushEventInput[] = events
        .filter(e => e.addedBy.toLowerCase() !== e.markee.pricingStrategy.toLowerCase())
        .map(e => ({
          event: 'ADD_FUNDS' as const,
          account: e.addedBy.toLowerCase(),
          points: ethToPoints(e.amount),
          uniqueId: `${e.transactionHash}-${e.id.split('-').pop()}`,
        }))

      const { pushed, failed } = await pushInBatches(pushInputs)
      results.legacy.pushed = pushed
      results.legacy.failed = failed

      const highestBlock = Math.max(...events.map(e => parseInt(e.blockNumber, 10)))
      await kv.set(KV_SUBGRAPH_LAST_BLOCK, highestBlock)
      results.legacy.newHighBlock = highestBlock
    }
  } catch (e: any) {
    console.error('[cron] Legacy subgraph error:', e.message)
  }

  // ── 2. LeaderboardFactory children via RPC ────────────────────────────────

  if (ALCHEMY_URL) {
    try {
      const leaderboardAddresses = await fetchLeaderboardAddresses()
      results.factory.leaderboards = leaderboardAddresses.length
      console.log(`[cron] Factory: ${leaderboardAddresses.length} leaderboard(s)`)

      if (leaderboardAddresses.length > 0) {
        const client = getRpcClient()
        const latestBlock = await client.getBlockNumber()

        const storedBlock = await kv.get<string>(KV_RPC_LAST_BLOCK)
        const fromBlock = storedBlock ? BigInt(storedBlock) : FACTORY_DEPLOY_BLOCK
        const toBlock = latestBlock

        console.log(`[cron] Factory: getLogs from ${fromBlock} to ${toBlock}`)

        const events = await fetchRpcEvents(leaderboardAddresses, fromBlock, toBlock)
        results.factory.fetched = events.length
        console.log(`[cron] Factory: found ${events.length} events`)

        if (events.length > 0) {
          const pushInputs: PushEventInput[] = events
            .filter(e => !leaderboardAddresses.includes(e.addedBy))
            .map(e => ({
              event: 'ADD_FUNDS' as const,
              account: e.addedBy,
              points: ethToPoints(e.amount),
              uniqueId: `${e.transactionHash}-${e.logIndex}`,
            }))

          const { pushed, failed } = await pushInBatches(pushInputs)
          results.factory.pushed = pushed
          results.factory.failed = failed
        }

        await kv.set(KV_RPC_LAST_BLOCK, toBlock.toString())
        results.factory.newHighBlock = Number(toBlock.toString())
      }
    } catch (e: any) {
      console.error('[cron] Factory RPC error:', e.message)
    }
  } else {
    console.log('[cron] Skipping factory — ALCHEMY_BASE_URL not set')
  }

  // ── 3. Farcaster follows ──────────────────────────────────────────────────

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
