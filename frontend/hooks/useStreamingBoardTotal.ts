'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'

// Cumulative-ETHx-streamed snapshot for one streaming board, sourced from the streaming leaderboards
// API (getLogs integration, KV-cached 60s). Feed these into useFlowingAmount to tick the total live.
export interface StreamingBoardTotal {
  totalRaw: bigint
  rateRaw: bigint
  streamedAt: number
}

export function useStreamingBoardTotal(board?: Address): StreamingBoardTotal | null {
  const [total, setTotal] = useState<StreamingBoardTotal | null>(null)

  useEffect(() => {
    if (!board) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/streaming/leaderboards')
        if (!res.ok) return
        const data = await res.json()
        const row = (data.leaderboards ?? []).find(
          (l: any) => l.address?.toLowerCase() === board.toLowerCase(),
        )
        if (!row || cancelled) return
        setTotal({
          totalRaw: BigInt(row.totalFundsRaw ?? '0'),
          rateRaw: BigInt(row.streamedRateRaw ?? '0'),
          streamedAt: Number(row.streamedAt ?? 0),
        })
      } catch {
        // best-effort; the ticker just stays hidden if the API is unavailable
      }
    }

    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [board])

  return total
}
