import { kv } from '@vercel/kv'
import { createPublicClient, http, verifyMessage } from 'viem'
import { base } from 'viem/chains'
import { MARKEE_TOKEN } from '@/lib/contracts/addresses'
import { underRateLimit } from '@/lib/rate-limit'

const MARKEE_THRESHOLD = 100n * 10n ** 18n
const ERC20_ABI = [{
  inputs: [{ name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
}] as const

const client = createPublicClient({ chain: base, transport: http(process.env.ALCHEMY_BASE_URL || undefined) })

async function holdsEnoughMarkee(address: `0x${string}`): Promise<boolean> {
  const cacheKey = `balance:markee:${address.toLowerCase()}:${base.id}`
  const cached = await kv.get<boolean>(cacheKey)
  if (cached !== null) return cached
  try {
    const balance = await client.readContract({ address: MARKEE_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
    const enough = balance >= MARKEE_THRESHOLD
    await kv.set(cacheKey, enough, { ex: 300 })
    return enough
  } catch (error) {
    console.error('[Reactions] Balance check error:', error)
    return false
  }
}

export const reactionsDeps = {
  verifyMessage: (args: { address: `0x${string}`; message: string; signature: `0x${string}` }) => verifyMessage(args).catch(() => false),
  holdsEnoughMarkee,
  underRateLimit,
  cooldown: async (user: string) => (await kv.set(`ratelimit:reactions:${user}`, 1, { ex: 30, nx: true })) !== null,
  hgetall: (key: string) => kv.hgetall<Record<string, unknown>>(key),
  hset: (key: string, field: string, value: string) => kv.hset(key, { [field]: value }),
  hdel: (key: string, field: string) => kv.hdel(key, field),
  sadd: (key: string, member: string) => kv.sadd(key, member),
  smembers: (key: string) => kv.smembers<string[]>(key),
}
