// GET  /api/moderation/notify?wallet=0x...
//   Returns { email: string | null } — the email registered for this wallet.
//
// POST /api/moderation/notify
//   { wallet, email, signature, timestamp }
//   Registers an email address for moderation notifications. The signature covers
//   notifyEmailMessage(8453, wallet, email, timestamp).
//
// DELETE /api/moderation/notify
//   { wallet, signature, timestamp }
//   Removes the notification email. Signature covers notifyEmailMessage(8453, wallet, '', timestamp).

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import { ADDRESS_PATTERN, notifyEmailMessage } from '@/lib/moderation/queue'
import { notifyKey, type NotifySubscription } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase()
  if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
    return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
  }
  const sub = await kv.get<NotifySubscription>(notifyKey(wallet)).catch(() => null)
  return NextResponse.json({ email: sub?.email ?? null })
}

export async function POST(req: NextRequest) {
  try {
    const { wallet: rawWallet, email: rawEmail, signature, timestamp } = await req.json() as {
      wallet?: string; email?: string; signature?: `0x${string}`; timestamp?: number
    }
    const wallet = rawWallet?.toLowerCase()
    const email = rawEmail?.toLowerCase().trim()
    if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
      return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
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
      message: notifyEmailMessage(base.id, wallet, email, timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const sub: NotifySubscription = { email, subscribedAt: now }
    await kv.set(notifyKey(wallet), sub)
    return NextResponse.json({ email })
  } catch (e) {
    console.error('[moderation/notify] POST error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { wallet: rawWallet, signature, timestamp } = await req.json() as {
      wallet?: string; signature?: `0x${string}`; timestamp?: number
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

    await kv.del(notifyKey(wallet))
    return NextResponse.json({ email: null })
  } catch (e) {
    console.error('[moderation/notify] DELETE error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
