import { kv } from '@vercel/kv'
import type { Address } from 'viem'
import { underRateLimit } from '../rate-limit'
import { cachedCurrentAddress } from '../contracts/currentAddressCache'

export const viewsWriteDeps = {
  underRateLimit,
  get: <T = unknown>(key: string) => kv.get<T>(key),
  mget: <T extends unknown[]>(...keys: string[]) => kv.mget<T>(...keys),
  set: (key: string, value: unknown) => kv.set(key, value),
  pipeline: () => kv.pipeline(),
  currentAddress: (address: string) => cachedCurrentAddress(address as Address).then(r => r.address as string).catch(() => address),
}
