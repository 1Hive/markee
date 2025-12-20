'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatEther } from 'viem'

export type FixedMarkee = {
  name: string
  strategyAddress: string
  message: string
  price: string
  owner: string
  chainId: number
}

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])

  const fixedStrategies =
    CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  // ==== 4 reads per contract ====
  const contracts = fixedStrategies.flatMap((strategy) => [
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
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'owner',
      chainId: CANONICAL_CHAIN_ID,
    },
  ])

  const { data, isLoading, refetch } = useReadContracts({ contracts })

  useEffect(() => {
    if (!data || !fixedStrategies.length) return

    const result: FixedMarkee[] = fixedStrategies.map((strategy, i) => {
      const base = i * 4
      const messageResult = data[base]
      const nameResult = data[base + 1]
      const priceResult = data[base + 2]
      const ownerResult = data[base + 3]

      return {
        name: strategy.name,
        strategyAddress: strategy.address,
        message: (messageResult?.result as string) || '',
        price: priceResult?.result
          ? formatEther(priceResult.result as bigint)
          : '0',
        owner: (ownerResult?.result as string) || '',
        chainId: CANONICAL_CHAIN_ID,
      }
    })

    setMarkees(result)
  }, [data, fixedStrategies])

  return { markees, isLoading, refetch }
}
