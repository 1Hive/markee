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

export interface BoardOrigin {
  creator: string | null
  initialAdmin: string | null
}

// Maps each leaderboard to the wallet that deployed it (`tx.from` of the creation log) and the admin
// it was created with. Both are cached permanently because neither ever changes.
export async function resolveBoardOrigins(
  client: CreatorClient,
  addresses: readonly `0x${string}`[],
  { keyPrefix, factories, fromBlock, logLabel }: ResolveCreatorsOptions,
): Promise<BoardOrigin[]> {
  const keys = addresses.map(a => `creator:${keyPrefix}:${a.toLowerCase()}`)
  const adminKeys = addresses.map(a => `initial-admin:${keyPrefix}:${a.toLowerCase()}`)
  if (keys.length === 0) return []
  const [cached, cachedAdmins] = await Promise.all([
    kv.mget<(string | null)[]>(...keys),
    kv.mget<(string | null)[]>(...adminKeys),
  ])
  const origins = (): BoardOrigin[] => cached.map((creator, i) => ({ creator: creator ?? null, initialAdmin: cachedAdmins[i] ?? null }))

  const missingIndices = addresses.map((_, i) => i).filter(i => !cached[i] || !cachedAdmins[i])
  if (missingIndices.length === 0) return origins()

  try {
    const logsPerFactory = await Promise.all(
      factories.map(address => client.getLogs({ address, event: LEADERBOARD_CREATED_EVENT, fromBlock, toBlock: 'latest' }))
    )
    const logs = logsPerFactory.flat()

    const lbToTxHash = new Map<string, `0x${string}`>()
    const lbToAdmin = new Map<string, string>()
    for (const log of logs) {
      if (log.topics[1] && log.transactionHash) {
        const addr = (`0x${log.topics[1].slice(26)}`).toLowerCase()
        lbToTxHash.set(addr, log.transactionHash)
        if (log.topics[2]) lbToAdmin.set(addr, `0x${log.topics[2].slice(26)}`.toLowerCase())
      }
    }

    const missingAddrs = missingIndices.filter(i => !cached[i]).map(i => addresses[i].toLowerCase())
    const hashes = [...new Set(missingAddrs.map(a => lbToTxHash.get(a)).filter((h): h is `0x${string}` => !!h))]
    const txs = await Promise.all(hashes.map(hash => client.getTransaction({ hash })))
    const txMap = new Map(txs.map(tx => [tx.hash.toLowerCase(), tx.from.toLowerCase()]))

    await Promise.all(missingIndices.flatMap(i => {
      const addr = addresses[i].toLowerCase()
      const writes: Promise<unknown>[] = []
      const creator = cached[i] ? null : txMap.get((lbToTxHash.get(addr) ?? '').toLowerCase())
      if (creator) {
        cached[i] = creator
        writes.push(kv.set(keys[i], creator))
      }
      const initialAdmin = lbToAdmin.get(addr)
      if (initialAdmin && !cachedAdmins[i]) {
        cachedAdmins[i] = initialAdmin
        writes.push(kv.set(adminKeys[i], initialAdmin))
      }
      return writes
    }))
  } catch (e: any) {
    console.error(`[${logLabel}] creator lookup error:`, e.message)
  }

  return origins()
}
