import { NextResponse } from 'next/server'
import { createSnapshotCache, SnapshotUnavailable, type SnapshotStore } from '@/lib/sdk/snapshot-cache'
import { displayCacheConfigured, snapshotStorage } from '@/lib/sdk/cached-display'
import { clientIp, underRateLimit } from '@/lib/rate-limit'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export interface CachedChainReadOptions<T> {
  /** Rate-limit scope and cache namespace, e.g. 'streaming-board'. */
  scope: string
  /** Identity of the read within the scope (board address, slug, limit...). */
  key: string
  load: () => Promise<T>
  freshSeconds?: number
  staleSeconds?: number
  /** How long the last successful payload stays available while the RPC is failing. */
  lastGoodSeconds?: number
  /** Requests per IP per minute, cache hits included. */
  maxPerMinute?: number
  /** Forced refreshes (?fresh=1) per IP per minute; extra ones get the cached payload. */
  maxForcedPerMinute?: number
}

export const chainReadDeps = {
  store: (): SnapshotStore => snapshotStorage.get(),
  underRateLimit,
  configured: displayCacheConfigured,
}

// Browser pages read chain state through these routes instead of polling the RPC themselves, so
// every viewer of a board shares one refresh. Only one request refreshes a key at a time (the
// snapshot cache's lease), and a last-good copy keeps the page rendering through an RPC outage.
export async function cachedChainRead<T>(request: Request, options: CachedChainReadOptions<T>): Promise<NextResponse> {
  const {
    scope, key, load, freshSeconds = 30, staleSeconds = 300,
    lastGoodSeconds = 7 * 24 * 60 * 60, maxPerMinute = 120, maxForcedPerMinute = 6,
  } = options

  if (!chainReadDeps.configured()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Cache storage is not configured' }, { status: 503, headers: NO_CACHE })
    }
    return NextResponse.json({ data: await load(), updatedAt: Date.now(), stale: false }, { headers: NO_CACHE })
  }

  const ip = clientIp(request)
  if (!await chainReadDeps.underRateLimit(scope, ip, maxPerMinute, 60)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { ...NO_CACHE, 'Retry-After': '60' } })
  }
  const wantsFresh = new URL(request.url).searchParams.get('fresh') === '1'
  const force = wantsFresh && await chainReadDeps.underRateLimit(`${scope}:fresh`, ip, maxForcedPerMinute, 60)

  const store = chainReadDeps.store()
  const lastGoodKey = `chain-read:last-good:${scope}:${key}`
  let loaded = false
  const read = createSnapshotCache(store)
  const loadOnce = async () => {
    const value = await load()
    loaded = true
    return value
  }
  try {
    let result
    for (let attempt = 0; ; attempt++) {
      try {
        result = await read(`chain-read:${scope}:${key}`, loadOnce, freshSeconds, staleSeconds, force)
        break
      } catch (error) {
        // Another request is loading a cold key: wait for its result instead of failing or
        // starting a second chain read.
        if (!(error instanceof SnapshotUnavailable) || error.retryAfter !== 2 || attempt >= 20) throw error
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    if (loaded) {
      await store.set(lastGoodKey, { data: result.data, updatedAt: result.updatedAt }, { ex: lastGoodSeconds }).catch(() => {})
    }
    return NextResponse.json({ data: result.data, updatedAt: result.updatedAt, stale: result.stale }, { headers: NO_CACHE })
  } catch (error) {
    const saved = await store.get<{ data: T; updatedAt: number }>(lastGoodKey).catch(() => null)
    if (saved) return NextResponse.json({ data: saved.data, updatedAt: saved.updatedAt, stale: true }, { headers: NO_CACHE })
    if (!(error instanceof SnapshotUnavailable)) console.error(`[${scope}] chain read failed`, error)
    const retryAfter = error instanceof SnapshotUnavailable ? error.retryAfter : 15
    return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503, headers: { ...NO_CACHE, 'Retry-After': String(retryAfter) } })
  }
}
