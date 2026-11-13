import { createHash } from 'node:crypto'
import { kv } from '@vercel/kv'
import { underRateLimit } from '../rate-limit'

export const CLIENT_ERROR_LIMITS = {
  perIp: { max: 10, windowSeconds: 60 },
  forwardedPerMinute: 30,
  duplicateWindowSeconds: 600,
} as const

export const clientErrorDeps = {
  underRateLimit,
  firstSeen: async (key: string, ttl: number) => (await kv.set(key, 1, { ex: ttl, nx: true })) !== null,
}

// Reports are written by anyone, so they reach the ops channel without pings or clickable links.
export function sanitizeReportText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value
    .slice(0, max * 2)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\u2060\ufeff]/g, '')
    .replace(/<(@[!&]?|#)\d+>/g, '[mention]')
    .replace(/@(everyone|here)\b/gi, '[mention]')
    .replace(/\b(?:https?|ftp|wss?):\/\/[^\s'"<>)]+/gi, '[link]')
    .replace(/\bwww\.[^\s'"<>)]+/gi, '[link]')
    .replace(/discord(?:app)?\.(?:gg|com\/invite)\/\S+/gi, '[link]')
    .slice(0, max)
}

// Same-origin paths are useful context; anything else is reduced to a marker.
export function sanitizePathname(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const path = value.slice(0, 1_000)
  return /^\/(?!\/)[\w\-./~%?&=+#:@,;]*$/.test(path) ? path : '[invalid path]'
}

export type ForwardDecision = 'forward' | 'duplicate' | 'over-limit'

export async function clientErrorForwarding(name: string, message: string, digest: string | undefined): Promise<ForwardDecision> {
  const hash = createHash('sha256').update(`${name}\u0000${message}\u0000${digest ?? ''}`).digest('hex').slice(0, 32)
  if (!await clientErrorDeps.firstSeen(`client-errors:seen:${hash}`, CLIENT_ERROR_LIMITS.duplicateWindowSeconds)) return 'duplicate'
  if (!await clientErrorDeps.underRateLimit('client-errors-forwarded', 'all', CLIENT_ERROR_LIMITS.forwardedPerMinute, 60)) return 'over-limit'
  return 'forward'
}
