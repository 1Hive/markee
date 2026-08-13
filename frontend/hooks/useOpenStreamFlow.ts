'use client'

// Opening a stream to back an existing streaming markee (the "+ Fund" flow). Extracted verbatim
// from StreamModal.tsx's handleOpenStream + its supporting reads, so both StreamModal and
// StreamSignModal call the same working implementation instead of two copies that can drift.

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, GDA_AGREEMENT_ID, buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import { retryUntilLoaded } from '@/components/modals/StreamUI'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'

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
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)

  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

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
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'allowance', args: address ? [address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })

  const poolReady = !!refundPool && refundPool !== ZERO_ADDRESS
  const readsReady = !!cfaAgreement && !!gdaAgreement && poolReady && allowance !== undefined && !!publicClient

  useEffect(() => {
    if (!isOpen) {
      setError(null); setApproving(false); setSubmitting(false); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  async function openStream(calc: OpenStreamCalc, opts: { belowMin: boolean; minMonthlyEth: string }) {
    setError(null)
    if (!address) return
    if (!readsReady || !markeeAddress) return
    if (calc.ratePerSec <= 0n) { setError('Enter a monthly rate.'); return }
    if (opts.belowMin) { setError(`The minimum is ${opts.minMonthlyEth} ETH / month.`); return }
    // The stream locks its own CFA sender buffer (~4h of rate) from the prefund, on top of the board's
    // GDA buffer. Require the prefund to clear that so createFlow can't revert for insufficient balance.
    if (calc.prefund <= calc.buffer) { setError('Fund the stream for longer (a few hours minimum).'); return }

    try {
      setSubmitting(true)

      if ((allowance ?? 0n) < calc.buffer) {
        setApproving(true)
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, calc.buffer],
          chainId: CANONICAL_CHAIN.id,
        })
        const approveReceipt = await publicClient!.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('The approval transaction reverted.')
        await refetchAllowance()
        if (!openRef.current) return
        setApproving(false)
      }

      const ops = buildOpenStreamOps({
        ethx: ETHX,
        board,
        markee: markeeAddress,
        backer: address,
        ratePerSec: calc.ratePerSec,
        buffer: calc.buffer,
        cfaAgreement: cfaAgreement as Address,
        gdaAgreement: gdaAgreement as Address,
        pool: refundPool as Address,
      })

      const batchHash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: calc.value,
        chainId: CANONICAL_CHAIN.id,
      })
      if (!openRef.current) return
      setTxHash(batchHash)
    } catch (e: unknown) {
      if (!openRef.current) return
      setApproving(false)
      setSubmitting(false)
      logTransactionError(e, 'useOpenStreamFlow')
      setError(formatTransactionError(e))
    }
  }

  return { approving, submitting, isPending, isConfirming, isSuccess, error, setError, txHash, readsReady, openStream }
}
