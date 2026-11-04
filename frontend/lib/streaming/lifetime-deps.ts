import { createPublicClient, http } from 'viem'
import { kv } from '@vercel/kv'
import { underRateLimit } from '@/lib/rate-limit'
import { base } from 'viem/chains'

export const lifetimeDeps = {
  underRateLimit,
  get: <T>(key: string) => kv.get<T>(key),
  set: (key: string, value: unknown) => kv.set(key, value),
  client: () => createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  }),
}
