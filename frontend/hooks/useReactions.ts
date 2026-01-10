'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import type { EmojiReaction } from '@/types'

interface UseReactionsReturn {
  reactions: Map<string, EmojiReaction[]> // Map of markeeAddress -> reactions
  isLoading: boolean
  error: string | null
  toggleReaction: (markeeAddress: string, emoji: string, chainId: number) => Promise<void>
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
          timestamp: BigInt(reaction.timestamp) // Server sends number, convert to BigInt for type
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

  // Toggle a reaction - if user has this emoji, remove it; otherwise add/update it
  const toggleReaction = useCallback(async (
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

      // Check if user already has this exact emoji on this markee
      const markeeReactions = reactions.get(markeeAddress.toLowerCase()) || []
      const userReaction = markeeReactions.find(
        r => r.userAddress.toLowerCase() === address.toLowerCase()
      )

      if (userReaction && userReaction.emoji === emoji) {
        // User has this emoji - remove it
        console.log(`[useReactions] Removing reaction: ${emoji} from ${markeeAddress}`)
        
        const response = await fetch(
          `/api/reactions?markeeAddress=${markeeAddress}&userAddress=${address}`,
          { method: 'DELETE' }
        )

        if (!response.ok) {
          throw new Error('Failed to remove reaction')
        }

        console.log('[useReactions] Reaction removed successfully')
      } else {
        // User doesn't have this emoji - add/update it
        console.log(`[useReactions] Adding/updating reaction: ${emoji} to ${markeeAddress} on chain ${chainId}`)

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
          console.error('[useReactions] API error:', data)
          throw new Error(data.error || 'Failed to add reaction')
        }

        console.log('[useReactions] Reaction added/updated successfully')
      }

      // Refetch to update UI
      await fetchReactions()
    } catch (err) {
      console.error('[useReactions] Error toggling reaction:', err)
      setError(err instanceof Error ? err.message : 'Failed to toggle reaction')
      throw err
    }
  }, [address, reactions, fetchReactions])

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
      console.error('[useReactions] Error removing reaction:', err)
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
    toggleReaction,
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
