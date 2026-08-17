'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'

export interface TopSince {
  address: string
  since: number
}

// See app/api/streaming/top-since/route.ts -- server-verified "since when has this address been #1".
// Polls on the same 30s cadence as useStreamingMarkees so a lead change doesn't leave the dethroned
// row ticking a live "Total streamed" while the real #1 shows nothing until reload.
const POLL_MS = 30_000

export function useTopSince(board?: Address): TopSince | null {
  const [data, setData] = useState<TopSince | null>(null)

  useEffect(() => {
    if (!board) { setData(null); return }
    let cancelled = false
    const load = () => {
      fetch(`/api/streaming/top-since?board=${board}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (!cancelled && d?.address) setData(d) })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [board])

  return data
}
