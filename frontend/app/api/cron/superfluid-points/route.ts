/**
 * GET /api/cron/superfluid-points
 *
 * Vercel cron job — runs every hour
 * Authoritative source of truth for Superfluid campaign points.
 * Works regardless of which frontend the user transacted on.
 *
 * What it does each run:
 *   1. Fetch new FundsAdded events from the subgraph since last run
 *      (cursor stored in KV as the last processed block number)
 *   2. Push points to the Superfluid API — 1 pt per 0.0001 ETH
 *      (txHash as uniqueId — safe to reprocess, API deduplicates)
 *   3. Fetch current followers of Markee on Farcaster via Neynar
 *   4. Award 1 point per unique follower FID not yet awarded
 *      (FID stored in KV to prevent re-awarding on unfollow/refollow)
 *
 * Scoped strategy contracts (Base):
 *   Legacy TopDawg:       0x7A6CE4d457AC1A31513BDEFf924FF942150D293E
 *   LeaderboardFactory:   0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { pushBatch, ethToPoints, type PushEventInput } from '@/lib/superfluid/points'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — enough for subgraph pagination + Neynar

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPERFLUID_STRATEGY_ADDRESSES = [
  '0x7a6ce4d457ac1a31513bdeff924ff942150d293e', // Legacy TopDawg
  '0x45ce642d1dc0638887e3312c95a66fa8fcbae09d', // LeaderboardFactory
]

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE ||
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_STUDIO

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY
const MARKEE_FARCASTER_FID = process.env.MARKEE_FARCASTER_FID

// KV keys
const KV_LAST_BLOCK = 'superfluid:cron:lastBlock'       // last processed block number
const KV_FARCASTER_PREFIX = 'superfluid:farcaster:fid:' // superfluid:farcaster:fid:{fid} → address

const API_BATCH_SIZE = 100 // Superfluid API max per push request
const SUBGRAPH_PAGE_SIZE = 1000

// ─── Subgraph query ───────────────────────────────────────────────────────────

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
      timestamp
      markee {
        pricingStrategy
      }
    }
  }
`

interface FundsAddedEvent {
  id: string
  addedBy: string
  amount: string
  transactionHash: string
  blockNumber: string
  timestamp: string
  markee: { pricingStrategy: string }
}

async function fetchNewFundsEvents(afterBlock: number): Promise<FundsAddedEvent[]> {
  if (!SUBGRAPH_URL) throw new Error('NEXT_PUBLIC_SUBGRAPH_URL_BASE is not set')

  const all: FundsAddedEvent[] = []
  let skip = 0

  // Build headers once — include Graph auth token if available
  const subgraphHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.NEXT_PUBLIC_GRAPH_TOKEN) {
    subgraphHeaders['Authorization'] = `Bearer ${process.env.NEXT_PUBLIC_GRAPH_TOKEN}`
  }

  while (true) {
    const res = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: subgraphHeaders,
      body: JSON.stringify({
        query: FUNDS_ADDED_QUERY,
        variables: {
          strategies: SUPERFLUID_STRATEGY_ADDRESSES,
          afterBlock: String(afterBlock),
          skip,
        },
      }),
    })

    const json = await res.json()
    if (json.errors) throw new Error(`Subgraph error: ${json.errors[0].message}`)

    const page: FundsAddedEvent[] = json.data?.fundsAddeds ?? []
    all.push(...page)

    if (page.length < SUBGRAPH_PAGE_SIZE) break
    skip += SUBGRAPH_PAGE_SIZE
  }

  return all
}

// ─── Farcaster helpers ────────────────────────────────────────────────────────

interface NeynarFollower {
  fid: number
  custody_address: string
  verified_addresses: { eth_addresses: string[] }
}

async function fetchMarkeeFollowers(): Promise<NeynarFollower[]> {
  if (!NEYNAR_API_KEY || !MARKEE_FARCASTER_FID) return []

  const followers: NeynarFollower[] = []
  let cursor: string | null = null

  while (true) {
    const params = new URLSearchParams({
      fid: MARKEE_FARCASTER_FID,
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/followers?${params}`,
      { headers: { 'x-api-key': NEYNAR_API_KEY } }
    )

    if (!res.ok) {
      console.error('[cron/superfluid-points] Neynar followers error:', res.status)
      break
    }

    const data = await res.json()
    const users: NeynarFollower[] = data?.users ?? []
    followers.push(...users)

    cursor = data?.next?.cursor ?? null
    if (!cursor) break
  }

  return followers
}

/**
 * Pick the best wallet address from a Neynar follower.
 * Prefers the first verified ETH address, falls back to custody address.
 */
