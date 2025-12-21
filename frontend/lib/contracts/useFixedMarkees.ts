'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatEther } from 'viem'

// FixedPriceStrategy ABI - only the functions we need
const FixedPriceStrategyABI = [
  {
    inputs: [],
    name: "markeeAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "price",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const

// Markee ABI - only the functions we need
const MarkeeABI = [
  {
    inputs: [],
    name: "message",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  }
] as const

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
  const [markeeAddresses, setMarkeeAddresses] = useState<(string | null)[]>([])

  const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  // Step 1: Read from FixedPriceStrategy contracts
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

  const { 
    data: strategyData, 
    isLoading: isLoadingStrategy, 
    refetch: refetchStrategy 
  } = useReadContracts({ 
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
    })

    setMarkeeAddresses(addresses)
  }, [strategyData, fixedStrategies])

  // Step 2: Read from Markee contracts (only for valid addresses)
  const validAddresses = markeeAddresses.filter((addr): addr is string => !!addr)
  
  const markeeContracts = validAddresses.flatMap((address) => [
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

  const { 
    data: markeeData, 
    isLoading: isLoadingMarkee 
  } = useReadContracts({ 
    contracts: markeeContracts,
    query: {
      enabled: validAddresses.length > 0,
      refetchInterval: 10000, // Poll every 10 seconds
    }
  })

  // Step 3: Combine all data
  useEffect(() => {
    if (!strategyData || !fixedStrategies.length) return

    const result: FixedMarkee[] = fixedStrategies.map((strategyConfig, i) => {
      const strategyBase = i * 3

      // From FixedPriceStrategy
      const markeeAddressResult = strategyData[strategyBase]
      const priceResult = strategyData[strategyBase + 1]
      const ownerResult = strategyData[strategyBase + 2]
      
      const markeeAddr = markeeAddressResult?.result as string
      
      // Find this markee's data in the markeeData array
      let messageText = ''
      let nameText = ''
      
      if (markeeAddr && markeeData) {
        const markeeIndex = validAddresses.indexOf(markeeAddr)
        if (markeeIndex >= 0) {
          const markeeBase = markeeIndex * 2
          const messageResult = markeeData[markeeBase]
          const nameResult = markeeData[markeeBase + 1]
          messageText = (messageResult?.result as string) || ''
          nameText = (nameResult?.result as string) || ''
        }
      }

      return {
        name: strategyConfig.name,
        strategyAddress: strategyConfig.address,
        message: messageText,
        price: priceResult?.result
          ? formatEther(priceResult.result as bigint)
          : '0',
        owner: (ownerResult?.result as string) || '',
        chainId: CANONICAL_CHAIN_ID,
      }
    })

    setMarkees(result)
  }, [strategyData, markeeData, fixedStrategies, validAddresses])

  const isLoading = isLoadingStrategy || isLoadingMarkee
  const refetch = () => {
    refetchStrategy()
  }

  return { markees, isLoading, refetch }
}
