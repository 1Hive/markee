'use client'

/**
 * ModerationProvider
 * 
 * Wrap your app (or a subtree) with this provider to enable moderation.
 * It fetches the flagged-message set once on mount, and exposes helpers
 * to check, flag, and unflag messages.
 * 
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAccount } from 'wagmi'
import { ADMIN_ADDRESSES, MODERATION_API } from '@/lib/moderation/config'

// ── Types ────────────────────────────────────────────────────────────

interface ModerationContextValue {
  /** Set of flagged keys in "chainId:markeeId" format */
  flaggedSet: Set<string>
  /** Whether the current wallet is an admin */
  isAdmin: boolean
  /** Check if a specific markee is flagged */
  isFlagged: (chainId: number | string, markeeId: string) => boolean
  /** Toggle flag state (admin only). Returns new flag state. */
  toggleFlag: (chainId: number | string, markeeId: string) => Promise<boolean>
  /** Loading state for initial fetch */
  isLoading: boolean
}

const ModerationContext = createContext<ModerationContextValue>({
  flaggedSet: new Set(),
  isAdmin: false,
  isFlagged: () => false,
  toggleFlag: async () => false,
  isLoading: true,
})

// ── Hook ─────────────────────────────────────────────────────────────

export function useModeration() {
  return useContext(ModerationContext)
}

// ── Provider ─────────────────────────────────────────────────────────

export function ModerationProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const [flaggedSet, setFlaggedSet] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  const isAdminUser = address
    ? ADMIN_ADDRESSES.some(
        (admin) => admin.toLowerCase() === address.toLowerCase()
      )
    : false

  // Fetch flagged list on mount
  useEffect(() => {
    async function fetchFlagged() {
      try {
        const res = await fetch(MODERATION_API)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setFlaggedSet(new Set(data.flagged ?? []))
      } catch (err) {
        console.error('[moderation] Failed to fetch flagged list:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchFlagged()
  }, [])

  const toKey = (chainId: number | string, markeeId: string) =>
    `${chainId}:${markeeId}`

  const isFlagged = useCallback(
    (chainId: number | string, markeeId: string) =>
      flaggedSet.has(toKey(chainId, markeeId)),
    [flaggedSet]
  )

  const toggleFlag = useCallback(
    async (chainId: number | string, markeeId: string): Promise<boolean> => {
      if (!address || !isAdminUser) return false

      const key = toKey(chainId, markeeId)
      const currentlyFlagged = flaggedSet.has(key)
      const action = currentlyFlagged ? 'unflag' : 'flag'

      // Optimistic update
      setFlaggedSet((prev) => {
        const next = new Set(prev)
        if (action === 'flag') next.add(key)
        else next.delete(key)
        return next
      })

      try {
        const res = await fetch(MODERATION_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            markeeId,
            chainId,
            action,
            adminAddress: address,
          }),
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()
        setFlaggedSet(new Set(data.flagged ?? []))
        return action === 'flag'
      } catch (err) {
        console.error('[moderation] toggleFlag error:', err)
        // Rollback optimistic update
        setFlaggedSet((prev) => {
          const rollback = new Set(prev)
          if (action === 'flag') rollback.delete(key)
          else rollback.add(key)
          return rollback
        })
        return currentlyFlagged
      }
    },
    [address, isAdminUser, flaggedSet]
  )

  return (
    <ModerationContext.Provider
      value={{ flaggedSet, isAdmin: isAdminUser, isFlagged, toggleFlag, isLoading }}
    >
      {children}
    </ModerationContext.Provider>
  )
}
