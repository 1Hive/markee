// GET /api/marketplace/best-buys
//
// The Buyer Hub's Best Buys: the five Markees with the lowest cost per 1k views, using the same
// historical CPM as the dashboard's own figures -- everything ever paid on the board over its
// all-time views. There is no per-period view history yet, so this is "what buyers have paid per
// 1k views here", not a forecast. Boards under MIN_VIEWS views are left out so a handful of views
// can't put a board on top.
//
// A board's views follow the shared rule in lib/views/boards.ts.
//
// Built from the cached ecosystem listing plus one KV mget, and cached itself for five minutes.

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import type { BestBuy } from '@/components/account/types'
import { readBoardViews } from '@/lib/views/boards'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const CACHE_KEY = 'cache:marketplace:best-buys'
const CACHE_TTL = 300
const MIN_VIEWS = 1000
const LIMIT = 5
// Matches the marketplace's priceToOvertake: the top bid plus the 0.001 ETH minimum increment.
const MIN_INCREMENT = 1_000_000_000_000_000n

interface ListedBoard {
  address: string
  platform?: string
  strategy?: 'fixed' | 'streaming'
  leaderboardName?: string
  name?: string
  totalFundsRaw?: string
  streamedRateRaw?: string
  streamedAt?: number
  effectiveRateRaw?: string
  topFundsAddedRaw?: string
  topMessage?: string | null
  topMarkeeAddress?: string | null
  verifiedUrl?: string
}

export async function GET() {
  const cached = await kv.get<{ buys: BestBuy[] }>(CACHE_KEY)
  if (cached) return NextResponse.json(cached, { headers: NO_CACHE })

  try {
    const data = await fetch(`${internalOrigin()}/api/ecosystem/leaderboards`, { cache: 'no-store', headers: internalHeaders() })
      .then(r => r.ok ? r.json() : null)
    const boards: ListedBoard[] = (data?.leaderboards ?? []).filter((lb: ListedBoard) =>
      BigInt(lb.topFundsAddedRaw || '0') > 0n && lb.topMessage)
    if (boards.length === 0) return NextResponse.json({ buys: [] }, { headers: NO_CACHE })

    const viewsByBoard = await readBoardViews(boards)

    const now = Math.floor(Date.now() / 1000)
    const buys = boards
      .map(lb => {
        const views = viewsByBoard.get(lb.address.toLowerCase()) ?? 0
        const streaming = lb.strategy === 'streaming'
        const streamed = streaming && lb.streamedAt
          ? BigInt(lb.streamedRateRaw || '0') * BigInt(Math.max(0, now - lb.streamedAt))
          : 0n
        const paid = BigInt(lb.totalFundsRaw || '0') + streamed
        const price = streaming
          ? BigInt(lb.effectiveRateRaw || '0') * 2_592_000n
          : BigInt(lb.topFundsAddedRaw || '0') + MIN_INCREMENT
        return { lb, views, paid, price }
      })
      .filter(b => b.views >= MIN_VIEWS && b.paid > 0n)
      .map(b => ({ ...b, cpm: b.paid * 1000n / BigInt(b.views) }))
      .sort((a, b) => (a.cpm < b.cpm ? -1 : a.cpm > b.cpm ? 1 : 0))
      .slice(0, LIMIT)
      .map(({ lb, views, cpm, price }): BestBuy => ({
        address: lb.address,
        name: lb.leaderboardName || lb.name || `${lb.address.slice(0, 8)}…`,
        platform: lb.platform ?? null,
        strategy: lb.strategy === 'streaming' ? 'streaming' : 'fixed',
        servedOn: lb.verifiedUrl ?? null,
        views,
        cpmWei: cpm.toString(),
        priceWei: price.toString(),
      }))

    const payload = { buys }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (error) {
    console.error('[marketplace/best-buys] error:', error)
    return NextResponse.json({ buys: [], error: 'Failed to load best buys' }, { status: 500, headers: NO_CACHE })
  }
}
