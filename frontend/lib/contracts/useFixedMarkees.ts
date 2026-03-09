'use client'

import { useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { FixedPriceStrategyABI, MarkeeABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

export type FixedMarkee = {
  name: string
  strategyAddress: string
  message: string
  price: string
  owner: string
  chainId: number
}

const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies ?? []

export function useFixedMarkees() {
  // ── Phase 1: markeeAddress + price + owner from each strategy (one multicall)
  const phase1Contracts = fixedStrategies.flatMap((s) => [
    {
      address: s.address as `0x${string}`,
      abi: FixedPriceStrategyABI,
      functionName: 'markeeAddress' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: s.address as `0x${string}`,
      abi: FixedPriceStrategyABI,
      functionName: 'price' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
    {
      address: s.address as `0x${string}`,
      abi: FixedPriceStrategyABI,
      functionName: 'owner' as const,
      chainId: CANONICAL_CHAIN_ID,
    },
  ])

  const { data: phase1Data, isLoading: isLoadingPhase1 } = useReadContracts({
    contracts: phase1Contracts,
    query: { refetchInterval: 15_000 },
  })

  // Extract markee addresses once phase 1 resolves
  const markeeAddresses: (`0x${string}` | null)[] = phase1Data
    ? fixedStrategies.map((_, i) => (phase1Data[i * 3]?.result as `0x${string}`) ?? null)
    : fixedStrategies.map(() => null)

  const allResolved = markeeAddresses.every(Boolean)

  // ── Phase 2: message from each markee contract (one multicall) ─────────────
  const phase2Contracts = allResolved
    ? markeeAddresses.map((addr) => ({
        address: addr as `0x${string}`,
        abi: MarkeeABI,
        functionName: 'message' as const,
        chainId: CANONICAL_CHAIN_ID,
      }))
    : []

  const { data: phase2Data, isLoading: isLoadingPhase2 } = useReadContracts({
    contracts: phase2Contracts,
    query: {
      enabled: allResolved,
      refetchInterval: 15_000,
    },
  })

  // ── Build result ───────────────────────────────────────────────────────────
  const markees: FixedMarkee[] = phase2Data
    ? fixedStrategies.map((s, i) => {
        const priceRaw = phase1Data?.[i * 3 + 1]?.result as bigint | undefined
        const owner = (phase1Data?.[i * 3 + 2]?.result as string) ?? ''
        const message = (phase2Data[i]?.result as string) ?? ''
        return {
          name: s.name,
          strategyAddress: s.address,
          message,
          price: priceRaw ? formatEther(priceRaw) : '0',
          owner,
          chainId: CANONICAL_CHAIN_ID,
        }
      })
    : []

  return {
    markees,
    isLoading: isLoadingPhase1 || isLoadingPhase2,
  }
}
