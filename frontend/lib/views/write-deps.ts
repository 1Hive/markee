import { kv } from '@vercel/kv'

export const viewsWriteDeps = {
  get: <T = unknown>(key: string) => kv.get<T>(key),
  mget: <T extends unknown[]>(...keys: string[]) => kv.mget<T>(...keys),
  set: (key: string, value: unknown) => kv.set(key, value),
  pipeline: () => kv.pipeline(),
}
