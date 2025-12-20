'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { MarkeeABI, FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatEther } from 'viem'

export type FixedMarkee = {
  markeeAddress: string
  strategyAddress: string
  name: string
  message: string
  price: string | null
  totalFundsAdded: string
  chainId: number
}

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])

  const fixedStrategies =
    CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  // ---- Build batched contract calls ----

  const contracts = fixedStrategies.flatMap((strategy) => {
    return [
      {
        address: strategy.markeeAddress as `0x${string}`,
        abi: MarkeeABI,
        functionName: 'message',
        chainId: CANONICAL_CHAIN_ID,
      },
      {
        address: strategy.markeeAddress as `0x${string}`,
        abi: MarkeeABI,
        functionName: 'name',
        chainId: CANONICAL_CHAIN_ID,
      },
      {
        address: strategy.markeeAddress as `0x${string}`,
        abi: MarkeeABI,
        functionName: 'totalFundsAdded',
        chainId: CANONICAL_CHAIN_ID,
      },
      {
        address: strategy.address as `0x${string}`,
        abi: FixedPriceStrategyABI,
        functionName: 'price',
        chainId: CANONICAL_CHAIN_ID,
      },
    ]
  })

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    allowFailure: true,
  })

  useEffect(() => {
    if (!data || fixedStrategies.length === 0) return

    const result: FixedMarkee[] = fixedStrategies.map((strategy, index) => {
      const base = index * 4

      const messageResult = data[base]
      const nameResult = data[base + 1]
      const totalFundsResult = data[base + 2]
      const priceResult = data[base + 3]

      return {
        markeeAddress: strategy.markeeAddress,
        strategyAddress: strategy.address,
        name: (nameResult?.result as string) || '',
        message: (messageResult?.result as string) || '',
        totalFundsAdded: totalFundsResult?.result
          ? formatEther(totalFundsResult.result as bigint)
          : '0',
        price: priceResult?.result
          ? formatEther(priceResult.result as bigint)
          : null,
        chainId: CANONICAL_CHAIN_ID,
      }
    })

    setMarkees(result)
  }, [data, fixedStrategies])

  return {
    markees,
    isLoading,
    refetch,
  }
}
