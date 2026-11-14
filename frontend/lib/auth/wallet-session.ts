import 'server-only'
import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import { verifyMessage } from 'viem'
import { ID_TOKEN_HEADER, SESSION_REQUIRED } from './wallet-session-protocol'

export { ID_TOKEN_HEADER, SESSION_REQUIRED }

const ISSUER = 'privy.io'
const CLOCK_SKEW = 30
const JWKS_TTL = 60 * 60 * 1000
const JWKS_REFRESH_FLOOR = 60 * 1000
const USER_TTL = 30 * 1000
const USER_CACHE_MAX = 500
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

type Jwk = JsonWebKey & { kid?: string }
type Claims = { iss?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; sub?: unknown; linked_accounts?: unknown }

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null
const userCache = new Map<string, { wallets: string[]; expiresAt: number }>()

async function fetchJwks(appId: string): Promise<Jwk[]> {
  const res = await fetch(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Privy JWKS ${res.status}`)
  const { keys } = await res.json() as { keys?: Jwk[] }
  return Array.isArray(keys) ? keys : []
}

async function fetchUserWallets(appId: string, userId: string): Promise<string[]> {
  const secret = process.env.PRIVY_APP_SECRET
  if (!secret) return []
  const res = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(userId)}`, {
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}`,
      'privy-app-id': appId,
    },
  })
  if (!res.ok) return []
  const user = await res.json() as { linked_accounts?: unknown }
  return linkedWallets(user.linked_accounts)
}

export const walletSessionDeps = {
  appId: () => process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '',
  now: () => Date.now(),
  jwks: async (appId: string, forceRefresh: boolean): Promise<Jwk[]> => {
    const now = Date.now()
    const stale = !jwksCache || now - jwksCache.fetchedAt > JWKS_TTL
    const mayRefresh = !jwksCache || now - jwksCache.fetchedAt > JWKS_REFRESH_FLOOR
    if (stale || (forceRefresh && mayRefresh)) jwksCache = { keys: await fetchJwks(appId), fetchedAt: now }
    return jwksCache!.keys
  },
  userWallets: async (appId: string, userId: string): Promise<string[]> => {
    const now = Date.now()
    const cached = userCache.get(userId)
    if (cached && cached.expiresAt > now) return cached.wallets
    const wallets = await fetchUserWallets(appId, userId)
    if (userCache.size >= USER_CACHE_MAX) userCache.delete(userCache.keys().next().value!)
    userCache.set(userId, { wallets, expiresAt: now + USER_TTL })
    return wallets
  },
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

export function linkedWallets(accounts: unknown): string[] {
  let list = accounts
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch { return [] }
  }
  if (!Array.isArray(list)) return []
  return list.flatMap(account => {
    const { type, address, chain_type: chainType } = (account ?? {}) as Record<string, unknown>
    if (type !== 'wallet' || chainType !== 'ethereum' || typeof address !== 'string' || !ADDRESS.test(address)) return []
    return [address.toLowerCase()]
  })
}

export async function verifyPrivyToken(token: string): Promise<Claims | null> {
  const appId = walletSessionDeps.appId()
  const parts = token.split('.')
  if (!appId || parts.length !== 3) return null
  try {
    const header = decodeSegment(parts[0]) as { alg?: unknown; kid?: unknown }
    if (header.alg !== 'ES256' || typeof header.kid !== 'string') return null
    let key = (await walletSessionDeps.jwks(appId, false)).find(k => k.kid === header.kid)
    if (!key) key = (await walletSessionDeps.jwks(appId, true)).find(k => k.kid === header.kid)
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256') return null
    const valid = verify(
      'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(parts[2], 'base64url'),
    )
    if (!valid) return null
    const claims = decodeSegment(parts[1]) as Claims
    const now = Math.floor(walletSessionDeps.now() / 1000)
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== ISSUER || !audiences.includes(appId)) return null
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW < now) return null
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW > now) return null
    if (typeof claims.sub !== 'string' || !claims.sub) return null
    return claims
  } catch {
    return null
  }
}

/** Wallets the request's Privy session proves control of, or null when no session was presented. */
export async function sessionWallets(request: Request): Promise<string[] | null> {
  const identityToken = request.headers.get(ID_TOKEN_HEADER)
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!identityToken && !bearer) return null
  if (identityToken) {
    const claims = await verifyPrivyToken(identityToken)
    const wallets = claims ? linkedWallets(claims.linked_accounts) : []
    if (wallets.length) return wallets
  }
  if (bearer) {
    const claims = await verifyPrivyToken(bearer)
    if (claims) return walletSessionDeps.userWallets(walletSessionDeps.appId(), claims.sub as string).catch(() => [])
  }
  return []
}

export type WalletAuth =
  | { ok: true; via: 'session' | 'signature' }
  | { ok: false; status: 400 | 401; body: { error: string; code?: string } }

/**
 * Proves the caller controls `address`, by a Privy session that has the wallet linked or, failing
 * that, by a personal_sign signature over `message()`. Freshness of the signed timestamp stays the
 * route's job. Pass `allowSession: false` for actions that must always carry a signature.
 */
export async function authorizeWallet(
  request: Request,
  address: string,
  signature: unknown,
  message: () => string,
  { allowSession = true }: { allowSession?: boolean } = {},
): Promise<WalletAuth> {
  const wallets = allowSession ? await sessionWallets(request) : null
  if (wallets?.includes(address.toLowerCase())) return { ok: true, via: 'session' }
  if (typeof signature === 'string' && /^0x[0-9a-fA-F]+$/.test(signature)) {
    const valid = await verifyMessage({ address: address as `0x${string}`, message: message(), signature: signature as `0x${string}` }).catch(() => false)
    return valid ? { ok: true, via: 'signature' } : { ok: false, status: 401, body: { error: 'Invalid signature' } }
  }
  if (wallets) return { ok: false, status: 401, body: { error: 'Your session does not cover this wallet. Sign to continue.', code: SESSION_REQUIRED } }
  return { ok: false, status: 400, body: { error: 'Missing signature or timestamp' } }
}
