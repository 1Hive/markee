'use client'

// Changing the monthly rate of a stream you already run (the "Manage" flow). Extracted verbatim
// from StreamModal.tsx's handleUpdateRate + its supporting reads, so both StreamModal and
// StreamSignModal call the same working implementation instead of two copies that can drift.

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { useApproveAndCall } from '@/hooks/useApproveAndCall'
import { useTrackedReceipt } from '@/hooks/useTrackedReceipt'
import { recordSubmitted } from '@/lib/tx/stepReceipt'
import { BATCH_PROPOSED_NOTICE } from '@/lib/tx/approveAndCall'
import { type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, CFA_FORWARDER_ABI, buildUpdateStreamOps,
} from '@/lib/superfluid/streaming'
import { retryUntilLoaded } from '@/components/modals/StreamUI'
import { formatTransactionError, formatReceiptError, logTransactionError } from '@/lib/transactionErrors'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

export function useUpdateStreamRateFlow(board: Address, isOpen: boolean) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN.id })
  const enabled = isOpen && !!address

  const [approving, setApproving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)

  const { approveAndCall, isPending, reset } = useApproveAndCall()
  const { isLoading: isConfirming, isSuccess, isError: txReverted, error: receiptError } =
    useTrackedReceipt({ marksListings: true, hash: txHash, chainId: CANONICAL_CHAIN.id })

  const openRef = useRef(isOpen)
  openRef.current = isOpen

  const { data: cfaAgreement } = useReadContract({
    address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID], chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: backedMarkee, refetch: refetchBacked } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerMarkee', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: deposit, refetch: refetchDeposit } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: currentRate, refetch: refetchRate } = useReadContract({
    address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate', args: address ? [ETHX, address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })

  useEffect(() => {
    if (!isOpen) {
      setError(null); setNotice(null); setApproving(false); setSubmitting(false); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  // A reverted batch otherwise leaves the modal on "Confirming" with no error (same as useCreateStreamFlow).
  useEffect(() => {
    if (txReverted && txHash && isOpen) {
      setSubmitting(false)
      setError(formatReceiptError(receiptError, 'useUpdateStreamRateFlow.receipt'))
    }
  }, [txReverted, txHash, isOpen, receiptError])

  async function updateRate(
    next: { nextRate: bigint; depositTopUp: bigint },
    opts: { nextBelowMin: boolean; minMonthlyEth: string; balanceValue: bigint | undefined },
  ) {
    setError(null)
    setNotice(null)
    if (!address || !publicClient) return
    if (!cfaAgreement) return
    if (next.nextRate <= 0n) { setError('Enter a monthly rate.'); return }
    if (opts.nextBelowMin) { setError(`The minimum is ${opts.minMonthlyEth} ETH / month.`); return }
    if (opts.balanceValue !== undefined && opts.balanceValue < next.depositTopUp) {
      setError('Not enough ETH for the larger deposit this rate needs.'); return
    }

    try {
      setSubmitting(true)

      // The wrap covers the deposit the board pulls, so raising the rate never eats the runway the
      // stream is already funded with.
      const ops = buildUpdateStreamOps({
        ethx: ETHX,
        board,
        backer: address,
        ratePerSec: next.nextRate,
        depositTopUp: next.depositTopUp,
        wrapValue: next.depositTopUp,
        cfaAgreement: cfaAgreement as Address,
      })

      const step = { account: address, board, label: 'Your stream', chainId: CANONICAL_CHAIN.id }
      const result = await approveAndCall(
        {
          account: address, token: ETHX, spender: board, amount: next.depositTopUp,
          call: {
            address: HOST,
            abi: SUPERFLUID_HOST_ABI,
            functionName: 'batchCall',
            args: [ops],
            value: next.depositTopUp,
            chainId: CANONICAL_CHAIN.id,
          },
        },
        { step, onApproving: () => setApproving(true), onApproved: () => setApproving(false), isActive: () => openRef.current },
      )
      if (result.kind === 'aborted') return
      if (result.kind === 'submitted') recordSubmitted(result.hash, step)
      if (!openRef.current) return
      if (result.kind === 'proposed') {
        setSubmitting(false)
        setNotice(BATCH_PROPOSED_NOTICE)
        return
      }
      setTxHash(result.hash)
    } catch (e: unknown) {
      if (!openRef.current) return
      setApproving(false)
      setSubmitting(false)
      logTransactionError(e, 'useUpdateStreamRateFlow')
      setError(formatTransactionError(e))
    }
  }

  return {
    approving, submitting, isPending, isConfirming, isSuccess, error, setError, notice, txHash,
    backedMarkee, currentRate, deposit,
    refetchBacked, refetchDeposit, refetchRate,
    updateRate,
  }
}
