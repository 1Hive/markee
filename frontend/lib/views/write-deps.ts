import { kv } from '@vercel/kv'
import { underRateLimit } from '../rate-limit'

export const viewsWriteDeps = {
  underRateLimit,
  get: <T = unknown>(key: string) => kv.get<T>(key),
  mget: <T extends unknown[]>(...keys: string[]) => kv.mget<T>(...keys),
  set: (key: string, value: unknown) => kv.set(key, value),
  pipeline: () => kv.pipeline(),
}
