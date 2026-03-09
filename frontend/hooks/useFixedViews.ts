'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

interface ViewCounts {
  totalViews: number
  messageViews: number
}

type FixedViewsMap = Map<string, ViewCounts>

// Session-level dedupe — only fire the POST once per markee per page load
const sessionTracked = new Set<string>()

export function useFixedViews(fixedMarkees: FixedMarkee[]) {
  const [views, setViews] = useState<FixedViewsMap>(new Map())
  const fetchedRef = useRef(false)

  // Batch-fetch initial totals
  const fetchViews = useCallback(async (addresses: string[]) => {
    if (addresses.length === 0) return
    try {
      const params = addresses.map((a) => a.toLowerCase()).join(',')
      const res = await fetch(`/api/views?addresses=${params}`)
      if (!res.ok) return
      const data: Record<string, { totalViews: number }> = await res.json()
      setViews((prev) => {
        const next = new Map(prev)
        for (const [addr, counts] of Object.entries(data)) {
          const existing = next.get(addr.toLowerCase())
          next.set(addr.toLowerCase(), {
            totalViews: counts.totalViews,
            messageViews: existing?.messageViews ?? 0,
          })
        }
        return next
      })
    } catch (err) {
      console.error('[useFixedViews] fetch failed:', err)
    }
  }, [])

  // Track a single fixed markee view (increments server-side, deduped per IP/hour)
  const trackView = useCallback(async (fixedMarkee: FixedMarkee) => {
    const key = fixedMarkee.strategyAddress.toLowerCase()
    if (sessionTracked.has(key)) return
    sessionTracked.add(key)

    const message = fixedMarkee.message || fixedMarkee.name
    if (!message) return

    try {
      const res = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: fixedMarkee.strategyAddress,
          message,
        }),
      })
      if (!res.ok) return
      const data: { totalViews: number; messageViews: number; counted: boolean } = await res.json()
      setViews((prev) => {
        const next = new Map(prev)
        next.set(key, {
          totalViews: data.totalViews,
          messageViews: data.messageViews,
        })
        return next
      })
    } catch (err) {
      console.error('[useFixedViews] track failed:', err)
    }
  }, [])

  // Fetch on initial load once fixedMarkees are available
  useEffect(() => {
    if (fixedMarkees.length === 0 || fetchedRef.current) return
    fetchedRef.current = true
    fetchViews(fixedMarkees.map((m) => m.strategyAddress))
  }, [fixedMarkees, fetchViews])

  return { views, trackView }
}
