'use client'

import { useCallback, useEffect, useState } from 'react'
import type { BoardIntegrations } from '@/lib/integrations/featured'

const BATCH = 100

// Featured integration and per-integration views for a set of boards, from /api/boards/integrations.
// data is keyed by lowercase board address and stays null until the first read finishes.
export function useBoardIntegrations(boards: string[]) {
  const key = [...new Set(boards.map(b => b.toLowerCase()))].sort().join(',')
  const [data, setData] = useState<Record<string, BoardIntegrations> | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    if (!key) { setData({}); return }
    let cancelled = false
    const list = key.split(',')
    const batches = Array.from({ length: Math.ceil(list.length / BATCH) }, (_, i) => list.slice(i * BATCH, (i + 1) * BATCH))
    Promise.all(batches.map(b => fetch(`/api/boards/integrations?boards=${b.join(',')}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<Record<string, BoardIntegrations>> : {})
      .catch(() => ({}))))
      .then(parts => { if (!cancelled) setData(Object.assign({}, ...parts)) })
    return () => { cancelled = true }
  }, [key, nonce])

  return { data, reload }
}
