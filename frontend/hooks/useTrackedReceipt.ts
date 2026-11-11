'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { PublicClient, TransactionReceipt } from 'viem'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getTxUrl } from '@/lib/explorer'
import { addPendingTx, removePendingTx } from '@/lib/tx/pendingStore'
import { nextTracking, type ReceiptPoll, type ReceiptTracking } from '@/lib/tx/receiptOutcome'
import { createTrackedCache } from '@/lib/tx/trackedCache'

export const DROPPED_TX_MESSAGE = 'The network dropped this transaction, so nothing was charged. You can try again.'
export const REVERTED_TX_MESSAGE = 'Transaction failed on-chain. Please try again.'

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
  return tracking.outcome === 'confirmed' || tracking.outcome === 'reverted' || tracking.outcome === 'dropped'
}

const trackedByHash = createTrackedCache<TrackedState>(state => isResolved(state.tracking))

export function useTrackedReceipt({ hash, chainId = CANONICAL_CHAIN_ID, track }: {
  hash: `0x${string}` | undefined
  chainId?: number
  track?: TrackedTxContext
}) {
  const client = usePublicClient({ chainId })
  const key = hash ? `${chainId}:${hash.toLowerCase()}` : ''

  useEffect(() => {
    if (!hash || !track) return
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
    refetchInterval: query => (query.state.data && isResolved(query.state.data.tracking) ? false : 2_000),
    refetchIntervalInBackground: true,
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

  const outcome = hash ? data?.tracking.outcome ?? 'confirming' : undefined
  const resolved = outcome === 'confirmed' || outcome === 'reverted' || outcome === 'dropped'

  useEffect(() => {
    if (hash && resolved) removePendingTx(hash)
  }, [hash, resolved])

  return useMemo(() => {
    const error = outcome === 'reverted' ? (data?.revertError ?? new Error(REVERTED_TX_MESSAGE))
      : outcome === 'dropped' ? new Error(DROPPED_TX_MESSAGE) : null
    return {
      outcome,
      data: outcome === 'confirmed' || outcome === 'reverted' ? data?.receipt : undefined,
      isLoading: outcome === 'confirming' || outcome === 'unknown',
      isUnknown: outcome === 'unknown',
      isSuccess: outcome === 'confirmed',
      isError: !!error,
      error,
      explorerUrl: hash ? getTxUrl(chainId, hash) : undefined,
    }
  }, [hash, chainId, outcome, data?.receipt, data?.revertError])
}
