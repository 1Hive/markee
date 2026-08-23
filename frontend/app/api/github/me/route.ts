// frontend/app/api/github/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { destroySession, expireHostOnlyCookie, resolveSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/github/session'

export const dynamic = 'force-dynamic'

// This is the single gate the embed modal checks on every mount to decide "Connect GitHub" vs the
// repo picker -- without explicit no-store, a browser (or an intermediary cache) can serve back the
// stale "connected: false" it got before OAuth completed, forever, even after the cookie is set
// correctly. That looks exactly like GitHub never actually connecting.
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

function clearSessionCookie(res: NextResponse, requestUrl: string) {
  const cookieOptions = sessionCookieOptions(requestUrl)
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  if (cookieOptions.domain) expireHostOnlyCookie(res.headers)
}

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionId) {
    return NextResponse.json({ connected: false }, { headers: NO_CACHE })
  }

  const session = await resolveSession(sessionId)
  if (!session) {
    const res = NextResponse.json({ connected: false }, { headers: NO_CACHE })
    clearSessionCookie(res, request.url)
    return res
  }

  return NextResponse.json({
    connected: true,
    uid: session.githubUserId,
    login: session.login,
    avatarUrl: session.avatarUrl,
    installedAt: session.installedAt,
  }, { headers: NO_CACHE })
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value

  // Disconnecting acts on the resolved session only, so a stale cookie leaves the
  // stored token untouched.
  if (sessionId) {
    const session = await resolveSession(sessionId)
    if (session) await destroySession(sessionId, session.githubUserId)
  }

  const res = NextResponse.json({ disconnected: true }, { headers: NO_CACHE })
  clearSessionCookie(res, request.url)
  return res
}
