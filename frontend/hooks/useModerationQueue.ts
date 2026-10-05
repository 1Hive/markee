'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSignMessage } from 'wagmi'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MODERATION_API } from '@/lib/moderation/config'
import { useModeration } from '@/components/moderation/ModerationProvider'
import {
  MAX_REVIEW_BATCH, QUEUE_SESSION_TTL_SECONDS, queueSessionMessage, reviewMessage,
  type ModerationAction, type QueueResponse,
} from '@/lib/moderation/queue'

interface QueueSession {
  timestamp: number
  signature: `0x${string}`
}

const POLL_MS = 60_000
const EXPIRY_MARGIN_SECONDS = 300

const storageKey = (address: string) => `markee:moderation-session:${address.toLowerCase()}`

function loadSession(address: string): QueueSession | null {
  try {
    const raw = localStorage.getItem(storageKey(address))
    const session = raw ? (JSON.parse(raw) as QueueSession) : null
    if (!session) return null
    const age = Math.floor(Date.now() / 1000) - session.timestamp
    return age < QUEUE_SESSION_TTL_SECONDS - EXPIRY_MARGIN_SECONDS ? session : null
  } catch {
    return null
  }
}

function saveSession(address: string, session: QueueSession | null) {
  try {
    if (session) localStorage.setItem(storageKey(address), JSON.stringify(session))
    else localStorage.removeItem(storageKey(address))
  } catch { /* storage unavailable, the session just lasts for this page */ }
}

// Shared by the account nav badge and the /account queue: both read the same query, so only one
// poll runs, and a session signed on /account lights up the badge everywhere.
export function useModerationQueue() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { replaceFlagged } = useModeration()
  const queryClient = useQueryClient()
  const addr = address?.toLowerCase()

  const sessionQuery = useQuery({
    queryKey: ['moderation-session', addr],
    queryFn: () => (addr ? loadSession(addr) : null),
    enabled: !!addr,
    staleTime: Infinity,
  })
  const session = sessionQuery.data ?? null

  const queueQuery = useQuery({
    queryKey: ['moderation-queue', addr, session?.timestamp],
    enabled: !!addr && !!session,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<QueueResponse> => {
      const params = new URLSearchParams({ moderator: addr!, signature: session!.signature, timestamp: String(session!.timestamp) })
      const res = await fetch(`${MODERATION_API}/queue?${params}`, { cache: 'no-store' })
      if (res.status === 401) {
        saveSession(addr!, null)
        queryClient.setQueryData(['moderation-session', addr], null)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })

  const unlock = useCallback(async () => {
    if (!addr) return
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = await signMessageAsync({ message: queueSessionMessage(addr, timestamp) })
    const next = { timestamp, signature }
    saveSession(addr, next)
    queryClient.setQueryData(['moderation-session', addr], next)
  }, [addr, signMessageAsync, queryClient])

  const review = useCallback(async (action: ModerationAction, markeeIds: string[]) => {
    if (!addr || markeeIds.length === 0) return
    for (let i = 0; i < markeeIds.length; i += MAX_REVIEW_BATCH) {
      const ids = markeeIds.slice(i, i + MAX_REVIEW_BATCH)
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = await signMessageAsync({ message: reviewMessage(action, CANONICAL_CHAIN_ID, ids, timestamp) })
      const res = await fetch(MODERATION_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markeeIds: ids, chainId: CANONICAL_CHAIN_ID, action, adminAddress: addr, signature, timestamp }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      replaceFlagged(data.flagged ?? [])
      const done = new Set(ids.map(id => id.toLowerCase()))
      queryClient.setQueryData<QueueResponse>(['moderation-queue', addr, session?.timestamp], prev =>
        prev ? { ...prev, items: prev.items.filter(it => !done.has(it.markee)) } : prev,
      )
    }
  }, [addr, signMessageAsync, replaceFlagged, queryClient, session?.timestamp])

  return {
    unlocked: !!session,
    unlock,
    review,
    items: queueQuery.data?.items ?? [],
    boards: queueQuery.data?.boards ?? [],
    isLoading: queueQuery.isLoading,
    error: queueQuery.error as Error | null,
  }
}
