'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSignMessage } from 'wagmi'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MODERATION_API } from '@/lib/moderation/config'
import { useModeration } from '@/components/moderation/ModerationProvider'
import { MAX_REVIEW_BATCH, reviewMessage, type ModerationAction, type QueueResponse } from '@/lib/moderation/queue'

const POLL_MS = 60_000

export const moderationQueueKey = (address: string | undefined) => ['moderation-queue', address?.toLowerCase()]

// Shared by the account nav badge and the /account queue: both read the same query, so only one
// poll runs. Reading the queue needs no signature; each review does.
export function useModerationQueue() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { replaceFlagged } = useModeration()
  const queryClient = useQueryClient()
  const addr = address?.toLowerCase()
  const queryKey = moderationQueueKey(addr)

  const queueQuery = useQuery({
    queryKey,
    enabled: !!addr,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<QueueResponse> => {
      const res = await fetch(`${MODERATION_API}/queue?moderator=${addr}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })

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
      replaceFlagged(await res.json())
      const done = new Set(ids.map(id => id.toLowerCase()))
      queryClient.setQueryData<QueueResponse>(moderationQueueKey(addr), prev =>
        prev ? { ...prev, items: prev.items.filter(it => !done.has(it.markee)), flagged: prev.flagged.filter(it => !done.has(it.markee)) } : prev,
      )
    }
    // A flag moves the item into the flagged list; refetch rather than guess its new review state.
    queryClient.invalidateQueries({ queryKey: moderationQueueKey(addr) })
  }, [addr, signMessageAsync, replaceFlagged, queryClient])

  return {
    review,
    items: queueQuery.data?.items ?? [],
    flagged: queueQuery.data?.flagged ?? [],
    boards: queueQuery.data?.boards ?? [],
    isLoading: queueQuery.isLoading,
    error: queueQuery.error as Error | null,
  }
}
