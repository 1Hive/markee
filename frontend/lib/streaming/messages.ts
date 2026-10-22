// Server-side reads of a Rent (streaming) board's messages and funding history. Every route that lists
// Rent messages goes through here, with the same rules as the board page (see ./listing.ts).

import { kv } from '@vercel/kv'
import { parseAbiItem, type Address, type PublicClient, type Transport } from 'viem'
import type { base } from 'viem/chains'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { BOARD_MESSAGE_LIMIT, isListedStreamingMarkee } from './listing'

const BACKER_UPDATED = parseAbiItem(
  'event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)'
)
const REORG_SAFETY_BLOCKS = 100n
const MULTICALL_CHUNK = 50

type BaseClient = PublicClient<Transport, typeof base>

// backer -> markees it has ever streamed to, on one board.
export type BackingHistory = Record<string, string[]>

// Who has ever backed which markee on a board. BackerUpdated fires on every change to a backer's flow
// (open, rate change, move, stop), so unlike backerMarkee (cleared when a stream ends) this keeps
// ended streams. It only grows, so it lives permanently in KV with a scanned-to checkpoint and each
// read scans just the blocks since (re-scanning a reorg margin).
export async function getBackingHistory(client: BaseClient, board: string): Promise<BackingHistory> {
  const key = `streaming:backing:${board.toLowerCase()}`
  const stored = await kv.get<{ backers: BackingHistory; scannedTo: string }>(key)
  const fromBlock = stored ? BigInt(stored.scannedTo) + 1n : BASE_MARKEE_EVENTS_FROM_BLOCK
  const latestBlock = await client.getBlockNumber()
  const backers: BackingHistory = { ...(stored?.backers ?? {}) }
  if (latestBlock < fromBlock) return backers

  const logs = await client.getLogs({ address: board as Address, event: BACKER_UPDATED, fromBlock, toBlock: latestBlock })
  for (const log of logs) {
    const backer = log.args.backer?.toLowerCase()
    const markee = log.args.markee?.toLowerCase()
    if (!backer || !markee) continue
    const seen = backers[backer] ?? (backers[backer] = [])
    if (!seen.includes(markee)) seen.push(markee)
  }
  const scannedTo = latestBlock - REORG_SAFETY_BLOCKS
  if (!stored || scannedTo > BigInt(stored.scannedTo)) {
    await kv.set(key, { backers, scannedTo: scannedTo.toString() })
  }
  return backers
}

export function everFundedMarkees(history: BackingHistory): Set<string> {
  return new Set(Object.values(history).flat())
}

export interface BoardMessage {
  address: string
  message: string
  name: string
  owner: string
  // Effective rate (wei/sec) the board ranks on; 0 means the message has no funding left.
  rate: bigint
  // 1-based position in the board's ranking.
  rank: number
}

async function chunkedMulticall(client: BaseClient, contracts: readonly unknown[]) {
  const results: { result?: unknown }[] = []
  for (let i = 0; i < contracts.length; i += MULTICALL_CHUNK) {
    results.push(...await client.multicall({ contracts: contracts.slice(i, i + MULTICALL_CHUNK) as Parameters<typeof client.multicall>[0]['contracts'] }))
  }
  return results
}

// A board's messages in ranking order, exactly as its board page lists them. `only` narrows the list
// first (e.g. to one owner's messages), so the funding history -- a log scan -- is only read when a
// message that's left has no rate and needs it. If that scan fails, unfunded messages are kept rather
// than the whole board's list being lost.
export async function listBoardMessages(
  client: BaseClient,
  board: string,
  { only, history }: { only?: (m: { address: string; owner: string }) => boolean; history?: BackingHistory } = {},
): Promise<BoardMessage[]> {
  const [addresses, rates] = await client.readContract({
    address: board as Address, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees', args: [BigInt(BOARD_MESSAGE_LIMIT)],
  }) as readonly [readonly Address[], readonly bigint[]]
  if (addresses.length === 0) return []
  const owners = await chunkedMulticall(client, addresses.map(address => ({ address, abi: MarkeeABI, functionName: 'owner' })))
  const ranked = addresses.map((address, i) => ({
    address: address.toLowerCase(),
    owner: ((owners[i]?.result as string | undefined) ?? '').toLowerCase(),
    rate: rates[i] ?? 0n,
  }))

  const unfunded = ranked.filter(m => m.rate === 0n && (!only || only(m)))
  let everFunded: Set<string> | null = new Set()
  if (unfunded.length) {
    everFunded = await (history ? Promise.resolve(history) : getBackingHistory(client, board))
      .then(everFundedMarkees)
      .catch(e => { console.warn('[streaming/messages] backing history failed', board, e); return null })
  }
  const listed = ranked
    .filter(m => !everFunded || isListedStreamingMarkee(m.address, m.rate, everFunded))
    .map((m, i) => ({ ...m, rank: i + 1 }))
    .filter(m => !only || only(m))
  if (listed.length === 0) return []

  const text = await chunkedMulticall(client, listed.flatMap(m => [
    { address: m.address as Address, abi: MarkeeABI, functionName: 'message' },
    { address: m.address as Address, abi: MarkeeABI, functionName: 'name' },
  ]))
  return listed.map((m, i) => ({
    ...m,
    message: (text[i * 2]?.result as string | undefined) ?? '',
    name: (text[i * 2 + 1]?.result as string | undefined) ?? '',
  }))
}
