'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'

export interface TopSince {
  address: string
  since: number
}

// See app/api/streaming/top-since/route.ts -- server-verified "since when has this address been #1".
export function useTopSince(board?: Address): TopSince | null {
  const [data, setData] = useState<TopSince | null>(null)

  useEffect(() => {
    if (!board) return
    let cancelled = false
    fetch(`/api/streaming/top-since?board=${board}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.address) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [board])

  return data
}
