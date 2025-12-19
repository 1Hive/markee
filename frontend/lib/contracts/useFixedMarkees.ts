'use client'

import { useReadContract } from 'wagmi'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

export type FixedMarkee = {
  name: string
  strategyAddress: string
  message: string | null
  price: bigint | null
  chainId: number
}

export function useFixedMarkees() {
  // Get all FixedPrice strategies from canonical chain (Base)
  const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []
  
  // Call all hooks at the top level (not in a loop)
  // Strategy 1
  const { data: message1 } = useReadContract({
    address: fixedStrategies[0]?.address as `0x${string}` | undefined,
    abi: FixedPriceStrategyABI,
    functionName: 'markeeAddress',
    chainId: CANONICAL_CHAIN_ID,
  })

  const { data: price1 } = useReadContract({
    address: fixedStrategies[0]?.address as `0x${string}` | undefined,
    abi: FixedPriceStrategyABI,
    functionName: 'price',
    chainId: CANONICAL_CHAIN_ID,
  })

  // Strategy 2
  const { data: message2 } = useReadContract({
    address: fixedStrategies[1]?.address as `0x${string}` | undefined,
    abi: FixedPriceStrategyABI,
    functionName: 'markeeAddress',
    chainId: CANONICAL_CHAIN_ID,
  })

  const { data: price2 } = useReadContract({
    address: fixedStrategies[1]?.address as `0x${string}` | undefined,
    abi: FixedPriceStrategyABI,
    functionName: 'price',
    chainId: CANONICAL_CHAIN_ID,
  })

  // Strategy 3
  const { data: message3 } = useReadContract({
    address: fixedStrategies[2]?.address as `0x${string}` | undefined,
    abi: FixedPriceStrategyABI,
    functionName: 'markeeAddress',
    chainId: CANONICAL_CHAIN_ID,
  })

  const { data: price3 } = useReadContract({
    address: fixedStrategies[2]?.address as `0x${string}` | undefined,
    abi: FixedPriceStrategyABI,
    functionName: 'price',
    chainId: CANONICAL_CHAIN_ID,
  })

  // Build markees array
  const markees: FixedMarkee[] = []

  if (fixedStrategies[0]) {
    markees.push({
      name: fixedStrategies[0].name,
      strategyAddress: fixedStrategies[0].address,
      message: message1 as string | null,
      price: price1 as bigint | null,
      chainId: CANONICAL_CHAIN_ID,
    })
  }

  if (fixedStrategies[1]) {
    markees.push({
      name: fixedStrategies[1].name,
      strategyAddress: fixedStrategies[1].address,
      message: message2 as string | null,
      price: price2 as bigint | null,
      chainId: CANONICAL_CHAIN_ID,
    })
  }

  if (fixedStrategies[2]) {
    markees.push({
      name: fixedStrategies[2].name,
      strategyAddress: fixedStrategies[2].address,
      message: message3 as string | null,
      price: price3 as bigint | null,
      chainId: CANONICAL_CHAIN_ID,
    })
  }

  return {
    markees,
    isLoading: !message1 && !message2 && !message3,
  }
}
