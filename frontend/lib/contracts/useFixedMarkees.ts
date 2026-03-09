'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPublicClient, http } from 'viem'
import { base } from 'wagmi/chains'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

const STRATEGY_ABI = [
  {
    inputs: [],
    name: 'markeeAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'price',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxMessageLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  {
    inputs: [],
    name: 'message',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export type FixedMarkee = {
  name: string
  strategyAddress: string
  markeeAddress: string
  message: string
  priceWei: string        // raw wei string — use BigInt() to consume, never parseEther/formatEther round-trip
  maxMessageLength: number
  owner: string
  chainId: number
}

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  const fetchMarkees = useCallback(async () => {
    if (!fixedStrategies.length) {
      setIsLoading(false)
      return
    }

    try {
      // ── Pass 1: read all 4 fields from each FixedPriceStrategy ─────────────
      // 4 calls × 3 strategies = 12 calls, batched into ONE multicall request
      const strategyContracts = fixedStrategies.flatMap((s) => [
        { address: s.address as `0x${string}`, abi: STRATEGY_ABI, functionName: 'markeeAddress' as const },
        { address: s.address as `0x${string}`, abi: STRATEGY_ABI, functionName: 'price' as const },
        { address: s.address as `0x${string}`, abi: STRATEGY_ABI, functionName: 'owner' as const },
        { address: s.address as `0x${string}`, abi: STRATEGY_ABI, functionName: 'maxMessageLength' as const },
      ])

      const strategyResults = await publicClient.multicall({ contracts: strategyContracts, allowFailure: true })

      // Extract markee addresses for pass 2
      const markeeAddresses: (`0x${string}` | null)[] = fixedStrategies.map((_, i) => {
        const r = strategyResults[i * 4]
        return r?.status === 'success' ? (r.result as `0x${string}`) : null
      })

      // ── Pass 2: read message + name from each Markee contract ───────────────
      // 2 calls × 3 markees = 6 calls, batched into ONE multicall request
      const validMarkeeAddresses = markeeAddresses.filter((a): a is `0x${string}` => !!a)

      let markeeResults: Awaited<ReturnType<typeof publicClient.multicall>> = []
      if (validMarkeeAddresses.length > 0) {
        const markeeContracts = validMarkeeAddresses.flatMap((addr) => [
          { address: addr, abi: MARKEE_ABI, functionName: 'message' as const },
          { address: addr, abi: MARKEE_ABI, functionName: 'name' as const },
        ])
        markeeResults = await publicClient.multicall({ contracts: markeeContracts, allowFailure: true })
      }

      // ── Merge results ───────────────────────────────────────────────────────
      const ordered: FixedMarkee[] = fixedStrategies.map((strategyConfig, i) => {
        const base = i * 4
        const markeeAddr = strategyResults[base]?.status === 'success'
          ? (strategyResults[base].result as `0x${string}`)
          : ''
        const priceWei = strategyResults[base + 1]?.status === 'success'
          ? String(strategyResults[base + 1].result as bigint)
          : '0'
        const owner = strategyResults[base + 2]?.status === 'success'
          ? (strategyResults[base + 2].result as string)
          : ''
        const maxMessageLength = strategyResults[base + 3]?.status === 'success'
          ? Number(strategyResults[base + 3].result as bigint)
          : 280

        let message = ''
        let markeeName = ''
        if (markeeAddr) {
          const markeeIndex = validMarkeeAddresses.indexOf(markeeAddr as `0x${string}`)
          if (markeeIndex >= 0) {
            const mBase = markeeIndex * 2
            message = markeeResults[mBase]?.status === 'success'
              ? (markeeResults[mBase].result as string)
              : ''
            markeeName = markeeResults[mBase + 1]?.status === 'success'
              ? (markeeResults[mBase + 1].result as string)
              : ''
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

      setMarkees(ordered)
      setError(null)
    } catch (err) {
      console.error('useFixedMarkees: multicall failed', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [fixedStrategies])

  useEffect(() => {
    fetchMarkees()
    // 2 multicall requests per 30s — nowhere near rate limit territory
    const interval = setInterval(fetchMarkees, 30_000)
    return () => clearInterval(interval)
  }, [fetchMarkees])

  return { markees, isLoading, error, refetch: fetchMarkees }
}
