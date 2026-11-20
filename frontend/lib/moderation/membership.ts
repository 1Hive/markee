import 'server-only'
import { isAddress, parseAbi, type Address } from 'viem'
import { CONTRACTS, FACTORIES, V13_LEADERBOARDS, V14_FACTORIES } from '@/lib/contracts/addresses'
import { getModerationClient } from './server'

const ABI = parseAbi([
  'function markeeAddress() view returns (address)',
  'function factory() view returns (address)',
  'function isFactoryLeaderboard(address) view returns (bool)',
  'function isMarkeeOnLeaderboard(address) view returns (bool)',
])
export interface MarkeeMembership { markee: string; board: string }
export const membershipDeps = { client: getModerationClient }

type Client = ReturnType<typeof getModerationClient>
type MembershipCall = { address: Address; abi: typeof ABI; functionName: (typeof ABI)[number]['name']; args?: readonly Address[] }
type ReadResult = { status: 'success' | 'failure'; result?: unknown }
// These selectors take at most one address. 128 subcalls keep the encoded
// aggregate below 64 KiB, without viem's small default batches or parallel fan-out.
const MEMBERSHIP_CHUNK = 128

async function membershipReads(client: Client, contracts: MembershipCall[], blockNumber: bigint): Promise<ReadResult[]> {
  const results: ReadResult[] = []
  for (let start = 0; start < contracts.length; start += MEMBERSHIP_CHUNK) {
    results.push(...await client.multicall({ contracts: contracts.slice(start, start + MEMBERSHIP_CHUNK), blockNumber, batchSize: 0 }) as ReadResult[])
  }
  return results
}

// true = authoritative membership; false = rejected; null = no trustworthy RPC verdict.
// Pin every read to the same block. A claimed factory or pricingStrategy is not identity proof.
export async function trustedMembership(input: MarkeeMembership[], client = membershipDeps.client(), blockNumber?: bigint): Promise<(boolean | null)[]> {
  if (!input.length) return []
  const validPair = (pair: MarkeeMembership) => isAddress(pair.board) && isAddress(pair.markee)
  const pairKey = (pair: MarkeeMembership) => `${pair.board.toLowerCase()}:${pair.markee.toLowerCase()}`
  const pairs = [...new Map(input.filter(validPair).map(pair => [pairKey(pair), pair])).values()]
  if (!pairs.length) return input.map(() => false)
  blockNumber ??= await client.getBlockNumber({ cacheTime: 0 })
  const roots = new Set(Object.values(V13_LEADERBOARDS).map(a => a.toLowerCase()))
  const factories = new Set<string>([
    ...Object.values(FACTORIES), ...Object.values(V14_FACTORIES), '0x37f420fdE5c98e611EB7cb9b74ef579D84697039',
    process.env.NEXT_PUBLIC_STREAMING_FACTORY ?? '',
    process.env.MARKEE_STREAMING_LEADERBOARD_FACTORY_ADDRESS_BASE ?? '',
    ...(process.env.MARKEE_SDK_FACTORIES_8453 ?? '').split(','),
  ].map(a => a.trim().toLowerCase()).filter(a => isAddress(a)))
  const fixedStrategies = new Set(CONTRACTS[8453].fixedPriceStrategies.map(s => s.address.toLowerCase()))
  const boards = [...new Set(pairs.map(p => p.board.toLowerCase()).filter(a => isAddress(a)))]
  const trust = new Map<string, boolean | null>(boards.filter(b => roots.has(b)).map(b => [b, true]))
  const candidates = boards.filter(b => !roots.has(b) && !fixedStrategies.has(b))
  const factoryReads = await membershipReads(client, candidates.map(address => ({ address: address as Address, abi: ABI, functionName: 'factory' as const })), blockNumber)
  const claims: { board: string; factory: Address }[] = []
  candidates.forEach((board, i) => {
    const read = factoryReads[i]
    if (read?.status !== 'success') { trust.set(board, null); return }
    if (typeof read.result !== 'string' || !factories.has(read.result.toLowerCase())) { trust.set(board, false); return }
    claims.push({ board, factory: read.result as Address })
  })
  const recognized = await membershipReads(client, claims.map(p => ({ address: p.factory, abi: ABI, functionName: 'isFactoryLeaderboard' as const, args: [p.board as Address] })), blockNumber)
  claims.forEach((p, i) => trust.set(p.board, recognized[i]?.status === 'success' ? recognized[i].result === true : null))
  const eligible = pairs.map((p, i) => ({ ...p, i })).filter(p => isAddress(p.markee) && trust.get(p.board.toLowerCase()) === true)
  const members = await membershipReads(client, eligible.map(p => ({ address: p.board as Address, abi: ABI, functionName: 'isMarkeeOnLeaderboard' as const, args: [p.markee as Address] })), blockNumber)
  const result = pairs.map(p => !isAddress(p.markee) || !isAddress(p.board) ? false : trust.get(p.board.toLowerCase()) ?? null)
  eligible.forEach((p, i) => { result[p.i] = members[i]?.status === 'success' ? members[i].result === true : null })
  // Only configured standalone strategies are trusted, and only for their actual Markee.
  // The caller has read the Markee's reciprocal pricingStrategy at this same block.
  const fixedPairs = pairs.map((p, i) => ({ ...p, i })).filter(p => isAddress(p.markee) && fixedStrategies.has(p.board.toLowerCase()))
  const fixedBoards = [...new Set(fixedPairs.map(p => p.board.toLowerCase()))]
  const fixedReads = await membershipReads(client, fixedBoards.map(board => ({ address: board as Address, abi: ABI, functionName: 'markeeAddress' as const })), blockNumber)
  const fixedByBoard = new Map(fixedBoards.map((board, i) => [board, fixedReads[i]]))
  fixedPairs.forEach(p => {
    const read = fixedByBoard.get(p.board.toLowerCase())
    result[p.i] = read?.status === 'success' && typeof read.result === 'string' ? read.result.toLowerCase() === p.markee.toLowerCase() : null
  })
  const byPair = new Map(pairs.map((pair, i) => [pairKey(pair), result[i]]))
  return input.map(pair => validPair(pair) ? byPair.get(pairKey(pair)) ?? null : false)
}
