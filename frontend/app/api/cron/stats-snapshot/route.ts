/**
 * Hourly: records each board's running total raised for today, for the Creator Hub chart
 * (lib/stats/daily.ts). The last run of a day is that day's close.
 *
 *   GET /api/cron/stats-snapshot
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { raisedSnapshotKey, snapshotTotals } from '@/lib/stats/daily'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LISTINGS = ['openinternet', 'superfluid', 'github', 'forsale', 'streaming']
type LBList = { leaderboards?: { address: string; totalFundsRaw?: string }[] }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const origin = internalOrigin()
    const headers = internalHeaders()
    const lists = await Promise.all(LISTINGS.map(route =>
      fetch(`${origin}/api/${route}/leaderboards`, { cache: 'no-store', headers })
        .then(r => r.ok ? r.json() as Promise<LBList> : null)
        .catch(() => null)))
    // A listing that failed is skipped, not recorded as zero: its boards keep yesterday's total.
    const totals = new Map<string, bigint>()
    lists.forEach(list => (list?.leaderboards ?? []).forEach(lb => {
      const total = BigInt(lb.totalFundsRaw || '0')
      const key = raisedSnapshotKey(lb.address)
      if (total > (totals.get(key) ?? -1n)) totals.set(key, total)
    }))
    await snapshotTotals([...totals].map(([key, total]) => ({ key, total })))
    return NextResponse.json({ boards: totals.size, failedListings: lists.filter(l => !l).length })
  } catch (err) {
    console.error('[cron/stats-snapshot] failed', err)
    return NextResponse.json({ error: 'snapshot failed' }, { status: 500 })
  }
}
