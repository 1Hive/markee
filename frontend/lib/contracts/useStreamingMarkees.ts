'use client'

import { useCallback, useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'

// A Markee on a streaming board, ranked by its effective rate (wei/sec): the on-chain
// max(live aggregate stream rate, decaying grandfather floor) that getTopMarkees sorts by.
export interface StreamingMarkee {
  address: Address
  message: string
  name: string
  owner: string
  rate: bigint
}

export interface StreamingBoardMeta {
  name?: string
  version?: string
  admin?: Address
  beneficiary?: Address
  minimumMonthlyRate?: bigint
  totalLegacyFunds?: bigint
  markeeCount?: bigint
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

// Reads a StreamingLeaderboard board and returns its Markees ranked by effectiveRate.
// getTopMarkees already returns (addresses, rates) in descending-rate order; we only zip in
// each Markee's message/name/owner and drop zero-rate entries (the genesis seed Markee and any
// natively-created Markee with no stream and no grandfather floor).
export function useStreamingMarkees(board?: Address, limit = 100) {
  const enabled = !!board

  const metaContracts = useMemo(
    () => (board
      ? [
          ...META_FUNCTIONS.map(functionName => ({
            address: board, abi: StreamingLeaderboardABI, functionName, chainId: CANONICAL_CHAIN_ID,
          })),
          { address: board, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const, args: [BigInt(limit)] as const, chainId: CANONICAL_CHAIN_ID },
        ]
      : []),
    [board, limit]
  )

  const { data: metaData, isLoading: isMetaLoading, refetch: refetchMeta } = useReadContracts({
    contracts: metaContracts,
    query: { enabled, refetchInterval: 30_000 },
  })

  const meta: StreamingBoardMeta = {
    name: metaData?.[0]?.result as string | undefined,
    version: metaData?.[1]?.result as string | undefined,
    admin: metaData?.[2]?.result as Address | undefined,
    beneficiary: metaData?.[3]?.result as Address | undefined,
    minimumMonthlyRate: metaData?.[4]?.result as bigint | undefined,
    totalLegacyFunds: metaData?.[5]?.result as bigint | undefined,
    markeeCount: metaData?.[6]?.result as bigint | undefined,
  }

  const topResult = metaData?.[META_FUNCTIONS.length]?.result as [Address[], bigint[]] | undefined
  const topAddresses = useMemo(() => topResult?.[0] ?? [], [topResult])
  const topRates = useMemo(() => topResult?.[1] ?? [], [topResult])

  const markeeContracts = useMemo(
    () => topAddresses.flatMap(addr => [
      { address: addr, abi: MarkeeABI, functionName: 'message' as const, chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: MarkeeABI, functionName: 'name' as const, chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: MarkeeABI, functionName: 'owner' as const, chainId: CANONICAL_CHAIN_ID },
    ]),
    [topAddresses]
  )

  const { data: markeeData, isLoading: isDetailsLoading, refetch: refetchDetails } = useReadContracts({
    contracts: markeeContracts,
    query: { enabled: enabled && topAddresses.length > 0, refetchInterval: 30_000 },
  })

  const markees = useMemo((): StreamingMarkee[] =>
    topAddresses
      .map((address, i) => ({
        address,
        message: (markeeData?.[i * 3]?.result as string) ?? '',
        name: (markeeData?.[i * 3 + 1]?.result as string) ?? '',
        owner: (markeeData?.[i * 3 + 2]?.result as string) ?? '',
        rate: topRates[i] ?? 0n,
      }))
      .filter(m => m.rate > 0n),
    [topAddresses, topRates, markeeData]
  )

  const refetch = useCallback(() => {
    refetchMeta()
    refetchDetails()
  }, [refetchMeta, refetchDetails])

  return {
    meta,
    markees,
    isLoading: isMetaLoading || (topAddresses.length > 0 && isDetailsLoading),
    refetch,
  }
}
