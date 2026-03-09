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
  // ── Phase 1: markeeAddress + price + owner ────────────────────────────────
  // No chainId here — lets wagmi use your configured transport (Alchemy etc.)
  // instead of falling back to the public mainnet.base.org RPC.
  // No refetchInterval — these values never change after deploy.
  const phase1Contracts = fixedStrategies.flatMap((s) => [
    {
      address: s.address as `0x${string}`,
      abi: FixedPriceStrategyABI,
      functionName: 'markeeAddress' as const,
    },
    {
      address: s.address as `0x${string}`,
      abi: FixedPriceStrategyABI,
      functionName: 'price' as const,
    },
    {
      address: s.address as `0x${string}`,
      abi: FixedPriceStrategyABI,
      functionName: 'owner' as const,
    },
  ])

  const { data: phase1Data, isLoading: isLoadingPhase1 } = useReadContracts({
    contracts: phase1Contracts,
    // staleTime: Infinity means it fetches once and never re-fetches automatically.
    // markeeAddress/price/owner don't change after contract deploy.
    query: { staleTime: Infinity },
  })

  const markeeAddresses: (`0x${string}` | null)[] = phase1Data
    ? fixedStrategies.map((_, i) => (phase1Data[i * 3]?.result as `0x${string}`) ?? null)
    : fixedStrategies.map(() => null)

  const allResolved = markeeAddresses.every(Boolean)

  // ── Phase 2: message from each markee contract ────────────────────────────
  // Messages DO change, so we refetch — but at a reasonable interval.
  // No chainId here either, for the same reason.
  const phase2Contracts = allResolved
    ? markeeAddresses.map((addr) => ({
        address: addr as `0x${string}`,
        abi: MarkeeABI,
        functionName: 'message' as const,
      }))
    : []

  const { data: phase2Data } = useReadContracts({
    contracts: phase2Contracts,
    query: {
      enabled: allResolved,
      refetchInterval: 60_000, // once per minute is plenty for messages
    },
  })

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
    isLoading: isLoadingPhase1 || !phase2Data,
  }
}
