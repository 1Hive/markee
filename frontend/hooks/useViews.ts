// hooks/useViews.ts
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Markee } from '@/types'

interface ViewCounts {
  totalViews: number
  messageViews: number
}

type ViewsMap = Map<string, ViewCounts>

// Session-level tracking so we only fire increments once per page load per markee
const sessionTracked = new Set<string>()

export function useViews(markees: Markee[]) {
  const [views, setViews] = useState<ViewsMap>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const fetchedRef = useRef(false)

  // Fetch all view counts in one batch GET request
  const fetchViews = useCallback(async (addresses: string[]) => {
    if (addresses.length === 0) return
    setIsLoading(true)
    try {
      const params = addresses.map(a => a.toLowerCase()).join(',')
      const res = await fetch(`/api/views?addresses=${params}`)
      if (!res.ok) return
      const data: Record<string, { totalViews: number }> = await res.json()
      setViews(prev => {
        const next = new Map(prev)
        for (const [address, counts] of Object.entries(data)) {
          const existing = next.get(address.toLowerCase())
          next.set(address.toLowerCase(), {
            totalViews: counts.totalViews,
            messageViews: existing?.messageViews ?? 0,
          })
        }
        return next
      })
    } catch (err) {
      console.error('[useViews] fetch failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Increment view for a single markee (called per-card on mount)
  const trackView = useCallback(async (markee: Markee) => {
    const key = markee.address.toLowerCase()
    if (sessionTracked.has(key)) return
    sessionTracked.add(key)

    try {
      const res = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: markee.address,
          message: markee.message,
        }),
      })
      if (!res.ok) return
      const data: { totalViews: number; messageViews: number; counted: boolean } = await res.json()
      setViews(prev => {
        const next = new Map(prev)
        next.set(key, {
          totalViews: data.totalViews,
          messageViews: data.messageViews,
        })
        return next
      })
    } catch (err) {
      console.error('[useViews] track failed:', err)
    }
  }, [])

  // Fetch on initial load once markees are available
  useEffect(() => {
    if (markees.length === 0 || fetchedRef.current) return
    fetchedRef.current = true
    fetchViews(markees.map(m => m.address))
  }, [markees, fetchViews])

  return { views, isLoading, trackView }
}
