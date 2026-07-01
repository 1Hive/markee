'use client'

import { useCallback, useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { CANONICAL_CHAIN_ID, STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'

export interface StreamingBoardSummary {
  address: Address
  name: string
  topMessage: string
  topRate: bigint
}

const FACTORY_REGISTRY_ABI = [
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getLeaderboards',
    outputs: [{ name: 'result', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Lists the streaming boards from the factory registry, each with its current #1 message + rate.
// Disabled (returns empty) until NEXT_PUBLIC_STREAMING_FACTORY points at a deployed factory.
export function useStreamingBoards(limit = 100) {
  const { data: registry, isLoading: l1, refetch: refetchRegistry } = useReadContract({
    address: STREAMING_ENABLED ? (STREAMING_FACTORY as Address) : undefined,
    abi: FACTORY_REGISTRY_ABI,
    functionName: 'getLeaderboards',
    args: [0n, BigInt(limit)],
    chainId: CANONICAL_CHAIN_ID,
    query: { enabled: STREAMING_ENABLED, refetchInterval: 30_000 },
  })

  const boards = useMemo(() => (registry as Address[] | undefined) ?? [], [registry])

  const boardContracts = useMemo(
    () => boards.flatMap(b => [
      { address: b, abi: StreamingLeaderboardABI, functionName: 'leaderboardName' as const, chainId: CANONICAL_CHAIN_ID },
      { address: b, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const, args: [1n] as const, chainId: CANONICAL_CHAIN_ID },
    ]),
    [boards]
  )

  const { data: boardData, isLoading: l2, refetch: refetchBoards } = useReadContracts({
    contracts: boardContracts,
    query: { enabled: boards.length > 0, refetchInterval: 30_000 },
  })

  const tops = useMemo(
    () => boards.map((_, i) => {
      const top = boardData?.[i * 2 + 1]?.result as [Address[], bigint[]] | undefined
      return { addr: top?.[0]?.[0], rate: top?.[1]?.[0] ?? 0n }
    }),
    [boards, boardData]
  )

  // Top Markee's message (every initialized board has at least the seed Markee, so addr is defined;
  // fall back to the board address whose message() read simply errors → empty string).
  const msgContracts = useMemo(
    () => boards.map((b, i) => ({
      address: tops[i].addr ?? b,
      abi: MarkeeABI,
      functionName: 'message' as const,
      chainId: CANONICAL_CHAIN_ID,
    })),
    [boards, tops]
  )

  const { data: msgData, refetch: refetchMsgs } = useReadContracts({
    contracts: msgContracts,
    query: { enabled: boards.length > 0, refetchInterval: 30_000 },
  })

  const summaries = useMemo((): StreamingBoardSummary[] =>
    boards.map((address, i) => ({
      address,
      name: (boardData?.[i * 2]?.result as string) ?? '',
      topMessage: tops[i].rate > 0n ? ((msgData?.[i]?.result as string) ?? '') : '',
      topRate: tops[i].rate,
    })),
    [boards, boardData, tops, msgData]
  )

  const refetch = useCallback(() => {
    refetchRegistry()
    refetchBoards()
    refetchMsgs()
  }, [refetchRegistry, refetchBoards, refetchMsgs])

  return {
    boards: summaries,
    enabled: STREAMING_ENABLED,
    isLoading: STREAMING_ENABLED && (l1 || (boards.length > 0 && l2)),
    refetch,
  }
}
