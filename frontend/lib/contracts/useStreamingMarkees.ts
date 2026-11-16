'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { StreamingBoardSnapshot } from '@/lib/streaming/boardSnapshot'
import { BOARD_MESSAGE_LIMIT, isListedStreamingMarkee } from '@/lib/streaming/listing'

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

type BoardResponse = { data: StreamingBoardSnapshot; updatedAt: number; stale: boolean }

async function fetchBoard(board: Address, limit: number, fresh: boolean): Promise<StreamingBoardSnapshot> {
  const params = new URLSearchParams({ board, limit: String(limit), ...(fresh ? { fresh: '1' } : {}) })
  const response = await fetch(`/api/streaming/board?${params}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to load board')
  return (await response.json() as BoardResponse).data
}

const big = (value?: string) => value === undefined ? undefined : BigInt(value)

// A StreamingLeaderboard board's metadata and Markees ranked by effectiveRate. The chain reads run
// on the server (/api/streaming/board) and are shared by every viewer, so polling here costs one
// cached request instead of RPC calls from each visitor's browser. getTopMarkees already returns
// (addresses, rates) in descending-rate order; zero-rate entries (the genesis seed Markee and any
// natively-created Markee with no stream and no grandfather floor) are dropped below.
export function useStreamingMarkees(board?: Address, limit = BOARD_MESSAGE_LIMIT) {
  const enabled = !!board
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['streaming-board', board?.toLowerCase(), limit], [board, limit])

  const { data, isLoading: isBoardLoading } = useQuery({
    queryKey,
    queryFn: () => fetchBoard(board!, limit, false),
    enabled,
    refetchInterval: 30_000,
  })

  const meta: StreamingBoardMeta = {
    name: data?.meta.name,
    version: data?.meta.version,
    admin: data?.meta.admin,
    beneficiary: data?.meta.beneficiary,
    minimumMonthlyRate: big(data?.meta.minimumMonthlyRate),
    totalLegacyFunds: big(data?.meta.totalLegacyFunds),
    markeeCount: big(data?.meta.markeeCount),
  }

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
        if (!cancelled) setEverFunded(new Set((d?.markees ?? []).map(a => a.toLowerCase())))
      })
      // A failed check must still resolve everFunded (to an empty set, same as "none known") --
      // isLoading now depends on it going non-null, so leaving it null on error would leave the page
      // stuck on its skeleton forever instead of just under-reporting zero-rate messages like before.
      .catch(() => { if (!cancelled) setEverFunded(new Set()) })
    return () => { cancelled = true }
  }, [board])

  const markees = useMemo((): StreamingMarkee[] =>
    (data?.markees ?? [])
      .map(m => ({
        address: m.address,
        message: m.message,
        name: m.name,
        owner: m.owner,
        rate: BigInt(m.rate),
        streamRate: BigInt(m.streamRate),
        legacyFloor: BigInt(m.legacyFloor),
      }))
      // Same listing rule as the server-side lists (lib/streaming/listing.ts): drops the genesis seed
      // Markee and any dead-on-arrival Markee that was created but never actually funded.
      .filter(m => isListedStreamingMarkee(m.address, m.rate, everFunded ?? new Set())),
    [data, everFunded]
  )

  // After a transaction: ask the server for a fresh chain read rather than the shared snapshot.
  const refetch = useCallback(() => {
    if (!board) return
    fetchBoard(board, limit, true)
      .then(next => queryClient.setQueryData(queryKey, next))
      .catch(() => queryClient.invalidateQueries({ queryKey }))
  }, [board, limit, queryClient, queryKey])

  return {
    meta,
    markees,
    // everFunded === null (its fetch hasn't resolved yet) has to count as loading too -- otherwise
    // zero-rate markees silently drop out of `markees` (see the filter above) while the caller thinks
    // loading has finished, instead of showing a loading state until they're known one way or the other.
    isLoading: isBoardLoading || ((data?.markees.length ?? 0) > 0 && everFunded === null),
    refetch,
  }
}
