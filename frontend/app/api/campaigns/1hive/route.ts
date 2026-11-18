// app/api/campaigns/1hive/route.ts
//
// The /1hive "Signs earning bonuses" leaderboard. Every new For Rent or For Sale Markee that has been
// activated and has a verified embed is listed automatically; CAMPAIGN_1HIVE_EXCLUDED_BOARDS removes
// rejected ones and disqualified boards never count. Rules are in lib/campaigns/1hive.ts. This route
// only reads:
//
//   - boards and on-chain totals from the cached marketplace listing (/api/ecosystem/leaderboards);
//   - which For Rent boards were created since the v1.4 launch (the factory's board list from index
//     FOR_RENT_BOARDS_BEFORE_V14 on: one RPC read);
//   - each board's verified site/GitHub embeds, by address (lib/leaderboards/verificationStatus.ts);
//     a sign with no verified embed is never listed;
//   - activation from each board's #1 history (lib/leaderboard/topHistory.ts, kept current by the
//     5-minute moderation scan);
//   - all-time views (views:total) summed over the board and every message that has held #1 on it.
//     Signs under the 100-view minimum are listed and flagged on the page.
//
// Served through the shared listing snapshot cache (60 s fresh), so viewers never fan out to KV/RPC.
// Public and read-only: there is no ?bust=1 here (nothing on this page needs a post-transaction
// refresh), so callers can't force fresh chain reads across every listing. Taking a sign off is a
// deploy (CAMPAIGN_1HIVE_EXCLUDED_BOARDS or lib/leaderboards/disqualified.ts), and the cache key
// changes with those lists, so the deploy serves a fresh snapshot instead of the cached one. The
// lists are also checked here directly, not only through the upstream listing's own cache.

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { cachedListing } from '@/lib/leaderboards/cached'
import { readTopHistories } from '@/lib/leaderboard/topHistory'
import { verificationStatusFor } from '@/lib/leaderboards/verificationStatus'
import { DISQUALIFIED_BOARDS, isDisqualifiedBoard } from '@/lib/leaderboards/disqualified'
import { viewsKey } from '@/lib/views/boards'
import { createStreamingClient } from '@/lib/streaming/client'
import { BASE_STREAMING_FACTORY } from '@/lib/contracts/addresses'
import { LeaderboardFactoryABI } from '@/lib/contracts/abis'
import {
  CAMPAIGN_1HIVE_EXCLUDED_BOARDS, FOR_RENT_BOARDS_BEFORE_V14, isCampaignBoard, isEligibleBoard, siteLabel, viewAddresses,
  type CampaignListingRow, type Campaign1HiveSign,
} from '@/lib/campaigns/1hive'

export const dynamic = 'force-dynamic'

/** Short, stable fingerprint of the exclusion and disqualification lists (FNV-1a). */
function listsVersion(): string {
  const text = [...Object.keys(CAMPAIGN_1HIVE_EXCLUDED_BOARDS), ...DISQUALIFIED_BOARDS.keys()].map(a => a.toLowerCase()).sort().join(',')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

const CACHE_KEY = `cache:campaign:1hive:${listsVersion()}`
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

type ListingRow = CampaignListingRow & {
  topRateRaw?: string
  totalFundsRaw?: string
  streamedRateRaw?: string
  streamedAt?: number
}

async function load() {
  // Which step failed, for the error log.
  let stage = 'marketplace listing'
  try {
    const res = await fetch(`${internalOrigin()}/api/ecosystem/leaderboards`, { cache: 'no-store', headers: internalHeaders() })
    if (!res.ok) throw new Error(`ecosystem listing ${res.status}`)
    // A stale upstream listing is still the best data available; it is cached here like a fresh one
    // for 60 s rather than re-loaded on every request.
    const listing = await res.json() as { leaderboards?: ListingRow[]; ethPriceUsd?: number | null }

    // For Rent boards created since the v1.4 launch: the factory only appends, so it's everything
    // past the boards it had then.
    stage = 'For Rent factory read'
    const newForRentList = await createStreamingClient().readContract({
      address: BASE_STREAMING_FACTORY, abi: LeaderboardFactoryABI, functionName: 'getLeaderboards',
      args: [BigInt(FOR_RENT_BOARDS_BEFORE_V14), 10_000n],
    })
    const newForRent = new Set(newForRentList.map(a => a.toLowerCase()))

    const rows = (listing.leaderboards ?? []).filter(row => isCampaignBoard(row, newForRent))
    const addrs = rows.map(r => r.address.toLowerCase())
    // Verification is looked up by address (the same KV records /account and the marketplace use):
    // a listing row from one platform route can miss an embed added through another.
    stage = 'top histories and verification'
    const [histories, verification] = await Promise.all([readTopHistories(addrs), verificationStatusFor(addrs)])

    const eligible = rows.flatMap((listed, i) => {
      const v = verification[addrs[i]]
      const row = v ? { ...listed, verifiedUrls: v.verifiedUrls, linkedFiles: v.linkedFiles } : listed
      const spans = histories.get(addrs[i])
      return isEligibleBoard({ ...row, disqualified: row.disqualified || isDisqualifiedBoard(row.address) }, spans, newForRent) ? [{ row, spans }] : []
    })

    // All-time views for every address the eligible signs were counted under, in one read.
    const addressesPer = eligible.map(e => viewAddresses(e.row, e.spans))
    stage = 'view counts'
    const keys = [...new Set(addressesPer.flat().map(viewsKey))]
    const counts = keys.length ? await kv.mget<(number | string | null)[]>(...keys) : []
    const viewsByKey = new Map(keys.map((k, i) => [k, Number(counts[i] ?? 0) || 0]))

    const signs: Campaign1HiveSign[] = eligible.map(({ row }, i) => {
      const streaming = row.strategy === 'streaming'
      return {
        address: row.address,
        site: siteLabel(row),
        strategy: streaming ? 'streaming' : 'fixed',
        topMessage: row.topMessage ?? null,
        topMarkeeAddress: row.topMarkeeAddress ?? null,
        views: addressesPer[i].reduce((sum, a) => sum + (viewsByKey.get(viewsKey(a)) ?? 0), 0),
        topRateRaw: streaming ? (row.topRateRaw ?? '0') : '0',
        topBidRaw: streaming ? '0' : (row.topFundsAddedRaw ?? '0'),
        totalFundsRaw: row.totalFundsRaw ?? '0',
        streamedRateRaw: streaming ? (row.streamedRateRaw ?? '0') : '0',
        streamedAt: row.streamedAt ?? 0,
      }
    })
    // Ranked by views; ties go to the sign that has raised more.
    signs.sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    return NextResponse.json({ leaderboards: signs, ethPriceUsd: listing.ethPriceUsd ?? null }, { headers: NO_CACHE })
  } catch (err) {
    console.error(`[campaigns/1hive] ${stage} failed:`, err)
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
