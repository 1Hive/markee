'use client'

// Changing the monthly rate of a stream you already run (the "Manage" flow). Extracted verbatim
// from StreamModal.tsx's handleUpdateRate + its supporting reads, so both StreamModal and
// StreamSignModal call the same working implementation instead of two copies that can drift.

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, CFA_FORWARDER_ABI, buildUpdateStreamOps,
} from '@/lib/superfluid/streaming'
import { retryUntilLoaded } from '@/components/modals/StreamUI'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'

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
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)

  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

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
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'allowance', args: address ? [address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })

  useEffect(() => {
    if (!isOpen) {
      setError(null); setApproving(false); setSubmitting(false); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  async function updateRate(
    next: { nextRate: bigint; depositTopUp: bigint },
    opts: { nextBelowMin: boolean; minMonthlyEth: string; balanceValue: bigint | undefined },
  ) {
    setError(null)
    if (!address || !publicClient) return
    if (!cfaAgreement) return
    if (next.nextRate <= 0n) { setError('Enter a monthly rate.'); return }
    if (opts.nextBelowMin) { setError(`The minimum is ${opts.minMonthlyEth} ETH / month.`); return }
    if (opts.balanceValue !== undefined && opts.balanceValue < next.depositTopUp) {
      setError('Not enough ETH for the larger deposit this rate needs.'); return
    }

    try {
      setSubmitting(true)

      if (next.depositTopUp > 0n && (allowance ?? 0n) < next.depositTopUp) {
        setApproving(true)
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, next.depositTopUp],
          chainId: CANONICAL_CHAIN.id,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('The approval transaction reverted.')
        await refetchAllowance()
        if (!openRef.current) return
        setApproving(false)
      }

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

      const hash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: next.depositTopUp,
        chainId: CANONICAL_CHAIN.id,
      })
      if (!openRef.current) return
      setTxHash(hash)
    } catch (e: unknown) {
      if (!openRef.current) return
      setApproving(false)
      setSubmitting(false)
      logTransactionError(e, 'useUpdateStreamRateFlow')
      setError(formatTransactionError(e))
    }
  }

  return {
    approving, submitting, isPending, isConfirming, isSuccess, error, setError, txHash,
    backedMarkee, currentRate, deposit,
    refetchBacked, refetchDeposit, refetchRate, refetchAllowance,
    updateRate,
  }
}
