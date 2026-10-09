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
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { ADMIN_ADDRESSES, MODERATION_API } from '@/lib/moderation/config'

// ── Types ────────────────────────────────────────────────────────────

export interface FlaggedLists {
  /** Board flags: set by a board's owner or its moderators, hidden on every site */
  flagged?: string[]
  /** Site flags: set by markee.xyz global admins, hidden on markee.xyz only */
  siteFlagged?: string[]
}

interface ModerationContextValue {
  /** Flagged keys in "chainId:markeeId" format, board and site flags together (both hide here) */
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
  /** Whether the current wallet sees this markee's message and author hidden: flagged, and not one of its moderators */
  isHidden: (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null) => boolean
  /** Whether the current wallet can lift this markee's flag. A board flag is only liftable by that board's moderators. */
  canUnflag: (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null) => boolean
  /** Toggle flag state (must pass canModerate for the same board info). Returns new flag state. */
  toggleFlag: (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null) => Promise<boolean>
  /** Replace the flagged sets with fresh lists from the moderation API */
  replaceFlagged: (lists: FlaggedLists) => void
  /** Loading state for initial fetch */
  isLoading: boolean
}

const ModerationContext = createContext<ModerationContextValue>({
  flaggedSet: new Set(),
  isAdmin: false,
  canModerate: () => false,
  isFlagged: () => false,
  isHidden: () => false,
  canUnflag: () => false,
  toggleFlag: async () => false,
  replaceFlagged: () => {},
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
  const [boardFlagged, setBoardFlagged] = useState<Set<string>>(new Set())
  const [siteFlagged, setSiteFlagged] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  const isAdminUser = address
    ? ADMIN_ADDRESSES.some(
        (admin) => admin.toLowerCase() === address.toLowerCase()
      )
    : false

  const replaceFlagged = useCallback((lists: FlaggedLists) => {
    setBoardFlagged(new Set((lists.flagged ?? []).map(k => k.toLowerCase())))
    setSiteFlagged(new Set((lists.siteFlagged ?? []).map(k => k.toLowerCase())))
  }, [])

  const flaggedSet = useMemo(() => new Set([...boardFlagged, ...siteFlagged]), [boardFlagged, siteFlagged])

  // Fetch flagged list on mount
  useEffect(() => {
    async function fetchFlagged() {
      try {
        const res = await fetch(MODERATION_API)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        replaceFlagged(await res.json())
      } catch (err) {
        console.error('[moderation] Failed to fetch flagged list:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchFlagged()
  }, [replaceFlagged])

  const toKey = (chainId: number | string, markeeId: string) =>
    `${chainId}:${markeeId.toLowerCase()}`

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

  const isHidden = useCallback(
    (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null) =>
      isFlagged(chainId, markeeId) && !canModerate(boardAdmin, boardCreator),
    [isFlagged, canModerate]
  )

  // Global admins flag in the site scope only, so a board flag stays up unless they also moderate the board.
  const canUnflag = useCallback(
    (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null): boolean => {
      if (!canModerate(boardAdmin, boardCreator)) return false
      if (!boardFlagged.has(toKey(chainId, markeeId))) return true
      const wallet = address?.toLowerCase()
      return !!wallet && (boardAdmin?.toLowerCase() === wallet || boardCreator?.toLowerCase() === wallet)
    },
    [canModerate, boardFlagged, address]
  )

  const toggleFlag = useCallback(
    async (chainId: number | string, markeeId: string, boardAdmin?: string | null, boardCreator?: string | null): Promise<boolean> => {
      if (!address || !canModerate(boardAdmin, boardCreator)) return false

      const key = toKey(chainId, markeeId)
      const currentlyFlagged = flaggedSet.has(key)
      if (currentlyFlagged && !canUnflag(chainId, markeeId, boardAdmin, boardCreator)) return true
      const action = currentlyFlagged ? 'unflag' : 'flag'
      // Which list the flag lands in is the server's call (see authorizedScopes); the response replaces both.

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

        replaceFlagged(await res.json())
        return action === 'flag'
      } catch (err) {
        console.error('[moderation] toggleFlag error:', err)
        return currentlyFlagged
      }
    },
    [address, canModerate, canUnflag, flaggedSet, signMessageAsync, replaceFlagged]
  )

  return (
    <ModerationContext.Provider
      value={{ flaggedSet, isAdmin: isAdminUser, canModerate, isFlagged, isHidden, canUnflag, toggleFlag, replaceFlagged, isLoading }}
    >
      {children}
    </ModerationContext.Provider>
  )
}
