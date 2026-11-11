export interface TrackedCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  retain(key: string): void
  release(key: string): void
  size(): number
}

export function createTrackedCache<T>(isResolved: (value: T) => boolean): TrackedCache<T> {
  const values = new Map<string, T>()
  const subscribers = new Map<string, number>()

  function evictIfIdle(key: string) {
    const value = values.get(key)
    if (value !== undefined && !subscribers.has(key) && isResolved(value)) values.delete(key)
  }

  return {
    get: key => values.get(key),
    set(key, value) {
      values.set(key, value)
      evictIfIdle(key)
    },
    retain(key) {
      subscribers.set(key, (subscribers.get(key) ?? 0) + 1)
    },
    release(key) {
      const remaining = (subscribers.get(key) ?? 0) - 1
      if (remaining > 0) subscribers.set(key, remaining)
      else subscribers.delete(key)
      evictIfIdle(key)
    },
    size: () => values.size,
  }
}
