'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { FixedPriceStrategyABI, MarkeeABI } from '@/lib/contracts/abis'
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
  const [markeeAddresses, setMarkeeAddresses] = useState<string[]>([])

  const fixedStrategies =
    CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  // Step 1: Read strategy data including markeeAddress
  const strategyContracts = fixedStrategies.flatMap((strategy) => [
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'markeeAddress',
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

  const { data: strategyData, isLoading: isLoadingStrategy, refetch: refetchStrategy } = useReadContracts({ 
    contracts: strategyContracts,
    query: {
      refetchInterval: 10000, // Poll every 10 seconds
    }
  })

  // Extract markee addresses from strategy data
  useEffect(() => {
    if (!strategyData || !fixedStrategies.length) return

    const addresses = fixedStrategies.map((_, i) => {
      const base = i * 3
      const markeeAddressResult = strategyData[base]
      return (markeeAddressResult?.result as string) || null
    }).filter(Boolean) as string[]

    setMarkeeAddresses(addresses)
  }, [strategyData, fixedStrategies])

  // Step 2: Read message and name from Markee contracts
  const markeeContracts = markeeAddresses.flatMap((address) => [
    {
      address: address as `0x${string}`,
      abi: MarkeeABI,
      functionName: 'message',
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: address as `0x${string}`,
      abi: MarkeeABI,
      functionName: 'name',
      chainId: CANONICAL_CHAIN_ID,
    },
  ])

  const { data: markeeData, isLoading: isLoadingMarkee } = useReadContracts({ 
    contracts: markeeContracts,
    query: {
      enabled: markeeAddresses.length > 0,
      refetchInterval: 10000, // Poll every 10 seconds
    }
  })

  // Combine all data
  useEffect(() => {
    if (!strategyData || !markeeData || !fixedStrategies.length) return

    const result: FixedMarkee[] = fixedStrategies.map((strategyConfig, i) => {
      const strategyBase = i * 3
      const markeeBase = i * 2

      const priceResult = strategyData[strategyBase + 1]
      const ownerResult = strategyData[strategyBase + 2]
      
      const messageResult = markeeData[markeeBase]
      const nameResult = markeeData[markeeBase + 1]

      return {
        name: strategyConfig.name,
        strategyAddress: strategyConfig.address,
        message: (messageResult?.result as string) || '',
        price: priceResult?.result
          ? formatEther(priceResult.result as bigint)
          : '0',
        owner: (ownerResult?.result as string) || '',
        chainId: CANONICAL_CHAIN_ID,
      }
    })

    setMarkees(result)
  }, [strategyData, markeeData, fixedStrategies])

  const isLoading = isLoadingStrategy || isLoadingMarkee
  const refetch = () => {
    refetchStrategy()
  }

  return { markees, isLoading, refetch }
}
