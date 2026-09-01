'use client'

import { useEffect, useState } from 'react'

// The listing fields every vertical page needs out of /api/streaming/leaderboards. Each page widens
// this with its own columns (repo metadata, boosted, …) when mapping into its row type.
export interface StreamingRow {
  address: string
  name: string
  totalFundsRaw: string
  markeeCount: number
  topFundsAddedRaw: string
  topMessage: string | null
  topMessageOwner: string | null
  topMarkeeAddress: string | null
  effectiveRateRaw: string
  streamedRateRaw: string
  streamedAt: number
  strategy: 'streaming'
}

// Streaming boards placed on `platform`. Empty unless the streaming factory is configured, since the
// route is inert without it.
export function useStreamingRows(platform?: string): StreamingRow[] {
  const [rows, setRows] = useState<StreamingRow[]>([])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/streaming/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { leaderboards?: Record<string, unknown>[] } | null) => {
        if (!data || cancelled) return
        setRows((data.leaderboards ?? [])
          .filter(l => !platform || l.platform === platform)
          .map(l => ({
            address: l.address as string,
            name: l.name as string,
            totalFundsRaw: (l.totalFundsRaw as string) ?? '0',
            markeeCount: (l.markeeCount as number) ?? 0,
            topFundsAddedRaw: (l.topFundsAddedRaw as string) ?? '0',
            topMessage: (l.topMessage as string) ?? null,
            topMessageOwner: (l.topMessageOwner as string) ?? null,
            topMarkeeAddress: (l.topMarkeeAddress as string) ?? null,
            effectiveRateRaw: (l.effectiveRateRaw as string) ?? '0',
            streamedRateRaw: (l.streamedRateRaw as string) ?? '0',
            streamedAt: (l.streamedAt as number) ?? 0,
            strategy: 'streaming' as const,
          })))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [platform])

  return rows
}
