'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'

// A Markee on a streaming board, ranked by its effective rate (wei/sec): the on-chain
// max(live aggregate stream rate, decaying grandfather floor) that getTopMarkees sorts by.
export interface StreamingMarkee {
  address: Address
  message: string
  name: string
  owner: string
  rate: bigint
  // What the rate is made of: live streams versus the decaying grandfather floor a migrated lump-sum
  // Markee keeps. The board ranks on max(streamRate, legacyFloor), so a Markee whose floor is the
  // larger of the two holds its spot on funds that were paid once and are decaying to nothing.
  streamRate: bigint
  legacyFloor: bigint
}

export interface StreamingBoardMeta {
  name?: string
  version?: string
  admin?: Address
  beneficiary?: Address
  minimumMonthlyRate?: bigint
  totalLegacyFunds?: bigint
  markeeCount?: bigint
}

const CALLS_PER_MARKEE = 5

const META_FUNCTIONS = [
  'leaderboardName',
  'VERSION',
  'admin',
  'beneficiaryAddress',
  'minimumMonthlyRate',
  'totalLeaderboardFunds',
  'markeeCount',
] as const

// Reads a StreamingLeaderboard board and returns its Markees ranked by effectiveRate.
// getTopMarkees already returns (addresses, rates) in descending-rate order; we only zip in
// each Markee's message/name/owner and drop zero-rate entries (the genesis seed Markee and any
// natively-created Markee with no stream and no grandfather floor).
export function useStreamingMarkees(board?: Address, limit = 100) {
  const enabled = !!board

  const metaContracts = useMemo(
    () => (board
      ? [
          ...META_FUNCTIONS.map(functionName => ({
            address: board, abi: StreamingLeaderboardABI, functionName, chainId: CANONICAL_CHAIN_ID,
          })),
          { address: board, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const, args: [BigInt(limit)] as const, chainId: CANONICAL_CHAIN_ID },
        ]
      : []),
    [board, limit]
  )

  const { data: metaData, isLoading: isMetaLoading, refetch: refetchMeta } = useReadContracts({
    contracts: metaContracts,
    query: { enabled, refetchInterval: 30_000 },
  })

  const meta: StreamingBoardMeta = {
    name: metaData?.[0]?.result as string | undefined,
    version: metaData?.[1]?.result as string | undefined,
    admin: metaData?.[2]?.result as Address | undefined,
    beneficiary: metaData?.[3]?.result as Address | undefined,
    minimumMonthlyRate: metaData?.[4]?.result as bigint | undefined,
    totalLegacyFunds: metaData?.[5]?.result as bigint | undefined,
    markeeCount: metaData?.[6]?.result as bigint | undefined,
  }

  const topResult = metaData?.[META_FUNCTIONS.length]?.result as [Address[], bigint[]] | undefined
  const topAddresses = useMemo(() => topResult?.[0] ?? [], [topResult])
  const topRates = useMemo(() => topResult?.[1] ?? [], [topResult])

  const markeeContracts = useMemo(
    () => (board
      ? topAddresses.flatMap(addr => [
          { address: addr, abi: MarkeeABI, functionName: 'message' as const, chainId: CANONICAL_CHAIN_ID },
          { address: addr, abi: MarkeeABI, functionName: 'name' as const, chainId: CANONICAL_CHAIN_ID },
          { address: addr, abi: MarkeeABI, functionName: 'owner' as const, chainId: CANONICAL_CHAIN_ID },
          { address: board, abi: StreamingLeaderboardABI, functionName: 'aggregateRate' as const, args: [addr] as const, chainId: CANONICAL_CHAIN_ID },
          { address: board, abi: StreamingLeaderboardABI, functionName: 'currentLegacyFloor' as const, args: [addr] as const, chainId: CANONICAL_CHAIN_ID },
        ])
      : []),
    [board, topAddresses]
  )

  const { data: markeeData, isLoading: isDetailsLoading, refetch: refetchDetails } = useReadContracts({
    contracts: markeeContracts,
    query: { enabled: enabled && topAddresses.length > 0, refetchInterval: 30_000 },
  })

  // Whether a markee has ever received a single BackerUpdated event (see the /api/streaming/
  // ever-funded route comment) -- createMarkee happens before the stream-opening batchCall, so an
  // abandoned or failed flow leaves a real markee on-chain that never actually got backed, which
  // looks identical to a "lost its bid" message by current state alone. null while loading (nothing
  // extra is shown until this resolves, to avoid a flash of rows that then disappear).
  const [everFunded, setEverFunded] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!board) { setEverFunded(null); return }
    let cancelled = false
    fetch(`/api/streaming/ever-funded?board=${board}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { markees?: string[] } | null) => {
        if (!cancelled && d?.markees) setEverFunded(new Set(d.markees.map(a => a.toLowerCase())))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [board])

  const markees = useMemo((): StreamingMarkee[] =>
    topAddresses
      .map((address, i) => ({
        address,
        message: (markeeData?.[i * CALLS_PER_MARKEE]?.result as string) ?? '',
        name: (markeeData?.[i * CALLS_PER_MARKEE + 1]?.result as string) ?? '',
        owner: (markeeData?.[i * CALLS_PER_MARKEE + 2]?.result as string) ?? '',
        rate: topRates[i] ?? 0n,
        streamRate: (markeeData?.[i * CALLS_PER_MARKEE + 3]?.result as bigint) ?? 0n,
        legacyFloor: (markeeData?.[i * CALLS_PER_MARKEE + 4]?.result as bigint) ?? 0n,
      }))
      // Drops the genesis seed Markee (empty message) and any dead-on-arrival Markee that was
      // created but never actually funded -- both are indistinguishable from a real, currently-idle
      // message by rate/message alone.
      .filter(m => m.rate > 0n || (everFunded?.has(m.address.toLowerCase()) ?? false)),
    [topAddresses, topRates, markeeData, everFunded]
  )

  const refetch = useCallback(() => {
    refetchMeta()
    refetchDetails()
  }, [refetchMeta, refetchDetails])

  return {
    meta,
    markees,
    isLoading: isMetaLoading || (topAddresses.length > 0 && isDetailsLoading),
    refetch,
  }
}
