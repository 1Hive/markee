'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { PublicClient, TransactionReceipt } from 'viem'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getTxUrl } from '@/lib/explorer'
import { addPendingTx, isDismissedTx, removePendingTx } from '@/lib/tx/pendingStore'
import { nextTracking, type ReceiptPoll, type ReceiptTracking } from '@/lib/tx/receiptOutcome'
import { createTrackedCache } from '@/lib/tx/trackedCache'
import { useIsDismissedTx } from '@/hooks/usePendingTxs'

export const REVERTED_TX_MESSAGE = 'Transaction failed on-chain. Please try again.'
export const DISMISSED_TX_MESSAGE = 'You marked this transaction as never sent, so you can try again.'

// Confirming txs are polled quickly; once tracking has no definite answer ('unknown', which can last
// up to the pending store's 24h), poll slowly so a never-mined hash doesn't hammer the public RPC.
const CONFIRMING_POLL_MS = 2_000
const UNKNOWN_POLL_MS = 30_000

export interface TrackedTxContext {
  account?: string
  board?: string
  label?: string
}

interface TrackedState { tracking: ReceiptTracking; receipt?: TransactionReceipt; revertError?: unknown }

function errorName(error: unknown) {
  return (error as { name?: string } | null)?.name ?? ''
}

async function revertReason(client: PublicClient, hash: `0x${string}`, blockNumber: bigint): Promise<unknown> {
  try {
    const tx = await client.getTransaction({ hash })
    await client.call({ account: tx.from, to: tx.to ?? undefined, data: tx.input, value: tx.value, gas: tx.gas, blockNumber })
  } catch (error) {
    return error
  }
  return undefined
}

async function pollReceipt(client: PublicClient, hash: `0x${string}`): Promise<{ poll: ReceiptPoll; receipt?: TransactionReceipt; revertError?: unknown }> {
  try {
    const receipt = await client.getTransactionReceipt({ hash })
    const revertError = receipt.status === 'reverted' ? await revertReason(client, hash, receipt.blockNumber) : undefined
    return { poll: { kind: 'receipt', status: receipt.status }, receipt, revertError }
  } catch (error) {
    if (errorName(error) !== 'TransactionReceiptNotFoundError') return { poll: { kind: 'error' } }
  }
  try {
    await client.getTransaction({ hash })
    return { poll: { kind: 'pending' } }
  } catch (error) {
    return { poll: errorName(error) === 'TransactionNotFoundError' ? { kind: 'unseen' } : { kind: 'error' } }
  }
}

function isResolved(tracking: ReceiptTracking) {
  return tracking.outcome === 'confirmed' || tracking.outcome === 'reverted'
}

const trackedByHash = createTrackedCache<TrackedState>(state => isResolved(state.tracking))

export function useTrackedReceipt({ hash, chainId = CANONICAL_CHAIN_ID, track }: {
  hash: `0x${string}` | undefined
  chainId?: number
  track?: TrackedTxContext
}) {
  const client = usePublicClient({ chainId })
  const key = hash ? `${chainId}:${hash.toLowerCase()}` : ''
  // The user said this hash never went through (DismissPendingTx). Stop waiting on it so a modal
  // tracking it isn't left spinning, and stop polling it.
  const dismissed = useIsDismissedTx(hash)
  const dismissedRef = useRef(dismissed)
  dismissedRef.current = dismissed

  useEffect(() => {
    // Remounting a modal must not resurrect a payment the user already dismissed.
    if (!hash || !track || isDismissedTx(hash)) return
    addPendingTx({ hash, chainId, account: track.account, board: track.board, label: track.label, createdAt: Date.now() })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, chainId])

  useEffect(() => {
    if (!key) return
    trackedByHash.retain(key)
    return () => trackedByHash.release(key)
  }, [key])

  const { data } = useQuery({
    queryKey: ['tracked-receipt', key],
    enabled: !!hash && !!client,
    refetchInterval: query => {
      const tracking = query.state.data?.tracking
      if ((tracking && isResolved(tracking)) || dismissedRef.current) return false
      return tracking?.outcome === 'unknown' ? UNKNOWN_POLL_MS : CONFIRMING_POLL_MS
    },
    // Background tabs pause polling and resume when focused, instead of polling every open tab.
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<TrackedState> => {
      const prev = trackedByHash.get(key) ?? { tracking: { outcome: 'confirming' } }
      if (isResolved(prev.tracking)) return prev
      const { poll, receipt, revertError } = await pollReceipt(client!, hash!)
      const next = { tracking: nextTracking(prev.tracking, poll, Date.now()), receipt: receipt ?? prev.receipt, revertError: revertError ?? prev.revertError }
      trackedByHash.set(key, next)
      return next
    },
  })

  const tracked = hash ? data?.tracking.outcome ?? 'confirming' : undefined
  const resolved = tracked === 'confirmed' || tracked === 'reverted'
  // Dismissal only overrides a hash that hasn't resolved; a receipt that already arrived still wins.
  const abandoned = !!hash && dismissed && !resolved
  const outcome = abandoned ? undefined : tracked

  useEffect(() => {
    if (hash && resolved) removePendingTx(hash)
  }, [hash, resolved])

  return useMemo(() => {
    const error = outcome === 'reverted' ? (data?.revertError ?? new Error(REVERTED_TX_MESSAGE))
      : abandoned ? new Error(DISMISSED_TX_MESSAGE) : null
    return {
      outcome: abandoned ? 'dismissed' as const : outcome,
      data: outcome === 'confirmed' || outcome === 'reverted' ? data?.receipt : undefined,
      isLoading: outcome === 'confirming' || outcome === 'unknown',
      isUnknown: outcome === 'unknown',
      isSuccess: outcome === 'confirmed',
      isError: !!error,
      error,
      explorerUrl: hash ? getTxUrl(chainId, hash) : undefined,
    }
  }, [hash, chainId, outcome, abandoned, data?.receipt, data?.revertError])
}
