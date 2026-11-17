import type { Address } from 'viem'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { createStreamingClient } from '@/lib/streaming/client'

// The same reads useStreamingMarkees used to make from every visitor's browser, done once on the
// server and shared through /api/streaming/board. Amounts are decimal strings (JSON has no bigint).
export interface StreamingBoardSnapshot {
  meta: {
    name?: string
    version?: string
    admin?: Address
    beneficiary?: Address
    minimumMonthlyRate?: string
    totalLegacyFunds?: string
    markeeCount?: string
  }
  markees: {
    address: Address
    message: string
    name: string
    owner: string
    rate: string
    streamRate: string
    legacyFloor: string
  }[]
}

const META_FUNCTIONS = [
  'leaderboardName',
  'VERSION',
  'admin',
  'beneficiaryAddress',
  'minimumMonthlyRate',
  'totalLeaderboardFunds',
  'markeeCount',
] as const

const text = (value: unknown) => value === undefined || value === null ? undefined : String(value)

export async function loadStreamingBoard(board: Address, limit: number): Promise<StreamingBoardSnapshot> {
  const client = createStreamingClient()
  // Pin both rounds to one block so the ranking and the per-markee details agree.
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const metaResults = await client.multicall({
    blockNumber,
    contracts: [
      ...META_FUNCTIONS.map(functionName => ({ address: board, abi: StreamingLeaderboardABI, functionName })),
      { address: board, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees', args: [BigInt(limit)] },
    ],
  })
  const top = metaResults[META_FUNCTIONS.length]
  if (top.status !== 'success') throw new Error('getTopMarkees failed')
  const [addresses, rates] = top.result as unknown as [Address[], bigint[]]

  const details = addresses.length
    ? await client.multicall({
        blockNumber,
        contracts: addresses.flatMap(address => [
          { address, abi: MarkeeABI, functionName: 'message' },
          { address, abi: MarkeeABI, functionName: 'name' },
          { address, abi: MarkeeABI, functionName: 'owner' },
          { address: board, abi: StreamingLeaderboardABI, functionName: 'aggregateRate', args: [address] },
          { address: board, abi: StreamingLeaderboardABI, functionName: 'currentLegacyFloor', args: [address] },
        ]),
      })
    : []
  const at = (i: number) => details[i]?.status === 'success' ? details[i].result : undefined
  const meta = (i: number) => metaResults[i]?.status === 'success' ? metaResults[i].result : undefined

  return {
    meta: {
      name: text(meta(0)),
      version: text(meta(1)),
      admin: text(meta(2)) as Address | undefined,
      beneficiary: text(meta(3)) as Address | undefined,
      minimumMonthlyRate: text(meta(4)),
      totalLegacyFunds: text(meta(5)),
      markeeCount: text(meta(6)),
    },
    markees: addresses.map((address, i) => ({
      address,
      message: text(at(i * 5)) ?? '',
      name: text(at(i * 5 + 1)) ?? '',
      owner: text(at(i * 5 + 2)) ?? '',
      rate: (rates[i] ?? 0n).toString(),
      streamRate: text(at(i * 5 + 3)) ?? '0',
      legacyFloor: text(at(i * 5 + 4)) ?? '0',
    })),
  }
}
