// lib/github/session.ts
import crypto from 'crypto'
import { kv } from '@vercel/kv'

// Name carried over from the pre-session cookie so browsers replace that one instead of keeping
// both; the value is an opaque session id now, not the GitHub user id it reads like.
export const SESSION_COOKIE = 'github_uid'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365

interface GithubUserRecord {
  accessToken: string
  login: string
  avatarUrl: string
  installedAt: string
}

export interface GithubSession extends GithubUserRecord {
  githubUserId: string
}

// The OAuth token stays keyed by the GitHub numeric id so the reverse lookups in
// update-markee-file and traffic (which only know linkedByUid) keep resolving.
// The cookie carries an opaque session id that maps onto that numeric id.
export async function createSession(githubUserId: string | number): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex')
  await kv.set(
    `github:session:${sessionId}`,
    { githubUserId: String(githubUserId) },
    { ex: SESSION_TTL_SECONDS },
  )
  return sessionId
}

export async function resolveSession(sessionId: string | undefined): Promise<GithubSession | null> {
  if (!sessionId) return null

  const rawSession = await kv.get<{ githubUserId?: string } | string>(`github:session:${sessionId}`)
  if (!rawSession) return null
  const session = typeof rawSession === 'string' ? JSON.parse(rawSession) : rawSession
  const githubUserId = session?.githubUserId ? String(session.githubUserId) : null
  if (!githubUserId) return null

  const rawUser = await kv.get<GithubUserRecord | string>(`github:user:${githubUserId}`)
  if (!rawUser) return null
  const user = (typeof rawUser === 'string' ? JSON.parse(rawUser) : rawUser) as GithubUserRecord
  if (!user?.accessToken) return null

  return { githubUserId, ...user }
}

// Only the session mapping is removed -- github:user:{uid} holds the OAuth token shared by every
// session for that GitHub account (see resolveSession), so deleting it here would silently break
// concurrent sessions (e.g. a second browser/device) on a single logout.
export async function destroySession(sessionId: string): Promise<void> {
  await kv.del(`github:session:${sessionId}`)
}

export function sessionCookieOptions(requestUrl: string) {
  const hostname = new URL(requestUrl).hostname
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    domain: hostname === 'markee.xyz' || hostname.endsWith('.markee.xyz') ? '.markee.xyz' : undefined,
  }
}

// Cookies issued before the session id were host-only, so a Domain-scoped one does not
// replace them and the browser keeps sending both. Expire that variant explicitly.
export function expireHostOnlyCookie(headers: Headers): void {
  const attrs = ['Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (process.env.NODE_ENV === 'production') attrs.push('Secure')
  headers.append('set-cookie', `${SESSION_COOKIE}=; ${attrs.join('; ')}`)
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS
