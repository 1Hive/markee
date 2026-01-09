'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import type { EmojiReaction } from '@/types'

interface UseReactionsReturn {
  reactions: Map<string, EmojiReaction[]> // markeeAddress -> reactions
  isLoading: boolean
  error: string | null
  setReaction: (markeeAddress: string, emoji: string, chainId: number) => Promise<void>
  removeReaction: (markeeAddress: string) => Promise<void>
  toggleReaction: (markeeAddress: string, emoji: string, chainId: number) => Promise<void>
  refetch: () => Promise<void>
}

export function useReactions(): UseReactionsReturn {
  const { address } = useAccount()
  const [reactions, setReactions] = useState<Map<string, EmojiReaction[]>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReactions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/reactions')
      if (!response.ok) throw new Error('Failed to fetch reactions')

      const data = await response.json()

      const grouped = new Map<string, EmojiReaction[]>()
      data.reactions.forEach((reaction: any) => {
        const key = String(reaction.markeeAddress).toLowerCase()
        if (!grouped.has(key)) grouped.set(key, [])

        grouped.get(key)!.push({
          id: reaction.id,
          markeeAddress: reaction.markeeAddress,
          userAddress: reaction.userAddress,
          emoji: reaction.emoji,
          timestamp: BigInt(reaction.timestamp), // API uses number; types expect bigint in app
        })
      })

      setReactions(grouped)
    } catch (err) {
      console.error('[useReactions] Error fetching reactions:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch reactions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // One reaction per user: POST always sets / overwrites
  const setReaction = useCallback(
    async (markeeAddress: string, emoji: string, chainId: number) => {
      if (!address) {
        setError('Wallet not connected')
        return
      }

      try {
        setError(null)

        const response = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            markeeAddress,
            userAddress: address,
            emoji,
            chainId,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          console.error('[useReactions] API error:', data)
          throw new Error(data.error || 'Failed to set reaction')
        }

        await fetchReactions()
      } catch (err) {
        console.error('[useReactions] Error setting reaction:', err)
        setError(err instanceof Error ? err.message : 'Failed to set reaction')
        throw err
      }
    },
    [address, fetchReactions]
  )

  // One reaction per user: DELETE removes the user's reaction for this markee
  const removeReaction = useCallback(
    async (markeeAddress: string) => {
      if (!address) {
        setError('Wallet not connected')
        return
      }

      try {
        setError(null)

        const response = await fetch(
          `/api/reactions?markeeAddress=${encodeURIComponent(markeeAddress)}&userAddress=${encodeURIComponent(address)}`,
          { method: 'DELETE' }
        )

        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Failed to remove reaction')

        await fetchReactions()
      } catch (err) {
        console.error('[useReactions] Error removing reaction:', err)
        setError(err instanceof Error ? err.message : 'Failed to remove reaction')
        throw err
      }
    },
    [address, fetchReactions]
  )

  // Toggle behavior:
  // - if user's existing emoji === clicked emoji -> remove
  // - else -> set (overwrite)
  const toggleReaction = useCallback(
    async (markeeAddress: string, emoji: string, chainId: number) => {
      if (!address) {
        setError('Wallet not connected')
        return
      }

      const key = markeeAddress.toLowerCase()
      const current = reactions.get(key) || []
      const existing = current.find(r => r.userAddress.toLowerCase() === address.toLowerCase())

      if (existing?.emoji === emoji) {
        await removeReaction(markeeAddress)
      } else {
        await setReaction(markeeAddress, emoji, chainId)
      }
    },
    [address, reactions, removeReaction, setReaction]
  )

  useEffect(() => {
    fetchReactions()
  }, [fetchReactions])

  return {
    reactions,
    isLoading,
    error,
    setReaction,
    removeReaction,
    toggleReaction,
    refetch: fetchReactions,
  }
}