function primaryAddressForFollower(follower: NeynarFollower): string | null {
  const verified = follower.verified_addresses?.eth_addresses ?? []
  if (verified.length > 0) return verified[0].toLowerCase()
  if (follower.custody_address?.startsWith('0x')) return follower.custody_address.toLowerCase()
  return null
}

// ─── Batch push helper ────────────────────────────────────────────────────────

async function pushInBatches(events: PushEventInput[]): Promise<{
  pushed: number
  failed: number
}> {
  let pushed = 0
  let failed = 0

  for (let i = 0; i < events.length; i += API_BATCH_SIZE) {
    const batch = events.slice(i, i + API_BATCH_SIZE)
    const result = await pushBatch(batch)
    if (result.success) {
      pushed += result.eventCount ?? batch.length
    } else {
      failed += batch.length
      console.error('[cron/superfluid-points] Batch push failed:', result.error)
    }
    // Small delay between batches to be a good API citizen
    if (i + API_BATCH_SIZE < events.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return { pushed, failed }
}

// ─── Cron handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel cron authentication
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const results = {
    fundsEvents: { fetched: 0, pushed: 0, failed: 0, newHighBlock: 0 },
    farcaster: { followers: 0, newAwards: 0, failed: 0 },
    durationMs: 0,
  }

  // ── 1. Fund events ──────────────────────────────────────────────────────────

  try {
    const lastBlock = (await kv.get<number>(KV_LAST_BLOCK)) ?? 0
    console.log(`[cron/superfluid-points] Fetching FundsAdded events after block ${lastBlock}`)

    const events = await fetchNewFundsEvents(lastBlock)
    results.fundsEvents.fetched = events.length
    console.log(`[cron/superfluid-points] Found ${events.length} new events`)

    if (events.length > 0) {
      const pushInputs: PushEventInput[] = events.map(e => ({
        // We use add_funds for all since buy_message isn't distinguishable here
        // without joining against MarkeeCreated events. Both earn identical points.
        event: 'ADD_FUNDS' as const,
        account: e.addedBy.toLowerCase(),
        points: ethToPoints(e.amount),
        // txHash + logIndex suffix guarantees uniqueness within a tx that emits
        // multiple FundsAdded events (e.g. batch operations)
        uniqueId: `${e.transactionHash}-${e.id.split('-').pop()}`,
      }))

      const { pushed, failed } = await pushInBatches(pushInputs)
      results.fundsEvents.pushed = pushed
      results.fundsEvents.failed = failed

      // Advance cursor to the highest block we processed
      const highestBlock = Math.max(...events.map(e => parseInt(e.blockNumber, 10)))
      await kv.set(KV_LAST_BLOCK, highestBlock)
      results.fundsEvents.newHighBlock = highestBlock
    }
  } catch (e: any) {
    console.error('[cron/superfluid-points] Fund events error:', e.message)
    // Don't return early — still try Farcaster
  }

  // ── 2. Farcaster follows ────────────────────────────────────────────────────

  if (NEYNAR_API_KEY && MARKEE_FARCASTER_FID) {
    try {
      const followers = await fetchMarkeeFollowers()
      results.farcaster.followers = followers.length
      console.log(`[cron/superfluid-points] ${followers.length} Markee followers on Farcaster`)

      const followPushInputs: PushEventInput[] = []

      for (const follower of followers) {
        const address = primaryAddressForFollower(follower)
        if (!address) continue

        // Check if this FID has already been awarded
        const kvKey = `${KV_FARCASTER_PREFIX}${follower.fid}`
        const alreadyAwarded = await kv.get(kvKey)
        if (alreadyAwarded) continue

        followPushInputs.push({
          event: 'FARCASTER_FOLLOW' as const,
          account: address,
          points: 1,
          // FID-scoped uniqueId: if they unfollow and refollow,
          // the Superfluid API deduplicates using this.
          uniqueId: `fid:${follower.fid}`,
        })

        // Mark as awarded in KV (1 year TTL — effectively permanent)
        await kv.set(kvKey, address, { ex: 60 * 60 * 24 * 365 })
      }

      if (followPushInputs.length > 0) {
        console.log(`[cron/superfluid-points] Awarding ${followPushInputs.length} new Farcaster followers`)
        const { pushed, failed } = await pushInBatches(followPushInputs)
        results.farcaster.newAwards = pushed
        results.farcaster.failed = failed
      }
    } catch (e: any) {
      console.error('[cron/superfluid-points] Farcaster error:', e.message)
    }
  } else {
    console.log('[cron/superfluid-points] Skipping Farcaster — NEYNAR_API_KEY or MARKEE_FARCASTER_FID not set')
  }

  results.durationMs = Date.now() - startTime
  console.log('[cron/superfluid-points] Done:', results)

  return NextResponse.json({ ok: true, ...results })
}
