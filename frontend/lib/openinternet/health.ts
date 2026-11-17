import { kv } from '@vercel/kv'
import { isIP } from 'node:net'
import { fetchPublic, PublicFetchError } from '@/lib/net/public-fetch'
import { readRateLimited } from '@/lib/rate-limit'

const HEALTH_PATH = '/api/markee/health'
const STATUSES = ['ok', 'warn', 'error', 'unknown'] as const
const CHECK_KEYS = ['leaderboard', 'viewTracking', 'moderation'] as const
const MAX_DETAIL_KEYS = 10

type Status = typeof STATUSES[number]
type Detail = Record<string, string | number | boolean | null>
interface Check { status: Status; message: string; detail?: Detail }
export interface IntegrationHealth {
  overall: Status
  message?: string
  timestamp?: number
  checks?: Partial<Record<typeof CHECK_KEYS[number], Check>>
  platform?: 'vercel' | 'unknown'
}

export function healthEndpoint(raw: string | null): URL | null {
  if (!raw || raw.length > 2048) return null
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null
  if (isIP(url.hostname) || url.hostname.startsWith('[') || !url.hostname.includes('.')) return null
  return new URL(HEALTH_PATH, url.origin)
}

function status(value: unknown): Status {
  return STATUSES.includes(value as Status) ? value as Status : 'unknown'
}

function text(value: unknown, max = 300): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

function detail(value: unknown): Detail | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
    .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    .slice(0, MAX_DETAIL_KEYS)
    .map(([k, v]) => [k.slice(0, 64), typeof v === 'string' ? v.slice(0, 200) : v] as const)
  return entries.length ? Object.fromEntries(entries) : undefined
}

export function normalizeHealth(data: unknown, platform: 'vercel' | 'unknown'): IntegrationHealth {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const health: IntegrationHealth = { overall: status(raw.overall), platform }
  const message = text(raw.message)
  if (message) health.message = message
  if (typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)) health.timestamp = raw.timestamp
  if (raw.checks && typeof raw.checks === 'object') {
    const source = raw.checks as Record<string, unknown>
    const checks: IntegrationHealth['checks'] = {}
    for (const key of CHECK_KEYS) {
      const check = source[key]
      if (!check || typeof check !== 'object') continue
      const c = check as Record<string, unknown>
      const d = detail(c.detail)
      checks[key] = { status: status(c.status), message: text(c.message) ?? '', ...(d ? { detail: d } : {}) }
    }
    if (Object.keys(checks).length) health.checks = checks
  }
  return health
}

async function probe(endpoint: URL): Promise<IntegrationHealth> {
  try {
    const res = await healthDeps.fetch(endpoint, { headers: { Accept: 'application/json', 'User-Agent': 'Markee-Health/1.0' }, maxBytes: 64 * 1024, timeoutMs: 8_000 })
    if (res.status === 404) {
      return { overall: 'unknown', message: 'Health endpoint not found. The integration may not have implemented /api/markee/health yet.' }
    }
    if (res.status < 200 || res.status >= 300) {
      return { overall: 'error', message: `Integration health endpoint returned HTTP ${res.status}` }
    }
    let data: unknown
    try { data = JSON.parse(res.body.toString('utf8')) } catch {
      return { overall: 'error', message: 'Integration health endpoint did not return JSON' }
    }
    return normalizeHealth(data, res.headers['x-vercel-id'] ? 'vercel' : 'unknown')
  } catch (error) {
    if (error instanceof PublicFetchError && error.code === 'TIMEOUT') return { overall: 'error', message: 'Integration health endpoint timed out' }
    if (error instanceof PublicFetchError && error.code === 'PRIVATE_ADDRESS') return { overall: 'error', message: 'Integration site must resolve to public addresses' }
    return { overall: 'error', message: 'Could not reach integration health endpoint' }
  }
}

export const healthDeps = {
  fetch: fetchPublic,
  rateLimited: readRateLimited,
  get: (key: string) => kv.get<IntegrationHealth>(key),
  set: (key: string, value: IntegrationHealth) => kv.set(key, value, { ex: 60 }),
}

export type HealthResult = { status: 200; body: IntegrationHealth } | { status: 400 | 429; body: { error: string } }

export async function checkIntegrationHealth(request: Request, rawUrl: string | null): Promise<HealthResult> {
  if (!rawUrl) return { status: 400, body: { error: 'Missing url parameter' } }
  const endpoint = healthEndpoint(rawUrl)
  if (!endpoint) return { status: 400, body: { error: 'Invalid url' } }
  const cacheKey = `cache:openinternet:health:${endpoint.origin}`
  const cached = await healthDeps.get(cacheKey).catch(() => null)
  if (cached) return { status: 200, body: cached }
  if (await healthDeps.rateLimited(request, 'openinternet-health', 30)) {
    return { status: 429, body: { error: 'Too many requests, try again shortly' } }
  }
  const health = await probe(endpoint)
  await healthDeps.set(cacheKey, health).catch(() => {})
  return { status: 200, body: health }
}
