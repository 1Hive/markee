// GET  /api/moderation/notify?wallet=0x...
//   Returns { email: string | null, verified: boolean, frequency: EmailFrequency, events: NotifyEvents }.
//   The email is masked (u***@example.com) so wallet owners can confirm their subscription without
//   exposing the full address to unauthenticated callers.
//
// POST /api/moderation/notify
//   { wallet, email, signature, timestamp }
//   Moderator sets or updates their notification email. Triggers a verification email.
//   Signature covers notifyEmailMessage(8453, wallet, email, timestamp).
//
// PATCH /api/moderation/notify
//   { wallet, frequency, events?, signature, timestamp }
//   The wallet updates its own frequency (every / daily / off) and, with `events`, which emails it
//   gets (mod / status / budget). Signature covers notifyPrefsMessage(8453, wallet, frequency, events,
//   timestamp), or notifyFreqMessage(8453, wallet, frequency, timestamp) without `events`.
//
// DELETE /api/moderation/notify
//   { wallet, signature, timestamp }
//   Removes the moderator's notification state (unsubscribes from all emails).
//   Signature covers notifyEmailMessage(8453, wallet, '', timestamp).

import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import {
  ADDRESS_PATTERN,
  EMAIL_FREQUENCIES,
  notifyEmailMessage,
  notifyFreqMessage,
  notifyPrefsMessage,
  notifyEventsOf,
  NOTIFY_EVENTS,
  type EmailFrequency,
  type NotifyEvents,
} from '@/lib/moderation/queue'
import { notifyStateKey, verifyTokenKey, type ModeratorNotifyState } from '@/lib/moderation/server'
import { sendVerificationEmail } from '@/lib/moderation/email'

const VERIFY_TOKEN_TTL = 60 * 60 * 24 * 7 // 7 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    events: notifyEventsOf(state),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { wallet: rawWallet, email: rawEmail, signature, timestamp } = await req.json() as {
      wallet?: string
      email?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const wallet = rawWallet?.toLowerCase()
    if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
      return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
    }
    const email = rawEmail?.trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Missing or invalid email address' }, { status: 400 })
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

    const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(wallet)).catch(() => null)
    const notifyState: ModeratorNotifyState = {
      email,
      verified: false,
      frequency: existing?.frequency ?? 'every',
      setAt: now,
    }
    await kv.set(notifyStateKey(wallet), notifyState)

    const token = randomBytes(32).toString('hex')
    const origin = req.headers.get('origin') ?? req.headers.get('x-forwarded-host') ?? 'https://markee.xyz'
    const verifyUrl = `${origin}/api/moderation/notify/verify?token=${token}`
    await kv.set(verifyTokenKey(token), { wallet, email }, { ex: VERIFY_TOKEN_TTL })
    await sendVerificationEmail(email, wallet, verifyUrl).catch(e => {
      console.error('[moderation/notify] verification email failed to', email, e)
    })

    return NextResponse.json({
      email: maskEmail(email),
      verified: false,
      frequency: notifyState.frequency,
    })
  } catch (e) {
    console.error('[moderation/notify] POST error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { wallet: rawWallet, frequency, events: rawEvents, signature, timestamp } = await req.json() as {
      wallet?: string
      frequency?: string
      events?: Partial<Record<keyof NotifyEvents, unknown>>
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
    if (rawEvents !== undefined && !NOTIFY_EVENTS.every(k => typeof rawEvents?.[k] === 'boolean')) {
      return NextResponse.json({ error: `events must set ${NOTIFY_EVENTS.join(', ')} to true or false` }, { status: 400 })
    }
    const events = rawEvents as NotifyEvents | undefined
    if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message: events
        ? notifyPrefsMessage(base.id, wallet, frequency as EmailFrequency, events, timestamp)
        : notifyFreqMessage(base.id, wallet, frequency as EmailFrequency, timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(wallet)).catch(() => null)
    if (!existing) {
      return NextResponse.json({ error: 'No notification subscription found for this wallet' }, { status: 404 })
    }
    const updated: ModeratorNotifyState = { ...existing, frequency: frequency as EmailFrequency, ...(events ? { events } : {}), setAt: now }
    await kv.set(notifyStateKey(wallet), updated)
    return NextResponse.json({
      email: maskEmail(existing.email),
      verified: existing.verified,
      frequency: frequency as EmailFrequency,
      events: notifyEventsOf(updated),
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
