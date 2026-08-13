'use client'

// The 3-tx "buy a new message on a streaming board" sequence: create the markee, approve the
// deposit if needed, then open the stream. Extracted verbatim from StreamActivateModal.tsx so both
// it (kept for true board activation) and StreamSignModal share exactly one implementation of this
// working, money-moving flow instead of two copies that can drift.

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, decodeEventLog, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, GDA_AGREEMENT_ID,
  CFA_FORWARDER_ABI, buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// createMarkee sets up the pool in the same tx, but the RPC node may not reflect
// it immediately after confirmation. Poll until non-zero before proceeding (up to ~18s).
async function waitForPool(
  readFn: (markeeAddress: Address) => Promise<unknown>,
  markeeAddress: Address,
): Promise<Address> {
  for (let i = 0; i < 12; i++) {
    if (i > 0) await new Promise<void>(r => setTimeout(r, 1500))
    const pool = await readFn(markeeAddress) as Address
    if (pool && pool.toLowerCase() !== ZERO_ADDRESS) return pool
  }
  throw new Error('Pool not ready after 18 s — please try again.')
}

const MARKEE_CREATED_ABI = [
  {
    type: 'event', name: 'MarkeeCreated',
    inputs: [
      { name: 'markeeAddress', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'message', type: 'string', indexed: false },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
] as const

export type CreateStreamPhase = 'idle' | 'creating' | 'approving' | 'streaming' | 'done'
export type CreateStreamCalc = { monthlyWei: bigint; ratePerSec: bigint; buffer: bigint; prefund: bigint; value: bigint }

export function useCreateStreamFlow(board: Address, isOpen: boolean) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN.id })

  const [phase, setPhase] = useState<CreateStreamPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)

  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: txReverted, error: receiptError } =
    useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

  const mountedRef = useRef(isOpen)
  mountedRef.current = isOpen

  useEffect(() => {
    if (!isOpen) {
      setPhase('idle'); setError(null); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  useEffect(() => {
    if (txReverted && txHash && isOpen) {
      setPhase('idle')
      logTransactionError(receiptError, 'useCreateStreamFlow.receipt')
      const decoded = receiptError ? formatTransactionError(receiptError) : null
      setError(decoded && decoded !== 'Transaction error' ? decoded : 'Transaction failed on-chain. Please try again.')
    }
  }, [txReverted, txHash, isOpen, receiptError])

  async function activate(
    message: string,
    calc: CreateStreamCalc,
    opts: { maxLen: number; belowMin: boolean; minMonthlyEth: string },
  ) {
    setError(null)
    if (!address || !publicClient) return
    if (!message.trim()) { setError('Enter a message.'); return }
    if (message.length > opts.maxLen) { setError(`Message must be ${opts.maxLen} characters or less.`); return }
    if (calc.ratePerSec <= 0n) { setError('Enter a monthly rate.'); return }
    if (opts.belowMin) { setError(`The minimum on this board is ${opts.minMonthlyEth} ETH / month.`); return }
    if (calc.prefund <= calc.buffer) { setError('Fund the stream for longer (a few hours minimum).'); return }

    try {
      // Guard: the board's onFlowCreated callback calls createFlow to the beneficiary internally,
      // which reverts if the backer already has a stream to the board. Stop it first.
      const existingRate = await publicClient.readContract({
        address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI,
        functionName: 'getFlowrate', args: [ETHX, address, board],
      }) as bigint
      if (existingRate > 0n) {
        setError('You already have an active stream to this board. Stop it first from your account page, then activate your new Markee.')
        return
      }

      // ── Tx 1: Create Markee ──────────────────────────────────────────────
      setPhase('creating')
      const createHash = await writeContractAsync({
        address: board,
        abi: StreamingLeaderboardABI,
        functionName: 'createMarkee',
        args: [message, ''],
        chainId: CANONICAL_CHAIN.id,
      })
      if (!mountedRef.current) return
      const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash })
      if (createReceipt.status !== 'success') throw new Error('Create Markee transaction reverted.')
      if (!mountedRef.current) return

      // Decode markee address from MarkeeCreated event
      let markeeAddress: Address | null = null
      for (const log of createReceipt.logs) {
        if (log.address.toLowerCase() !== board.toLowerCase()) continue
        try {
          const ev = decodeEventLog({ abi: MARKEE_CREATED_ABI, data: log.data, topics: log.topics })
          if (ev.eventName === 'MarkeeCreated') { markeeAddress = ev.args.markeeAddress; break }
        } catch { /* not the right event, keep scanning */ }
      }
      if (!markeeAddress) throw new Error('Could not find new Markee address in receipt.')

      // Read stable Superfluid addresses and allowance, then poll for pool
      // (pool is created inside createMarkee but RPC may lag behind chain state)
      const [cfaAgreement, gdaAgreement, currentAllowance] = await Promise.all([
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID] }),
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [GDA_AGREEMENT_ID] }),
        publicClient.readContract({ address: ETHX, abi: erc20Abi, functionName: 'allowance', args: [address, board] }),
      ])
      if (!mountedRef.current) return

      const pool = await waitForPool(
        (addr) => publicClient.readContract({ address: board, abi: StreamingLeaderboardABI, functionName: 'poolOf', args: [addr] }),
        markeeAddress,
      )
      if (!mountedRef.current) return

      // ── Tx 2: Approve (if needed) ────────────────────────────────────────
      if ((currentAllowance as bigint) < calc.buffer) {
        setPhase('approving')
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, calc.buffer],
          chainId: CANONICAL_CHAIN.id,
        })
        if (!mountedRef.current) return
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('Approval transaction reverted.')
        if (!mountedRef.current) return
      }

      // ── Tx 3: Open stream ────────────────────────────────────────────────
      setPhase('streaming')
      const ops = buildOpenStreamOps({
        ethx: ETHX,
        board,
        markee: markeeAddress,
        backer: address,
        ratePerSec: calc.ratePerSec,
        buffer: calc.buffer,
        cfaAgreement: cfaAgreement as Address,
        gdaAgreement: gdaAgreement as Address,
        pool: pool as Address,
      })
      const streamHash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: calc.value,
        chainId: CANONICAL_CHAIN.id,
      })
      if (!mountedRef.current) return
      setTxHash(streamHash)

    } catch (e: unknown) {
      if (!mountedRef.current) return
      setPhase('idle')
      logTransactionError(e, 'useCreateStreamFlow')
      setError(formatTransactionError(e))
    }
  }

  return { phase, error, setError, txHash, isPending, isConfirming, isSuccess, activate }
}
