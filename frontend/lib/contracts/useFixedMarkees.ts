'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatEther } from 'viem'

export type FixedMarkee = {
  name: string
  strategyAddress: string
  message: string | null
  price: string | null
  chainId: number
}

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])

  const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  // Build contracts array for batch reading
  const contracts = fixedStrategies.flatMap(strategy => [
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'currentMessage',
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'currentName',
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'price',
      chainId: CANONICAL_CHAIN_ID,
    },
  ])

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
  })

  useEffect(() => {
    if (data && fixedStrategies.length > 0) {
      const transformed: FixedMarkee[] = fixedStrategies.map((strategy, index) => {
        const baseIndex = index * 3
        const messageResult = data[baseIndex]
        const nameResult = data[baseIndex + 1]
        const priceResult = data[baseIndex + 2]

        return {
          name: strategy.name,
          strategyAddress: strategy.address,
          message: messageResult?.result as string || '',
          price: priceResult?.result ? formatEther(priceResult.result as bigint) : null,
          chainId: CANONICAL_CHAIN_ID,
        }
      })

      setMarkees(transformed)
    }
  }, [data, fixedStrategies])

  return {
    markees,
    isLoading,
    refetch,
  }
}
