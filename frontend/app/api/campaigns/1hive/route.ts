// app/api/campaigns/1hive/route.ts
//
// The /1hive "Signs earning bonuses" leaderboard. Every new For Rent or For Sale Markee activated
// since the v1.4 launch (CAMPAIGN_1HIVE_CAMPAIGN_START) is listed automatically; CAMPAIGN_1HIVE_EXCLUDED_BOARDS
// removes rejected ones. Rules are in lib/campaigns/1hive.ts. This route only reads:
//
//   - boards and on-chain totals from the cached marketplace listing (/api/ecosystem/leaderboards);
//   - each board's verified site/GitHub embeds, by address (lib/leaderboards/verificationStatus.ts);
//     a sign with no verified embed is never listed;
//   - activation time from each board's #1 history (lib/leaderboard/topHistory.ts, kept current by
//     the 5-minute moderation scan, from real block timestamps);
//   - views since activation (signs under the 100-view minimum are listed, flagged on the page) from the daily view counters, summed over the board and every message
//     that has held #1 on it.
//
// Served through the shared listing snapshot cache (60 s fresh), so viewers never fan out to KV/RPC.
// Public and read-only: there is no ?bust=1 here (nothing on this page needs a post-transaction
// refresh), so callers can't force fresh chain reads across every listing.

import { NextResponse } from 'next/server'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { cachedListing } from '@/lib/leaderboards/cached'
import { readTopHistories } from '@/lib/leaderboard/topHistory'
import { dailyViewsKey, hgetalls } from '@/lib/stats/daily'
import { verificationStatusFor } from '@/lib/leaderboards/verificationStatus'
import {
  activationTime, isCampaignBoard, isEligibleBoard, siteLabel, utcDay, viewAddresses, viewsSince,
  type CampaignListingRow, type Campaign1HiveSign,
} from '@/lib/campaigns/1hive'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:campaign:1hive'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

type ListingRow = CampaignListingRow & {
  topRateRaw?: string
  totalFundsRaw?: string
  streamedRateRaw?: string
  streamedAt?: number
}

async function load() {
  try {
    const res = await fetch(`${internalOrigin()}/api/ecosystem/leaderboards`, { cache: 'no-store', headers: internalHeaders() })
    if (!res.ok) throw new Error(`ecosystem listing ${res.status}`)
    // A stale upstream listing is still the best data available; it is cached here like a fresh one
    // for 60 s rather than re-loaded on every request.
    const listing = await res.json() as { leaderboards?: ListingRow[]; ethPriceUsd?: number | null }

    const boards = (listing.leaderboards ?? []).filter(isCampaignBoard)
    const addrs = boards.map(r => r.address.toLowerCase())
    // Verification is looked up by address (the same KV records /account and the marketplace use):
    // a listing row from one platform route can miss an embed added through another.
    const [histories, verification] = await Promise.all([readTopHistories(addrs), verificationStatusFor(addrs)])
    const candidates = boards.map((row, i) => {
      const v = verification[addrs[i]]
      return v ? { ...row, verifiedUrls: v.verifiedUrls, linkedFiles: v.linkedFiles } : row
    })

    const eligible = candidates.flatMap(row => {
      const spans = histories.get(row.address.toLowerCase())
      const activatedAt = activationTime(row, spans)
      return isEligibleBoard(row, activatedAt) ? [{ row, spans, activatedAt: activatedAt! }] : []
    })

    // Every daily counter the eligible signs need, read in chunked pipelines.
    const addressesPer = eligible.map(e => viewAddresses(e.row, e.spans))
    const keys = [...new Set(addressesPer.flat().map(dailyViewsKey))]
    const hashes = await hgetalls(keys)
    const dailies = new Map(keys.map((k, i) => [k, hashes[i]]))

    const signs: Campaign1HiveSign[] = eligible.map(({ row, activatedAt }, i) => {
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

    return NextResponse.json({ leaderboards: signs, ethPriceUsd: listing.ethPriceUsd ?? null }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[campaigns/1hive] error:', err)
    return NextResponse.json({ error: 'Campaign leaderboard unavailable' }, { status: 503, headers: NO_CACHE })
  }
}

export async function GET(request: Request) {
  // Drop every query parameter (notably ?bust=1, which cachedListing would honour) so the public
  // route always serves the shared snapshot.
  const url = new URL(request.url)
  url.search = ''
  return cachedListing(new Request(url, request), CACHE_KEY, () => load(), NO_CACHE)
}
