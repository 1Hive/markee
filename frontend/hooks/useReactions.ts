'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import type { EmojiReaction } from '@/types'

export function useReactions() {
  const { address } = useAccount()
  const [reactions, setReactions] = useState<Map<string, EmojiReaction[]>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReactions = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/reactions')
      const data = await res.json()

      const grouped = new Map<string, EmojiReaction[]>()
      data.reactions.forEach((r: any) => {
        const key = r.markeeAddress.toLowerCase()
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push({
          ...r,
          timestamp: BigInt(r.timestamp),
        })
      })

      setReactions(grouped)
    } catch (err) {
      setError('Failed to fetch reactions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const toggleReaction = useCallback(
    async (markeeAddress: string, emoji: string, chainId: number) => {
      if (!address) return

      await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markeeAddress, userAddress: address, emoji, chainId }),
      })

      await fetchReactions()
    },
    [address, fetchReactions]
  )

  const removeReaction = useCallback(
    async (markeeAddress: string) => {
      if (!address) return

      await fetch(
        `/api/reactions?markeeAddress=${markeeAddress}&userAddress=${address}`,
        { method: 'DELETE' }
      )

      await fetchReactions()
    },
    [address, fetchReactions]
  )

  useEffect(() => {
    fetchReactions()
  }, [fetchReactions])

  return {
    reactions,
    toggleReaction,
    removeReaction,
    isLoading,
    error,
  }
}
