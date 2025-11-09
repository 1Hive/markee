'use client'

import { useReadContract } from 'wagmi'
import { optimism } from 'wagmi/chains'
import { FixedStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'

export interface FixedMarkee {
  name: string
  strategyAddress: string
  markeeAddress?: string
  message?: string
  price?: bigint
  isLoading: boolean
}

export function useFixedMarkees() {
  const fixedStrategies = CONTRACTS[optimism.id]?.fixedStrategies || []

  // Fetch data for each fixed strategy
  const markees: FixedMarkee[] = fixedStrategies.map((strategy) => {
    // Read markeeAddress from FixedStrategy
    const { data: markeeAddress, isLoading: isLoadingAddress } = useReadContract({
      address: strategy.strategyAddress,
      abi: FixedStrategyABI,
      functionName: 'markeeAddress',
      chainId: optimism.id,
      query: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        staleTime: 1000 * 60 * 5, // 5 min cache
      }
    })

    // Read price from FixedStrategy
    const { data: price, isLoading: isLoadingPrice } = useReadContract({
      address: strategy.strategyAddress,
      abi: FixedStrategyABI,
      functionName: 'price',
      chainId: optimism.id,
      query: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        staleTime: 1000 * 60 * 5, // 5 min cache
      }
    })

    // Read message from Markee (only if we have the address)
    const { data: message, isLoading: isLoadingMessage } = useReadContract({
      address: markeeAddress as `0x${string}`,
      abi: MarkeeABI,
      functionName: 'message',
      chainId: optimism.id,
      query: {
        enabled: !!markeeAddress,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        staleTime: 1000 * 60 * 5, // 5 min cache
      }
    })

    return {
      name: strategy.name,
      strategyAddress: strategy.strategyAddress,
      markeeAddress: markeeAddress as string | undefined,
      message: message as string | undefined,
      price: price as bigint | undefined,
      isLoading: isLoadingAddress || isLoadingPrice || isLoadingMessage,
    }
  })

  const isLoading = markees.some(m => m.isLoading)

  return { markees, isLoading }
}
