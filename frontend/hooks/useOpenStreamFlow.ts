'use client'

// Opening a stream to back an existing streaming markee (the "+ Fund" flow). Extracted verbatim
// from StreamModal.tsx's handleOpenStream + its supporting reads, so both StreamModal and
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
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, GDA_AGREEMENT_ID, buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import { retryUntilLoaded } from '@/components/modals/StreamUI'
import { formatTransactionError, formatReceiptError, logTransactionError } from '@/lib/transactionErrors'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type OpenStreamCalc = { ratePerSec: bigint; buffer: bigint; prefund: bigint; value: bigint }

export function useOpenStreamFlow(board: Address, markeeAddress: Address | undefined, isOpen: boolean) {
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

  // Lets the async flow bail out after each await if the caller closed the modal meanwhile.
  const openRef = useRef(isOpen)
  openRef.current = isOpen

  const { data: cfaAgreement } = useReadContract({
    address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID], chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: gdaAgreement } = useReadContract({
    address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [GDA_AGREEMENT_ID], chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: refundPool } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'poolOf', args: markeeAddress ? [markeeAddress] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled: enabled && !!markeeAddress, refetchInterval: retryUntilLoaded },
  })

  const { data: deposit } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })

  const poolReady = !!refundPool && refundPool !== ZERO_ADDRESS
  const readsReady = !!cfaAgreement && !!gdaAgreement && poolReady && deposit !== undefined && !!publicClient

  useEffect(() => {
    if (!isOpen) {
      setError(null); setNotice(null); setApproving(false); setSubmitting(false); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  // A reverted batch otherwise leaves the modal on "Confirming" with no error (same as useCreateStreamFlow).
  useEffect(() => {
    if (txReverted && txHash && isOpen) {
      setSubmitting(false)
      setError(formatReceiptError(receiptError, 'useOpenStreamFlow.receipt'))
    }
  }, [txReverted, txHash, isOpen, receiptError])

  async function openStream(calc: OpenStreamCalc, opts: { belowMin: boolean; minMonthlyEth: string }) {
    setError(null)
    setNotice(null)
    if (!address) return
    if (!readsReady || !markeeAddress) return
    if (calc.ratePerSec <= 0n) { setError('Enter a monthly rate.'); return }
    if (opts.belowMin) { setError(`The minimum is ${opts.minMonthlyEth} ETH / month.`); return }
    // The stream locks its own CFA sender buffer (~4h of rate) from the prefund, on top of the board's
    // GDA buffer. Require the prefund to clear that so createFlow can't revert for insufficient balance.
    if (calc.prefund <= calc.buffer) { setError('Not enough ETH in your wallet to start this stream. Add funds, then try again.'); return }

    try {
      setSubmitting(true)

      const depositTopUp = calc.buffer > (deposit ?? 0n) ? calc.buffer - (deposit ?? 0n) : 0n

      const ops = buildOpenStreamOps({
        ethx: ETHX,
        board,
        markee: markeeAddress,
        backer: address,
        ratePerSec: calc.ratePerSec,
        buffer: depositTopUp,
        cfaAgreement: cfaAgreement as Address,
        gdaAgreement: gdaAgreement as Address,
        pool: refundPool as Address,
        wrapValue: calc.value,
      })

      const step = { account: address, board, label: 'Your stream', chainId: CANONICAL_CHAIN.id }
      const result = await approveAndCall(
        {
          account: address, token: ETHX, spender: board, amount: depositTopUp,
          call: {
            address: HOST,
            abi: SUPERFLUID_HOST_ABI,
            functionName: 'batchCall',
            args: [ops],
            value: calc.value,
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
      logTransactionError(e, 'useOpenStreamFlow')
      setError(formatTransactionError(e))
    }
  }

  return { approving, submitting, isPending, isConfirming, isSuccess, error, setError, notice, txHash, readsReady, deposit, openStream }
}
