// GET  /api/moderation/notify?wallet=0x...
//   Returns { email: string | null, verified: boolean, frequency: EmailFrequency } for the wallet.
//   The email is masked (u***@example.com) so wallet owners can confirm their subscription without
//   exposing the full address to unauthenticated callers.
//
// PATCH /api/moderation/notify
//   { wallet, frequency, signature, timestamp }
//   Moderator updates their own notification frequency preference (every / daily / off).
//   Signature covers notifyFreqMessage(8453, wallet, frequency, timestamp).
//
// DELETE /api/moderation/notify
//   { wallet, signature, timestamp }
//   Removes the moderator's notification state (unsubscribes from all emails).
//   Signature covers notifyEmailMessage(8453, wallet, '', timestamp).

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import {
  ADDRESS_PATTERN,
  EMAIL_FREQUENCIES,
  notifyEmailMessage,
  notifyFreqMessage,
  type EmailFrequency,
} from '@/lib/moderation/queue'
import { notifyStateKey, type ModeratorNotifyState } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  return local.slice(0, 1) + '***' + (local.length > 1 ? local.slice(-1) : '') + domain
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase()
  if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
  }
  const state = await kv.get<ModeratorNotifyState>(notifyStateKey(wallet)).catch(() => null)
  return NextResponse.json({
    email: state?.email ? maskEmail(state.email) : null,
    verified: state?.verified ?? false,
    frequency: state?.frequency ?? 'every',
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const { wallet: rawWallet, frequency, signature, timestamp } = await req.json() as {
      wallet?: string
      frequency?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const wallet = rawWallet?.toLowerCase()
    if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
      return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
    }
    if (!frequency || !EMAIL_FREQUENCIES.includes(frequency as EmailFrequency)) {
      return NextResponse.json({ error: `frequency must be one of: ${EMAIL_FREQUENCIES.join(', ')}` }, { status: 400 })
    }
    if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message: notifyFreqMessage(base.id, wallet, frequency as EmailFrequency, timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(wallet)).catch(() => null)
    if (!existing) {
      return NextResponse.json({ error: 'No notification subscription found for this wallet' }, { status: 404 })
    }
    const updated: ModeratorNotifyState = { ...existing, frequency: frequency as EmailFrequency, setAt: now }
    await kv.set(notifyStateKey(wallet), updated)
    return NextResponse.json({
      email: maskEmail(existing.email),
      verified: existing.verified,
      frequency: frequency as EmailFrequency,
    })
  } catch (e) {
    console.error('[moderation/notify] PATCH error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { wallet: rawWallet, signature, timestamp } = await req.json() as {
      wallet?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const wallet = rawWallet?.toLowerCase()
    if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
      return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
    }
    if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message: notifyEmailMessage(base.id, wallet, '', timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    await kv.del(notifyStateKey(wallet))
    return NextResponse.json({ email: null, verified: false, frequency: 'every' })
  } catch (e) {
    console.error('[moderation/notify] DELETE error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
