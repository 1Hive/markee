// lib/leaderboards/resolveCreators.ts
import { kv } from '@vercel/kv'
import { parseAbiItem } from 'viem'

export const LEADERBOARD_CREATED_EVENT = parseAbiItem(
  'event LeaderboardCreated(address indexed leaderboardAddress, address indexed admin, address indexed beneficiaryAddress, string name, address seedMarkeeAddress)'
)

// Structural rather than viem's PublicClient, which specializes on the chain and so won't accept
// each route's own client without a type mismatch.
interface CreatorClient {
  getLogs(args: {
    address: `0x${string}`
    event: typeof LEADERBOARD_CREATED_EVENT
    fromBlock: bigint
    toBlock: 'latest'
  }): Promise<{ topics: readonly (`0x${string}` | undefined)[]; transactionHash: `0x${string}` | null }[]>
  getTransaction(args: { hash: `0x${string}` }): Promise<{ hash: `0x${string}`; from: `0x${string}` }>
}

interface ResolveCreatorsOptions {
  // Short KV namespace per platform (gh, sf, oi, fs) so the caches stay separate.
  keyPrefix: string
  factories: readonly `0x${string}`[]
  fromBlock: bigint
  logLabel: string
}

// Maps each leaderboard to the wallet that deployed it, by finding the creation log and reading
// `tx.from`. Results are cached permanently because a creator never changes.
export async function resolveCreators(
  client: CreatorClient,
  addresses: readonly `0x${string}`[],
  { keyPrefix, factories, fromBlock, logLabel }: ResolveCreatorsOptions,
): Promise<(string | null)[]> {
  const keys = addresses.map(a => `creator:${keyPrefix}:${a.toLowerCase()}`)
  if (keys.length === 0) return []
  const cached = await kv.mget<(string | null)[]>(...keys)

  const missingIndices = addresses.map((_, i) => i).filter(i => !cached[i])
  if (missingIndices.length === 0) return cached

  try {
    const logsPerFactory = await Promise.all(
      factories.map(address => client.getLogs({ address, event: LEADERBOARD_CREATED_EVENT, fromBlock, toBlock: 'latest' }))
    )
    const logs = logsPerFactory.flat()

    const lbToTxHash = new Map<string, `0x${string}`>()
    for (const log of logs) {
      if (log.topics[1] && log.transactionHash) {
        const addr = (`0x${log.topics[1].slice(26)}`).toLowerCase()
        lbToTxHash.set(addr, log.transactionHash)
      }
    }

    const missingAddrs = missingIndices.map(i => addresses[i].toLowerCase())
    const hashes = [...new Set(missingAddrs.map(a => lbToTxHash.get(a)).filter((h): h is `0x${string}` => !!h))]
    const txs = await Promise.all(hashes.map(hash => client.getTransaction({ hash })))
    const txMap = new Map(txs.map(tx => [tx.hash.toLowerCase(), tx.from.toLowerCase()]))

    await Promise.all(missingIndices.map(i => {
      const addr = addresses[i].toLowerCase()
      const creator = txMap.get((lbToTxHash.get(addr) ?? '').toLowerCase())
      if (creator) {
        cached[i] = creator
        return kv.set(keys[i], creator)
      }
    }))
  } catch (e: any) {
    console.error(`[${logLabel}] creator lookup error:`, e.message)
  }

  return cached
}
