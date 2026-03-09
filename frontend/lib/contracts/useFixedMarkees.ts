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

// Helper: safely extract result from a multicall entry.
// Assigning to a named variable is required for TS to narrow the union.
function getResult<T>(entry: { status: string; result?: unknown; error?: unknown } | undefined): T | undefined {
  if (!entry || entry.status !== 'success') return undefined
  return entry.result as T
}

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
        return getResult<`0x${string}`>(strategyResults[i * 4]) ?? null
      })

      // ── Pass 2: read message + name from each Markee contract ───────────────
      // 2 calls × 3 markees = 6 calls, batched into ONE multicall request
      const validMarkeeAddresses = markeeAddresses.filter((a): a is `0x${string}` => !!a)

      type MarkeeMulticallResult = Awaited<ReturnType<typeof publicClient.multicall>>
      let markeeResults: MarkeeMulticallResult = []

      if (validMarkeeAddresses.length > 0) {
        const markeeContracts = validMarkeeAddresses.flatMap((addr) => [
          { address: addr, abi: MARKEE_ABI, functionName: 'message' as const },
          { address: addr, abi: MARKEE_ABI, functionName: 'name' as const },
        ])
        markeeResults = await publicClient.multicall({ contracts: markeeContracts, allowFailure: true })
      }

      // ── Merge results ───────────────────────────────────────────────────────
      const ordered: FixedMarkee[] = fixedStrategies.map((strategyConfig, i) => {
        const b = i * 4

        const markeeAddr = getResult<`0x${string}`>(strategyResults[b]) ?? ''
        const priceWei   = getResult<bigint>(strategyResults[b + 1]) != null
          ? String(getResult<bigint>(strategyResults[b + 1]))
          : '0'
        const owner      = getResult<string>(strategyResults[b + 2]) ?? ''
        const maxMsgLen  = getResult<bigint>(strategyResults[b + 3])
        const maxMessageLength = maxMsgLen != null ? Number(maxMsgLen) : 280

        let message = ''
        let markeeName = ''

        if (markeeAddr) {
          const markeeIndex = validMarkeeAddresses.indexOf(markeeAddr)
          if (markeeIndex >= 0) {
            const mBase = markeeIndex * 2
            message    = getResult<string>(markeeResults[mBase])     ?? ''
            markeeName = getResult<string>(markeeResults[mBase + 1]) ?? ''
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
    // No polling — data loads once on mount.
    // refetch() is called manually by onSuccess after a purchase.
  }, [fetchMarkees])

  return { markees, isLoading, error, refetch: fetchMarkees }
}
