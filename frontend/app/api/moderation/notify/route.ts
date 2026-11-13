// GET  /api/moderation/notify?wallet=0x...
//   Returns { email: string | null, verified: boolean, frequency: EmailFrequency, events: NotifyEvents }.
//   The email is masked (u***@example.com) so wallet owners can confirm their subscription without
//   exposing the full address to unauthenticated callers.
//
// POST /api/moderation/notify
//   { wallet, email, signature, timestamp }
//   Moderator sets or updates their notification email. Triggers a verification email.
//   Every write accepts a Privy session for the wallet (lib/auth/wallet-session.ts) in place of the
//   signature. Signature covers notifyEmailMessage(8453, wallet, email, timestamp).
//   { wallet, resend: true, signature?, timestamp } re-sends verification to the stored email instead
//   (the client only ever sees it masked). Signature covers notifyResendMessage(8453, wallet, timestamp).
//   Emails are unique across wallets (trimmed, lowercased). 409 { error: 'Email already in use' } if
//   another wallet holds it. Re-saving the wallet's own email succeeds.
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
import { base } from 'viem/chains'
import {
  ADDRESS_PATTERN,
  EMAIL_FREQUENCIES,
  notifyEmailMessage,
  notifyFreqMessage,
  notifyResendMessage,
  notifyPrefsMessage,
  notifyEventsOf,
  NOTIFY_EVENTS,
  type EmailFrequency,
  type NotifyEvents,
} from '@/lib/moderation/queue'
import { notifyStateKey, verifyTokenKey, type ModeratorNotifyState, type VerifyToken } from '@/lib/moderation/server'
import { sendVerificationEmail } from '@/lib/moderation/email'
import { authorizeWallet } from '@/lib/auth/wallet-session'
import { claimNotifyEmail, releaseNotifyEmail, EMAIL_IN_USE_ERROR } from '@/lib/moderation/emailIndex'
import { kvEmailIndexStore } from '@/lib/moderation/emailIndexStore'

const VERIFY_TOKEN_TTL = 60 * 60 * 24 * 7 // 7 days
// Domain labels can't contain dots, so there's only one way to match and no catastrophic backtracking.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

export const dynamic = 'force-dynamic'

const MASK = '***'
const emailIndex = kvEmailIndexStore(notifyStateKey)

function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  return local.slice(0, 1) + MASK + (local.length > 1 ? local.slice(-1) : '') + domain
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
    const { wallet: rawWallet, email: rawEmail, resend, signature, timestamp } = await req.json() as {
      wallet?: string
      email?: string
      resend?: boolean
      signature?: `0x${string}`
      timestamp?: number
    }
    const wallet = rawWallet?.toLowerCase()
    if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
      return NextResponse.json({ error: 'Missing or invalid wallet address' }, { status: 400 })
    }
    const email = resend === true ? undefined : rawEmail?.trim().toLowerCase()
    if (resend !== true && (!email || email.length > 254 || !EMAIL_RE.test(email) || email.includes(MASK))) {
      return NextResponse.json({ error: 'Missing or invalid email address' }, { status: 400 })
    }
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    const auth = await authorizeWallet(req, wallet, signature, () => email
      ? notifyEmailMessage(base.id, wallet, email, timestamp)
      : notifyResendMessage(base.id, wallet, timestamp))
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

    const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(wallet)).catch(() => null)
    let notifyState: ModeratorNotifyState
    if (email) {
      notifyState = { email, verified: false, frequency: existing?.frequency ?? 'every', setAt: now }
      await kv.set(notifyStateKey(wallet), notifyState)
      const claim = await claimNotifyEmail(emailIndex, email, wallet, { verified: false })
      if (!claim.ok) {
        if (existing) await kv.set(notifyStateKey(wallet), existing)
        else await kv.del(notifyStateKey(wallet))
        return NextResponse.json({ error: EMAIL_IN_USE_ERROR, code: 'EMAIL_IN_USE' }, { status: 409 })
      }
      await releaseNotifyEmail(emailIndex, existing?.email, wallet, email)
    } else if (!existing?.email) {
      return NextResponse.json({ error: 'No notification email is saved for this wallet' }, { status: 404 })
    } else if (existing.verified) {
      return NextResponse.json({ error: 'This email is already verified' }, { status: 409 })
    } else {
      notifyState = existing
    }

    const token = randomBytes(32).toString('hex')
    // The deployment's own origin, as the moderators route uses -- not the caller's Origin header.
    const origin = req.nextUrl.origin
    const verifyUrl = `${origin}/api/moderation/notify/verify?token=${token}`
    const tokenPayload: VerifyToken = { wallet, email: notifyState.email, expiresAt: now + VERIFY_TOKEN_TTL }
    await kv.set(verifyTokenKey(token), tokenPayload, { ex: VERIFY_TOKEN_TTL })
    await sendVerificationEmail(notifyState.email, null, verifyUrl).catch(e => {
      console.error('[moderation/notify] verification email failed to', notifyState.email, e)
    })

    return NextResponse.json({
      email: maskEmail(notifyState.email),
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
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    const auth = await authorizeWallet(req, wallet, signature, () => events
      ? notifyPrefsMessage(base.id, wallet, frequency as EmailFrequency, events, timestamp)
      : notifyFreqMessage(base.id, wallet, frequency as EmailFrequency, timestamp))
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

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
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    const auth = await authorizeWallet(req, wallet, signature, () => notifyEmailMessage(base.id, wallet, '', timestamp))
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

    const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(wallet)).catch(() => null)
    await kv.del(notifyStateKey(wallet))
    await releaseNotifyEmail(emailIndex, existing?.email, wallet)
    return NextResponse.json({ email: null, verified: false, frequency: 'every' })
  } catch (e) {
    console.error('[moderation/notify] DELETE error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
