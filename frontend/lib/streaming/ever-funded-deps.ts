import { kv } from '@vercel/kv'
import { createPublicClient, http, isAddress, parseAbi, type Address } from 'viem'
import { base } from 'viem/chains'
import { BASE_STREAMING_FACTORY, STREAMING_FACTORY } from '@/lib/contracts/addresses'
import { getBackingHistory } from './messages'
import { readRateLimited } from '@/lib/rate-limit'

const FACTORY_ABI = parseAbi(['function isFactoryLeaderboard(address) view returns (bool)'])
const STREAMING_FACTORIES = [...new Set([BASE_STREAMING_FACTORY, STREAMING_FACTORY].filter(a => isAddress(a)).map(a => a.toLowerCase()))] as Address[]

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

export async function isStreamingBoard(board: Address): Promise<boolean> {
  const reads = await getClient().multicall({
    contracts: STREAMING_FACTORIES.map(factory => ({ address: factory, abi: FACTORY_ABI, functionName: 'isFactoryLeaderboard' as const, args: [board] })),
  })
  if (reads.some(r => r.status === 'success' && r.result === true)) return true
  if (reads.every(r => r.status === 'success')) return false
  throw new Error('Factory check failed')
}

export const everFundedDeps = {
  rateLimited: readRateLimited,
  get: <T>(key: string) => kv.get<T>(key),
  set: (key: string, value: unknown, ex: number) => kv.set(key, value, { ex }),
  isStreamingBoard,
  backingHistory: (board: string) => getBackingHistory(getClient(), board),
}
