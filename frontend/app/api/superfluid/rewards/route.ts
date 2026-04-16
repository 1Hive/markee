/**
 * GET /api/superfluid/rewards
 *
 * Server-side proxy for the Superfluid Points API leaderboard.
 * Fetches all pages and returns the full ranked account list in one response.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCampaignId } from '@/lib/superfluid/points'

const BASE_URL = 'https://cms.superfluid.pro'
const PAGE_SIZE = 100
const MAX_PAGES = 20 // safety cap: 2,000 participants max

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const campaignId = getCampaignId()

    // Fetch all pages and merge
    const allAccounts: unknown[] = []
    let totalDocs = 0

    for (let p = 1; p <= MAX_PAGES; p++) {
      const res = await fetch(
        `${BASE_URL}/points/accounts?campaignId=${campaignId}&orderBy=totalPoints&order=desc&page=${p}&limit=${PAGE_SIZE}`,
        { cache: 'no-store' }
      )
      if (!res.ok) break
      const data = await res.json()
      const accounts: unknown[] = data.accounts ?? []
      allAccounts.push(...accounts)
      totalDocs = data.pagination?.totalDocs ?? allAccounts.length
      if (!data.pagination?.hasNextPage) break
    }

    const [fundsTotal, farcasterTotal] = await Promise.all([
      fetch(`${BASE_URL}/points/event-balance?campaignId=${campaignId}&eventName=add_funds`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { points: 0 })
        .catch(() => ({ points: 0 })),
      fetch(`${BASE_URL}/points/event-balance?campaignId=${campaignId}&eventName=farcaster_follow`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { points: 0 })
        .catch(() => ({ points: 0 })),
    ])

    return NextResponse.json({
      accounts: allAccounts,
      totalDocs,
      campaignTotals: {
        addFunds: fundsTotal.points ?? 0,
        farcasterFollow: farcasterTotal.points ?? 0,
      },
    })
  } catch (e: any) {
    console.error('[/api/superfluid/rewards]', e.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
