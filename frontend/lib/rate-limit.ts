import { kv } from '@vercel/kv'

// Fixed-window counter for unauthenticated endpoints whose work is expensive enough that the
// response cache alone doesn't bound it.
//
// The window index is part of the key on purpose: a crash between the incr and the expire then
// leaks one short-lived key instead of leaving a counter with no TTL, which would ban that caller
// until someone cleaned it up by hand. The next window writes a different key regardless.
export async function underRateLimit(
  scope: string,
  ip: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = `ratelimit:${scope}:${ip}:${bucket}`
  const hits = await kv.incr(key)
  if (hits === 1) await kv.expire(key, windowSeconds * 2)
  return hits <= max
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
