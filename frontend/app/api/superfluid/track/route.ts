/**
 * POST /api/superfluid/track
 *
 * Internal server-side proxy so the client can trigger points tracking
 * after a confirmed on-chain transaction, without exposing the API key.
 *
 * Body: {
 *   event: SuperfluidEventKey,   // 'BUY_MESSAGE' | 'ADD_FUNDS' | 'FARCASTER_FOLLOW'
 *   account: string,             // wallet address
 *   txHash?: string,             // used as uniqueId to prevent double-awarding
 *   pointsOverride?: number,     // optional — override default points for this event
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { pushEvent, SUPERFLUID_EVENTS, type SuperfluidEventKey } from '@/lib/superfluid/points'

export const dynamic = 'force-dynamic'

const VALID_EVENTS = new Set<string>(Object.keys(SUPERFLUID_EVENTS))

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, account, txHash, pointsOverride } = body

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json(
        { message: `Invalid event. Must be one of: ${[...VALID_EVENTS].join(', ')}` },
        { status: 400 }
      )
    }

    if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) {
      return NextResponse.json(
        { message: 'Invalid or missing wallet address' },
        { status: 400 }
      )
    }

    if (txHash && !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json(
        { message: 'Invalid txHash format' },
        { status: 400 }
      )
    }

    if (pointsOverride !== undefined && (!Number.isInteger(pointsOverride) || pointsOverride <= 0)) {
      return NextResponse.json(
        { message: 'pointsOverride must be a positive integer' },
        { status: 400 }
      )
    }

    // ── Push ──────────────────────────────────────────────────────────────────
    const result = await pushEvent({
      event: event as SuperfluidEventKey,
      account,
      // Use txHash as uniqueId so duplicate calls (e.g. React StrictMode double-fire)
      // are safely deduped by the Superfluid API.
      uniqueId: txHash,
      pointsOverride,
    })

    if (!result.success) {
      console.error('[/api/superfluid/track] Push failed:', result.error)
      // Return 200 — a points failure should never break the user's post-tx experience
      return NextResponse.json({ success: false, message: result.error }, { status: 200 })
    }

    return NextResponse.json({
      success: true,
      pushRequestId: result.pushRequestId,
    })
  } catch (e: any) {
    console.error('[/api/superfluid/track] Exception:', e)
    return NextResponse.json({ message: 'Internal error' }, { status: 500 })
  }
}
