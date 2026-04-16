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
    const campaignId = getCampaignId()

    // Single-address rank lookup: search sequentially through pages
    const address = searchParams.get('address')
    if (address) {
      const PAGE_SIZE = 100
      const MAX_PAGES = 10
      for (let p = 1; p <= MAX_PAGES; p++) {
        const res = await fetch(
          `${BASE_URL}/points/accounts?campaignId=${campaignId}&orderBy=totalPoints&order=desc&page=${p}&limit=${PAGE_SIZE}`,
          { cache: 'no-store' }
        )
        if (!res.ok) break
        const data = await res.json()
        const accounts: { account: string; totalPoints: number; eventCount: number; lastEventAt: string | null }[] = data.accounts ?? []
        const idx = accounts.findIndex(e => e.account.toLowerCase() === address.toLowerCase())
        if (idx >= 0) {
          return NextResponse.json({ entry: accounts[idx], rank: (p - 1) * PAGE_SIZE + idx + 1 })
        }
        if (!data.pagination?.hasNextPage) break
      }
      return NextResponse.json({ entry: null, rank: null })
    }

    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

    // Fetch ranked accounts
    const accountsRes = await fetch(
      `${BASE_URL}/points/accounts?campaignId=${campaignId}&orderBy=totalPoints&order=desc&page=${page}&limit=${limit}`,
      { cache: 'no-store' }
    )

    if (!accountsRes.ok) {
      return NextResponse.json(
        { error: `Points API error: ${accountsRes.status}` },
        { status: accountsRes.status }
      )
    }

    const data = await accountsRes.json()

    const [fundsTotal, farcasterTotal] = await Promise.all([
      fetch(`${BASE_URL}/points/event-balance?campaignId=${campaignId}&eventName=add_funds`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { points: 0 })
        .catch(() => ({ points: 0 })),
      fetch(`${BASE_URL}/points/event-balance?campaignId=${campaignId}&eventName=farcaster_follow`, { cache: 'no-store' })
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
    console.error('[/api/superfluid/rewards]', e.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
