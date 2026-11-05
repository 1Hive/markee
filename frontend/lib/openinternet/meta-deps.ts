import { kv } from '@vercel/kv'
import { readBoardOwners } from '../moderation/server'

export const metaWriteDeps = {
  readBoardOwners,
  get: (key: string) => kv.get<Record<string, unknown>>(key),
  set: (key: string, value: Record<string, unknown>) => kv.set(key, value),
  del: (key: string) => kv.del(key),
}
