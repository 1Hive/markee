// GET /api/account/stats?wallet=0x..&creator=b1,b2&buyer=b3,b4&days=90
//   Day-by-day history for the dashboard charts (lib/stats/daily.ts), oldest day first:
//   { days, creator: { views, raised, viewsSince, raisedSince }, buyer: { views, spent, viewsSince, spentSince } }
//   creator: the wallet's boards. buyer: the boards its messages are on. Amounts are wei strings.
//   *Since is the first day with real history (null when there's none yet).

import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import {
  VIEWS_SINCE_KEY, boardAndMessageAddresses, boughtSnapshotKey, dailyGrowth, dailyViews, fundedSnapshotKey,
  lastDays, raisedSnapshotKey,
} from '@/lib/stats/daily'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 90
const MAX_BOARDS = 100

const boardsParam = (req: NextRequest, name: string) =>
  [...new Set((req.nextUrl.searchParams.get(name) ?? '').split(',').map(b => b.trim().toLowerCase()).filter(b => isAddress(b)))].slice(0, MAX_BOARDS)

export async function GET(req: NextRequest) {
  if (!await underRateLimit('account:stats', clientIp(req), 30, 60)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase()
  if (!wallet || !isAddress(wallet)) return NextResponse.json({ error: 'Missing or invalid wallet' }, { status: 400 })
  const creator = boardsParam(req, 'creator')
  const buyer = boardsParam(req, 'buyer')
  const days = lastDays(Math.min(MAX_DAYS, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || MAX_DAYS)))

  try {
    const [creatorAddrs, buyerAddrs, viewsSince] = await Promise.all([
      boardAndMessageAddresses(creator),
      boardAndMessageAddresses(buyer),
      kv.get<string>(VIEWS_SINCE_KEY),
    ])
    const [creatorViews, buyerViews, raised, spent] = await Promise.all([
      dailyViews(creatorAddrs, days),
      dailyViews(buyerAddrs, days),
      dailyGrowth(creator.map(raisedSnapshotKey), days),
      dailyGrowth([boughtSnapshotKey(wallet), fundedSnapshotKey(wallet)], days),
    ])
    return NextResponse.json({
      days,
      creator: { views: creatorViews, raised: raised.values.map(String), viewsSince, raisedSince: raised.since },
      buyer: { views: buyerViews, spent: spent.values.map(String), viewsSince, spentSince: spent.since },
    })
  } catch (err) {
    console.error('[account/stats] read failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
