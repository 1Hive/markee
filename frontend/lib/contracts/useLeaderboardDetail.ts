'use client'

import { useReadContracts } from 'wagmi'
import { useMemo } from 'react'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'

export interface LeaderboardMeta {
  address: string
  leaderboardName: string
  totalLeaderboardFunds: bigint
  markeeCount: bigint
  minimumPrice: bigint
  admin: string
  beneficiaryAddress: string
}

export interface LeaderboardMarkee {
  address: string
  message: string
  name: string
  owner: string
  pricingStrategy: string
  totalFundsAdded: bigint
}

export function useLeaderboardDetail(leaderboardAddress: string | undefined) {
  const addr = (leaderboardAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`
  const enabled = !!leaderboardAddress && leaderboardAddress.length === 42

  // Step 1: leaderboard metadata
  const { data: metaData, isLoading: metaLoading, error: metaError } = useReadContracts({
    contracts: [
      { address: addr, abi: LeaderboardV11ABI, functionName: 'leaderboardName',        chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'totalLeaderboardFunds',  chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'markeeCount',            chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'minimumPrice',           chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'admin',                  chainId: CANONICAL_CHAIN_ID },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'beneficiaryAddress',     chainId: CANONICAL_CHAIN_ID },
    ],
    query: { enabled },
  })

  // Step 2: ordered markee list
  const { data: topData, isLoading: topLoading } = useReadContracts({
    contracts: [{
      address: addr, abi: LeaderboardV11ABI, functionName: 'getTopMarkees',
      args: [100n], chainId: CANONICAL_CHAIN_ID,
    }],
    query: { enabled },
  })

  const topAddresses: string[] = (topData?.[0]?.result?.[0] as string[]) ?? []
  const topFunds: bigint[]     = (topData?.[0]?.result?.[1] as bigint[]) ?? []

  // Step 3: per-markee fields
  const markeeContracts = useMemo(() => topAddresses.flatMap(a => [
    { address: a as `0x${string}`, abi: MarkeeABI, functionName: 'message'        as const, chainId: CANONICAL_CHAIN_ID },
    { address: a as `0x${string}`, abi: MarkeeABI, functionName: 'name'           as const, chainId: CANONICAL_CHAIN_ID },
    { address: a as `0x${string}`, abi: MarkeeABI, functionName: 'owner'          as const, chainId: CANONICAL_CHAIN_ID },
    { address: a as `0x${string}`, abi: MarkeeABI, functionName: 'pricingStrategy'as const, chainId: CANONICAL_CHAIN_ID },
  ]), [topAddresses.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const { data: markeeData, isLoading: markeesLoading } = useReadContracts({
    contracts: markeeContracts,
    query: { enabled: topAddresses.length > 0 },
  })

  const meta: LeaderboardMeta | null = metaData && !metaError ? {
    address: addr,
    leaderboardName:       (metaData[0]?.result as string)  ?? '',
    totalLeaderboardFunds: (metaData[1]?.result as bigint)  ?? 0n,
    markeeCount:           (metaData[2]?.result as bigint)  ?? 0n,
    minimumPrice:          (metaData[3]?.result as bigint)  ?? 0n,
    admin:                 (metaData[4]?.result as string)  ?? '',
    beneficiaryAddress:    (metaData[5]?.result as string)  ?? '',
  } : null

  const markees: LeaderboardMarkee[] = useMemo(() => {
    if (!topAddresses.length) return []
    return topAddresses.map((address, i) => {
      const b = i * 4
      return {
        address,
        message:        (markeeData?.[b]?.result     as string) ?? '',
        name:           (markeeData?.[b + 1]?.result as string) ?? '',
        owner:          (markeeData?.[b + 2]?.result as string) ?? '',
        pricingStrategy:(markeeData?.[b + 3]?.result as string) ?? addr,
        totalFundsAdded: topFunds[i] ?? 0n,
      }
    })
  }, [topAddresses.join(','), markeeData, topFunds.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    meta,
    markees,
    isLoading: metaLoading || topLoading || markeesLoading,
    error: metaError ?? null,
  }
}
