// app/api/campaigns/1hive/route.ts
//
// The /1hive "Signs earning bonuses" leaderboard. Every new For Rent or For Sale Markee activated at
// or after ONE_HIVE_CAMPAIGN_START is listed automatically; ONE_HIVE_EXCLUDED_BOARDS removes rejected
// ones. Rules are in lib/campaigns/oneHive.ts. This route only reads:
//
//   - boards and on-chain totals from the cached marketplace listing (/api/ecosystem/leaderboards),
//     which already hides boards without a verified site embed;
//   - activation time from each board's #1 history (lib/leaderboard/topHistory.ts, kept current by
//     the 5-minute moderation scan, from real block timestamps);
//   - views since activation from the daily view counters, summed over the board and every message
//     that has held #1 on it.
//
// Served through the shared listing snapshot cache (60 s fresh), so viewers never fan out to KV/RPC.

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { cachedListing } from '@/lib/leaderboards/cached'
import { readTopHistories } from '@/lib/leaderboard/topHistory'
import { dailyViewsKey } from '@/lib/stats/keys'
import {
  activationTime, campaignOriginal, isCampaignStrategy, isEligibleBoard, siteLabel, utcDay, viewAddresses, viewsSince,
  type CampaignListingRow, type OneHiveSign,
} from '@/lib/campaigns/oneHive'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:campaign:1hive'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

type ListingRow = CampaignListingRow & {
  topMessage?: string | null
  topRateRaw?: string
  topFundsAddedRaw?: string
  totalFundsRaw?: string
  streamedRateRaw?: string
  streamedAt?: number
}

async function load(request: Request) {
  try {
    const bust = new URL(request.url).searchParams.get('bust') === '1'
    const res = await fetch(`${internalOrigin()}/api/ecosystem/leaderboards${bust ? '?bust=1' : ''}`, { cache: 'no-store', headers: internalHeaders() })
    if (!res.ok) throw new Error(`ecosystem listing ${res.status}`)
    const listing = await res.json() as { leaderboards?: ListingRow[]; ethPriceUsd?: number | null; stale?: boolean }

    const candidates = (listing.leaderboards ?? []).filter(isCampaignStrategy)
    const histories = await readTopHistories(candidates.flatMap(r => [r.address, campaignOriginal(r)]))
    const historiesOf = (r: ListingRow) => [...new Set([r.address.toLowerCase(), campaignOriginal(r)])].map(a => histories.get(a))

    const eligible = candidates.flatMap(row => {
      const hs = historiesOf(row)
      const activatedAt = activationTime(hs)
      return isEligibleBoard(row, activatedAt) ? [{ row, hs, activatedAt: activatedAt! }] : []
    })

    // One pipelined KV round trip for every daily counter the eligible signs need.
    const addressesPer = eligible.map(e => viewAddresses(e.row, e.hs))
    const keys = [...new Set(addressesPer.flat())].map(dailyViewsKey)
    const dailies = new Map<string, Record<string, number> | null>()
    if (keys.length) {
      const pipeline = kv.pipeline()
      keys.forEach(k => pipeline.hgetall(k))
      const results = await pipeline.exec<(Record<string, number> | null)[]>()
      keys.forEach((k, i) => dailies.set(k, results[i] ?? null))
    }

    const signs: OneHiveSign[] = eligible.map(({ row, activatedAt }, i) => {
      const streaming = row.strategy === 'streaming'
      return {
        address: row.address,
        site: siteLabel(row),
        strategy: streaming ? 'streaming' : 'fixed',
        topMessage: row.topMessage ?? null,
        topMarkeeAddress: row.topMarkeeAddress ?? null,
        activatedAt,
        views: viewsSince(addressesPer[i].map(a => dailies.get(dailyViewsKey(a))), utcDay(activatedAt)),
        topRateRaw: streaming ? (row.topRateRaw ?? '0') : '0',
        topBidRaw: streaming ? '0' : (row.topFundsAddedRaw ?? '0'),
        totalFundsRaw: row.totalFundsRaw ?? '0',
        streamedRateRaw: streaming ? (row.streamedRateRaw ?? '0') : '0',
        streamedAt: row.streamedAt ?? 0,
      }
    })
    // Ranked by views; ties go to the sign that has raised more, then the earlier activation.
    signs.sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : a.activatedAt - b.activatedAt
    })

    // cachedListing keeps a stale upstream listing as a fallback rather than publishing it as fresh.
    return NextResponse.json({ leaderboards: signs, ethPriceUsd: listing.ethPriceUsd ?? null, ...(listing.stale ? { stale: true } : {}) }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[campaigns/1hive] error:', err)
    return NextResponse.json({ error: 'Campaign leaderboard unavailable' }, { status: 503, headers: NO_CACHE })
  }
}

export async function GET(request: Request) {
  return cachedListing(request, CACHE_KEY, load, NO_CACHE)
}
