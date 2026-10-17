import { randomUUID } from 'node:crypto'

export interface SnapshotStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, options: { ex: number; nx?: true }): Promise<unknown>
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
}

export type Snapshot<T> = {
  data: T
  updatedAt: number
  freshUntil: number
  staleUntil: number
  stale: boolean
  refreshing: boolean
}

export class SnapshotUnavailable extends Error {
  constructor(public readonly retryAfter = 15) {
    super('Snapshot temporarily unavailable')
  }
}

// Fenced publication prevents an expired lease from overwriting newer data.
export const PUBLISH = `if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`
export const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`
export const BACKOFF = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('set', KEYS[2], '1', 'EX', ARGV[2])
end
return 0`

export function createSnapshotCache(store: SnapshotStore, now = Date.now) {
  return async function read<T>(
    key: string,
    load: () => Promise<T>,
    freshSeconds = 30,
    staleSeconds = 300,
  ): Promise<Snapshot<T>> {
    const snapshotKey = `sdk:snapshots:v1:${key}`
    const lockKey = `${snapshotKey}:lock`
    const retryKey = `${snapshotKey}:retry`
    const cached = await store.get<Omit<Snapshot<T>, 'stale' | 'refreshing'>>(snapshotKey)
    const lastGood = cached && cached.staleUntil > now() ? cached : null
    if (lastGood && lastGood.freshUntil > now()) {
      return { ...lastGood, stale: false, refreshing: false }
    }
    if (await store.get(retryKey)) {
      if (lastGood) return { ...lastGood, stale: true, refreshing: false }
      throw new SnapshotUnavailable()
    }
    const token = randomUUID()
    // Refresh handlers finish within 60 seconds. A crashed invocation's lease
    // expires automatically; there is no process-local cache or detached work.
    const acquired = await store.set(lockKey, token, { nx: true, ex: 65 })
    if (acquired !== 'OK') {
      if (lastGood) return { ...lastGood, stale: true, refreshing: true }
      throw new SnapshotUnavailable(2)
    }
    try {
      // Another invocation may publish between the first read and SET NX.
      const latest = await store.get<typeof cached>(snapshotKey)
      if (latest && latest.freshUntil > now()) {
        return { ...latest, stale: false, refreshing: false }
      }
      const data = await load()
      const updatedAt = now()
      const snapshot = {
        data,
        updatedAt,
        freshUntil: updatedAt + freshSeconds * 1000,
        staleUntil: updatedAt + (freshSeconds + staleSeconds) * 1000,
      }
      const published = await store.eval(
        PUBLISH,
        [lockKey, snapshotKey],
        [token, JSON.stringify(snapshot), freshSeconds + staleSeconds],
      )
      if (published !== 1) throw new SnapshotUnavailable(2)
      return { ...snapshot, stale: false, refreshing: false }
    } catch (error) {
      try {
        await store.eval(BACKOFF, [lockKey, retryKey], [token, 15])
      } catch {
        // The lease still bounds refresh attempts if storage fails mid-request.
      }
      console.error('[integration snapshot] Refresh failed', {
        key,
        error: error instanceof Error ? error.name : 'unknown',
      })
      if (lastGood && lastGood.staleUntil > now()) {
        return { ...lastGood, stale: true, refreshing: false }
      }
      throw error instanceof SnapshotUnavailable ? error : new SnapshotUnavailable()
    } finally {
      try {
        await store.eval(RELEASE, [lockKey], [token])
      } catch {
        // Expiry releases a stranded lease. Cleanup failure must not discard a
        // successful publication or a known last-good response.
      }
    }
  }
}

