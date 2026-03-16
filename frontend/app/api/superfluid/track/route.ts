/**
 * POST /api/superfluid/track
 *
 * Internal proxy for BUY_MESSAGE and ADD_FUNDS point events.
 * Calculates points server-side from amountWei (1 point per 0.0001 ETH).
 *
 * Body: {
 *   event:     'BUY_MESSAGE' | 'ADD_FUNDS'
 *   account:   '0x...'        wallet address
 *   amountWei: '123456...'    ETH amount as decimal string (BigInt.toString())
 *   txHash:    '0x...'        used as uniqueId for deduplication
 * }
 *
 * For FARCASTER_FOLLOW use /api/superfluid/farcaster-follow instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pushEvent, ethToPoints, SUPERFLUID_EVENTS, type SuperfluidEventKey } from '@/lib/superfluid/points'

export const dynamic = 'force-dynamic'

const ETH_EVENTS = new Set<string>(['BUY_MESSAGE', 'ADD_FUNDS'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, account, amountWei, txHash } = body

    // ── Validate event ────────────────────────────────────────────────────────
    if (!event || !ETH_EVENTS.has(event)) {
      return NextResponse.json(
        { message: `Invalid event. Must be one of: ${[...ETH_EVENTS].join(', ')}` },
        { status: 400 }
      )
    }

    // ── Validate address ──────────────────────────────────────────────────────
    if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) {
      return NextResponse.json({ message: 'Invalid or missing wallet address' }, { status: 400 })
    }

    // ── Validate amountWei ────────────────────────────────────────────────────
    if (!amountWei || typeof amountWei !== 'string' || !/^\d+$/.test(amountWei)) {
      return NextResponse.json(
        { message: 'amountWei must be a decimal string representing wei (e.g. BigInt.toString())' },
        { status: 400 }
      )
    }

    // ── Validate txHash ───────────────────────────────────────────────────────
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ message: 'Invalid or missing txHash' }, { status: 400 })
    }

    // ── Calculate points (server-side) ────────────────────────────────────────
    // 1 point per 0.0001 ETH (1e14 wei). Minimum 1.
    const points = ethToPoints(amountWei)

    // ── Push ──────────────────────────────────────────────────────────────────
    const result = await pushEvent({
      event: event as SuperfluidEventKey,
      account,
      points,
      uniqueId: txHash, // dedup: same tx can't double-earn
    })

    if (!result.success) {
      console.error('[/api/superfluid/track] Push failed:', result.error)
      // Return 200 — points failure must never break the post-tx UX
      return NextResponse.json({ success: false, message: result.error }, { status: 200 })
    }

    return NextResponse.json({
      success: true,
      points,
      pushRequestId: result.pushRequestId,
    })
  } catch (e: any) {
    console.error('[/api/superfluid/track] Exception:', e)
    return NextResponse.json({ message: 'Internal error' }, { status: 500 })
  }
}
