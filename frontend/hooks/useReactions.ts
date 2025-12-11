'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import type { EmojiReaction } from '@/types'

interface UseReactionsReturn {
  reactions: Map<string, EmojiReaction[]> // Map of markeeAddress -> reactions
  isLoading: boolean
  error: string | null
  addReaction: (markeeAddress: string, emoji: string, chainId: number) => Promise<void>
  removeReaction: (markeeAddress: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useReactions(): UseReactionsReturn {
  const { address } = useAccount()
  const [reactions, setReactions] = useState<Map<string, EmojiReaction[]>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch all reactions
  const fetchReactions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/reactions')
      if (!response.ok) {
        throw new Error('Failed to fetch reactions')
      }

      const data = await response.json()
      
      // Group reactions by markeeAddress
      const grouped = new Map<string, EmojiReaction[]>()
      data.reactions.forEach((reaction: any) => {
        const key = reaction.markeeAddress.toLowerCase()
        if (!grouped.has(key)) {
          grouped.set(key, [])
        }
        grouped.get(key)!.push({
          id: reaction.id,
          markeeAddress: reaction.markeeAddress,
          userAddress: reaction.userAddress,
          emoji: reaction.emoji,
          timestamp: BigInt(reaction.timestamp)
        })
      })

      setReactions(grouped)
    } catch (err) {
      console.error('Error fetching reactions:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch reactions')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Add or update a reaction
  const addReaction = useCallback(async (
    markeeAddress: string,
    emoji: string,
    chainId: number
  ) => {
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
          chainId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add reaction')
      }

      // Refetch to update UI
      await fetchReactions()
    } catch (err) {
      console.error('Error adding reaction:', err)
      setError(err instanceof Error ? err.message : 'Failed to add reaction')
      throw err
    }
  }, [address, fetchReactions])

  // Remove a reaction
  const removeReaction = useCallback(async (markeeAddress: string) => {
    if (!address) {
      setError('Wallet not connected')
      return
    }

    try {
      setError(null)

      const response = await fetch(
        `/api/reactions?markeeAddress=${markeeAddress}&userAddress=${address}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        throw new Error('Failed to remove reaction')
      }

      // Refetch to update UI
      await fetchReactions()
    } catch (err) {
      console.error('Error removing reaction:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove reaction')
      throw err
    }
  }, [address, fetchReactions])

  // Initial fetch
  useEffect(() => {
    fetchReactions()
  }, [fetchReactions])

  return {
    reactions,
    isLoading,
    error,
    addReaction,
    removeReaction,
    refetch: fetchReactions
  }
}

// Helper hook to get reactions for a specific Markee
export function useMarkeeReactions(markeeAddress?: string): EmojiReaction[] {
  const { reactions } = useReactions()
  
  if (!markeeAddress) return []
  
  return reactions.get(markeeAddress.toLowerCase()) || []
}
