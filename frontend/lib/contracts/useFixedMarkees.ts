'use client'

import { useState, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

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
  },
  {
    inputs: [],
    name: "maxMessageLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const

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
  markeeAddress: string
  message: string
  priceWei: string        // raw wei string — use BigInt() to consume
  maxMessageLength: number
  owner: string
  chainId: number
}

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])
  const [markeeAddresses, setMarkeeAddresses] = useState<(string | null)[]>([])

  const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  // Step 1: Read from FixedPriceStrategy contracts (4 fields each)
  const strategyContracts = fixedStrategies.flatMap((strategy) => [
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'markeeAddress' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'price' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'owner' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: strategy.address,
      abi: FixedPriceStrategyABI,
      functionName: 'maxMessageLength' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
  ])

  const {
    data: strategyData,
    isLoading: isLoadingStrategy,
    refetch: refetchStrategy,
  } = useReadContracts({
    contracts: strategyContracts,
    query: {
      // No refetchInterval — loads once on mount.
      // refetch() is called manually by onSuccess after a purchase.
    }
  })

  // Extract markee addresses for step 2
  useEffect(() => {
    if (!strategyData || !fixedStrategies.length) return
    const addresses = fixedStrategies.map((_, i) => {
      const result = strategyData[i * 4]
      return (result?.result as string) || null
    })
    setMarkeeAddresses(addresses)
  }, [strategyData, fixedStrategies])

  // Step 2: Read message + name from each Markee contract
  const validAddresses = markeeAddresses.filter((addr): addr is string => !!addr)

  const markeeContracts = validAddresses.flatMap((address) => [
    {
      address: address as `0x${string}`,
      abi: MarkeeABI,
      functionName: 'message' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: address as `0x${string}`,
      abi: MarkeeABI,
      functionName: 'name' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
  ])

  const {
    data: markeeData,
    isLoading: isLoadingMarkee,
  } = useReadContracts({
    contracts: markeeContracts,
    query: {
      enabled: validAddresses.length > 0,
      // No refetchInterval — loads once on mount.
    }
  })

  // Step 3: Combine all data
  useEffect(() => {
    if (!strategyData || !fixedStrategies.length) return

    const result: FixedMarkee[] = fixedStrategies.map((strategyConfig, i) => {
      const base = i * 4

      const markeeAddr      = (strategyData[base]?.result as string)     || ''
      const priceWei        = strategyData[base + 1]?.result
                                ? String(strategyData[base + 1].result as bigint)
                                : '0'
      const owner           = (strategyData[base + 2]?.result as string) || ''
      const maxMessageLength = strategyData[base + 3]?.result
                                ? Number(strategyData[base + 3].result as bigint)
                                : 280

      let message = ''
      let markeeName = ''

      if (markeeAddr && markeeData) {
        const markeeIndex = validAddresses.indexOf(markeeAddr)
        if (markeeIndex >= 0) {
          const mBase = markeeIndex * 2
          message    = (markeeData[mBase]?.result     as string) || ''
          markeeName = (markeeData[mBase + 1]?.result as string) || ''
        }
      }

      return {
        name: markeeName || strategyConfig.name,
        strategyAddress: strategyConfig.address,
        markeeAddress: markeeAddr,
        message,
        priceWei,
        maxMessageLength,
        owner,
        chainId: CANONICAL_CHAIN_ID,
      }
    })

    setMarkees(result)
  }, [strategyData, markeeData, fixedStrategies, validAddresses])

  const isLoading = isLoadingStrategy || isLoadingMarkee

  return { markees, isLoading, refetch: refetchStrategy }
}
