// GET /api/moderation/notify/verify?token=<token>
//   Validates a one-time email verification token issued when a board admin adds a moderator with
//   an email address. On success, marks the moderator's email as verified in KV and redirects to
//   /account so they can manage their notification frequency preferences.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { notifyStateKey, verifyTokenKey, type ModeratorNotifyState, type VerifyToken } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: 'Missing or invalid token' }, { status: 400 })
  }

  const payload = await kv.get<VerifyToken>(verifyTokenKey(token)).catch(() => null)
  if (!payload) {
    // Token not found or expired — redirect to account with an error hint.
    const url = new URL('/account', req.nextUrl.origin)
    url.searchParams.set('verifyError', 'expired')
    return NextResponse.redirect(url, 302)
  }

  const now = Math.floor(Date.now() / 1000)
  if (now > payload.expiresAt) {
    await kv.del(verifyTokenKey(token)).catch(() => {})
    const url = new URL('/account', req.nextUrl.origin)
    url.searchParams.set('verifyError', 'expired')
    return NextResponse.redirect(url, 302)
  }

  // Mark the email as verified. If the state was updated by the moderator (e.g. they changed
  // frequency) since the token was issued, preserve their frequency preference.
  const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(payload.wallet)).catch(() => null)
  if (existing && existing.email === payload.email) {
    const updated: ModeratorNotifyState = {
      ...existing,
      verified: true,
      verifiedAt: now,
    }
    await kv.set(notifyStateKey(payload.wallet), updated)
  }
  // Token is single-use.
  await kv.del(verifyTokenKey(token)).catch(() => {})

  const url = new URL('/account', req.nextUrl.origin)
  url.searchParams.set('tab', 'moderation')
  url.searchParams.set('verifyOk', '1')
  return NextResponse.redirect(url, 302)
}
