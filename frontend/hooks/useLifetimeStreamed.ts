'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'

export interface LifetimeStreamed {
  streamedWei: bigint
  refundedWei: bigint
  currentRateWei: bigint
  isTop: boolean
  since: number
}

// See app/api/streaming/lifetime-streamed/route.ts -- server-replayed exact history (from on-chain
// events) up to `since`, meant to be ticked forward live from there with useFlowingAmount rather than
// polled at high frequency: streamedWei/refundedWei are already exact as of `since`, so a 30s cadence
// (same as useTopSince) is only to catch state changes (rate edits, promotions/demotions), not to
// keep the totals themselves fresh.
const POLL_MS = 30_000

export function useLifetimeStreamed(board?: Address, markee?: Address, backer?: Address): LifetimeStreamed | null {
  const [data, setData] = useState<LifetimeStreamed | null>(null)

  useEffect(() => {
    if (!board || !markee || !backer) { setData(null); return }
    let cancelled = false
    const load = () => {
      fetch(`/api/streaming/lifetime-streamed?board=${board}&markee=${markee}&backer=${backer}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled || !d) return
          setData({
            streamedWei: BigInt(d.streamedWei), refundedWei: BigInt(d.refundedWei),
            currentRateWei: BigInt(d.currentRateWei), isTop: d.isTop, since: d.since,
          })
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [board, markee, backer])

  return data
}
