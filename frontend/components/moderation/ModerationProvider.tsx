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
import { useAccount, useSignMessage } from 'wagmi'
import { ADMIN_ADDRESSES, MODERATION_API } from '@/lib/moderation/config'

// ── Types ────────────────────────────────────────────────────────────

interface ModerationContextValue {
  /** Set of flagged keys in "chainId:markeeId" format */
  flaggedSet: Set<string>
  /** Whether the current wallet is a global admin (in lib/moderation/config.ts's ADMIN_ADDRESSES) */
  isAdmin: boolean
  /**
   * Whether the current wallet can moderate a specific markee -- true for global admins, or when
   * the wallet matches the passed board's on-chain admin or KV-cached creator. This is a UI gate
   * only (show/hide controls); the server independently re-derives and enforces the same rule from
   * markeeId alone on every actual flag/unflag request, so passing wrong/stale board info here can
   * only hide a control a wallet is actually entitled to use, never grant one it isn't.
   */
  canModerate: (boardAdmin?: string | null, boardCreator?: string | null) => boolean
  /** Check if a specific markee is flagged */
  isFlagged: (chainId: number | string, markeeId: string) => boolean
  /** Toggle flag state (must pass canModerate for the same board info). Returns new flag state. */
  toggleFlag: (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null) => Promise<boolean>
  /** Loading state for initial fetch */
  isLoading: boolean
}

const ModerationContext = createContext<ModerationContextValue>({
  flaggedSet: new Set(),
  isAdmin: false,
  canModerate: () => false,
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
  const { signMessageAsync } = useSignMessage()
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

  const canModerate = useCallback(
    (boardAdmin?: string | null, boardCreator?: string | null): boolean => {
      if (isAdminUser) return true
      if (!address) return false
      const wallet = address.toLowerCase()
      if (boardAdmin && boardAdmin.toLowerCase() === wallet) return true
      if (boardCreator && boardCreator.toLowerCase() === wallet) return true
      return false
    },
    [isAdminUser, address]
  )

  const toggleFlag = useCallback(
    async (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null): Promise<boolean> => {
      if (!address || !canModerate(boardAdmin, boardCreator)) return false

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
        const timestamp = Math.floor(Date.now() / 1000)
        const message = `markee-moderation:${action}:${chainId}:${markeeId}:${timestamp}`
        const signature = await signMessageAsync({ message })

        const res = await fetch(MODERATION_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            markeeId,
            chainId,
            action,
            adminAddress: address,
            signature,
            timestamp,
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
    [address, canModerate, flaggedSet, signMessageAsync]
  )

  return (
    <ModerationContext.Provider
      value={{ flaggedSet, isAdmin: isAdminUser, canModerate, isFlagged, toggleFlag, isLoading }}
    >
      {children}
    </ModerationContext.Provider>
  )
}
