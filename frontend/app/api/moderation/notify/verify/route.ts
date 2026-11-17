// GET /api/moderation/notify/verify?token=<token>
//   Validates a one-time email verification token issued when a board admin adds a moderator with
//   an email address, or when a wallet sets its own email from Settings. On success, marks the moderator's email as verified in KV and redirects to
//   /account so they can manage their notification frequency preferences.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { notifyStateKey, verifyTokenKey, type ModeratorNotifyState, type VerifyToken } from '@/lib/moderation/server'
import { claimNotifyEmail } from '@/lib/moderation/emailIndex'
import { kvEmailIndexStore } from '@/lib/moderation/emailIndexStore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: 'Missing or invalid token' }, { status: 400 })
  }

  // Read and delete in one step, so the token is single-use even under concurrent requests.
  const payload = await kv.getdel<VerifyToken>(verifyTokenKey(token)).catch(() => null)
  if (!payload) {
    // Token not found or expired — redirect to account with an error hint.
    const url = new URL('/account', req.nextUrl.origin)
    url.searchParams.set('verifyError', 'expired')
    return NextResponse.redirect(url, 302)
  }

  const now = Math.floor(Date.now() / 1000)
  if (now > payload.expiresAt) {
    const url = new URL('/account', req.nextUrl.origin)
    url.searchParams.set('verifyError', 'expired')
    return NextResponse.redirect(url, 302)
  }

  // Mark the email as verified. If the state was updated by the moderator (e.g. they changed
  // frequency) since the token was issued, preserve their frequency preference.
  const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(payload.wallet)).catch(() => null)
  if (existing && existing.email === payload.email) {
    // The state is marked verified before the claim so a concurrent claimant sees a live claim, never
    // a stale one it may evict.
    await kv.set(notifyStateKey(payload.wallet), { ...existing, verified: true, verifiedAt: now } satisfies ModeratorNotifyState)
    const claim = await claimNotifyEmail(kvEmailIndexStore(notifyStateKey), payload.email, payload.wallet)
    // Someone else verified this address first. Their claim stands; this wallet keeps its email
    // pending so Settings can say why and prompt for another.
    if (!claim.ok) {
      await kv.set(notifyStateKey(payload.wallet), existing)
      const url = new URL('/account', req.nextUrl.origin)
      url.searchParams.set('section', 'settings')
      url.searchParams.set('verifyError', 'in-use')
      return NextResponse.redirect(url, 302)
    }
  }

  const url = new URL('/account', req.nextUrl.origin)
  url.searchParams.set('section', 'settings')
  url.searchParams.set('verifyOk', '1')
  return NextResponse.redirect(url, 302)
}
