/**
 * GET /api/superfluid/rewards?page=1&limit=50
 *
 * Server-side proxy for the Superfluid Points API leaderboard.
 * Returns ranked accounts with total points — public endpoint, no auth needed.
 * Also fetches per-event breakdowns for the top N accounts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCampaignId } from '@/lib/superfluid/points'

const BASE_URL = 'https://cms.superfluid.pro'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

    const campaignId = getCampaignId()

    // Fetch ranked accounts
    const accountsRes = await fetch(
      `${BASE_URL}/points/accounts?campaignId=${campaignId}&orderBy=totalPoints&order=desc&page=${page}&limit=${limit}`
    )

    if (!accountsRes.ok) {
      return NextResponse.json(
        { error: `Points API error: ${accountsRes.status}` },
        { status: accountsRes.status }
      )
    }

    const data = await accountsRes.json()

    // Fetch per-event totals for breakdown (campaign-wide, not per-account)
    // We fetch these in parallel to show what percentage of points came from each activity
    const [fundsTotal, farcasterTotal] = await Promise.all([
      fetch(`${BASE_URL}/points/event-balance?campaignId=${campaignId}&eventName=add_funds`)
        .then(r => r.ok ? r.json() : { points: 0 })
        .catch(() => ({ points: 0 })),
      fetch(`${BASE_URL}/points/event-balance?campaignId=${campaignId}&eventName=farcaster_follow`)
        .then(r => r.ok ? r.json() : { points: 0 })
        .catch(() => ({ points: 0 })),
    ])

    return NextResponse.json({
      accounts: data.accounts ?? [],
      pagination: data.pagination ?? {},
      campaignTotals: {
        addFunds: fundsTotal.points ?? 0,
        farcasterFollow: farcasterTotal.points ?? 0,
      },
    })
  } catch (e: any) {
    console.error('[/api/superfluid/leaderboard]', e.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
