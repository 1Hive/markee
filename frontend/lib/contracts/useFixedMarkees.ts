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
  
  // Call all hooks at the top level (not in a loop)
  // Strategy 1
  const strategy1 = fixedStrategies[0]
  const { data: markeeAddress1, isLoading: isLoadingAddress1 } = useReadContract({
    address: strategy1?.strategyAddress,
    abi: FixedStrategyABI,
    functionName: 'markeeAddress',
    chainId: optimism.id,
    query: {
      enabled: !!strategy1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  const { data: price1, isLoading: isLoadingPrice1 } = useReadContract({
    address: strategy1?.strategyAddress,
    abi: FixedStrategyABI,
    functionName: 'price',
    chainId: optimism.id,
    query: {
      enabled: !!strategy1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  const { data: message1, isLoading: isLoadingMessage1 } = useReadContract({
    address: markeeAddress1 as `0x${string}`,
    abi: MarkeeABI,
    functionName: 'message',
    chainId: optimism.id,
    query: {
      enabled: !!markeeAddress1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  // Strategy 2
  const strategy2 = fixedStrategies[1]
  const { data: markeeAddress2, isLoading: isLoadingAddress2 } = useReadContract({
    address: strategy2?.strategyAddress,
    abi: FixedStrategyABI,
    functionName: 'markeeAddress',
    chainId: optimism.id,
    query: {
      enabled: !!strategy2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  const { data: price2, isLoading: isLoadingPrice2 } = useReadContract({
    address: strategy2?.strategyAddress,
    abi: FixedStrategyABI,
    functionName: 'price',
    chainId: optimism.id,
    query: {
      enabled: !!strategy2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  const { data: message2, isLoading: isLoadingMessage2 } = useReadContract({
    address: markeeAddress2 as `0x${string}`,
    abi: MarkeeABI,
    functionName: 'message',
    chainId: optimism.id,
    query: {
      enabled: !!markeeAddress2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  // Strategy 3
  const strategy3 = fixedStrategies[2]
  const { data: markeeAddress3, isLoading: isLoadingAddress3 } = useReadContract({
    address: strategy3?.strategyAddress,
    abi: FixedStrategyABI,
    functionName: 'markeeAddress',
    chainId: optimism.id,
    query: {
      enabled: !!strategy3,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  const { data: price3, isLoading: isLoadingPrice3 } = useReadContract({
    address: strategy3?.strategyAddress,
    abi: FixedStrategyABI,
    functionName: 'price',
    chainId: optimism.id,
    query: {
      enabled: !!strategy3,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  const { data: message3, isLoading: isLoadingMessage3 } = useReadContract({
    address: markeeAddress3 as `0x${string}`,
    abi: MarkeeABI,
    functionName: 'message',
    chainId: optimism.id,
    query: {
      enabled: !!markeeAddress3,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
    }
  })
  
  // Build the markees array
  const markees: FixedMarkee[] = []
  
  if (strategy1) {
    markees.push({
      name: strategy1.name,
      strategyAddress: strategy1.strategyAddress,
      markeeAddress: markeeAddress1 as string | undefined,
      message: message1 as string | undefined,
      price: price1 as bigint | undefined,
      isLoading: isLoadingAddress1 || isLoadingPrice1 || isLoadingMessage1,
    })
  }
  
  if (strategy2) {
    markees.push({
      name: strategy2.name,
      strategyAddress: strategy2.strategyAddress,
      markeeAddress: markeeAddress2 as string | undefined,
      message: message2 as string | undefined,
      price: price2 as bigint | undefined,
      isLoading: isLoadingAddress2 || isLoadingPrice2 || isLoadingMessage2,
    })
  }
  
  if (strategy3) {
    markees.push({
      name: strategy3.name,
      strategyAddress: strategy3.strategyAddress,
      markeeAddress: markeeAddress3 as string | undefined,
      message: message3 as string | undefined,
      price: price3 as bigint | undefined,
      isLoading: isLoadingAddress3 || isLoadingPrice3 || isLoadingMessage3,
    })
  }
  
  const isLoading = markees.some(m => m.isLoading)
  
  return { markees, isLoading }
}
