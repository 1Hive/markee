'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { V13_LEADERBOARDS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'
import type { Markee } from '@/types'

export function useMarkees() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isFetchingFresh, setIsFetchingFresh] = useState(false)

  // Step 1: get sorted markee addresses + their fund totals from the v1.1 Coop leaderboard
  const {
    data: topData,
    isLoading: isLoadingTop,
    refetch: refetchTop,
  } = useReadContracts({
    contracts: [{
      address: V13_LEADERBOARDS.COOPERATIVE,
      abi: LeaderboardV11ABI,
      functionName: 'getTopMarkees',
      args: [100n],
      chainId: CANONICAL_CHAIN_ID,
    }],
    query: { refetchInterval: 30_000 },
  })

  const topAddresses: string[] = (topData?.[0]?.result?.[0] as string[]) ?? []
  const topFunds: bigint[] = (topData?.[0]?.result?.[1] as bigint[]) ?? []

  // Step 2: read per-markee fields
  const markeeContracts = topAddresses.flatMap(addr => [
    { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'message' as const, chainId: CANONICAL_CHAIN_ID },
    { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'name' as const, chainId: CANONICAL_CHAIN_ID },
    { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'owner' as const, chainId: CANONICAL_CHAIN_ID },
    { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'pricingStrategy' as const, chainId: CANONICAL_CHAIN_ID },
  ])

  const {
    data: markeeData,
    isLoading: isLoadingMarkees,
    refetch: refetchMarkees,
  } = useReadContracts({
    contracts: markeeContracts,
    query: { enabled: topAddresses.length > 0, refetchInterval: 30_000 },
  })

  // Assemble Markee[] from step 1 + step 2
  const markees: Markee[] = (() => {
    if (!topAddresses.length) return []
    return topAddresses.map((address, i) => {
      const base = i * 4
      const message = (markeeData?.[base]?.result as string) ?? ''
      const name = (markeeData?.[base + 1]?.result as string) ?? ''
      const owner = (markeeData?.[base + 2]?.result as string) ?? ''
      const pricingStrategy = (markeeData?.[base + 3]?.result as string) ?? address
      return {
        address,
        owner,
        message,
        name,
        totalFundsAdded: topFunds[i] ?? 0n,
        pricingStrategy,
        chainId: CANONICAL_CHAIN_ID,
      }
    })
  })()

  useEffect(() => {
    if (markees.length > 0) {
      setLastUpdated(new Date())
      setIsFetchingFresh(false)
    }
  }, [markeeData])

  const refetch = async () => {
    setIsFetchingFresh(true)
    try {
      await refetchTop()
      await refetchMarkees()
    } catch (err) {
      console.error('[useMarkees] refetch error:', err)
    } finally {
      setIsFetchingFresh(false)
    }
  }

  return {
    markees,
    isLoading: isLoadingTop || isLoadingMarkees,
    isFetchingFresh,
    error: topData?.[0]?.error ?? null,
    lastUpdated,
    refetch,
  }
}
