'use client'

// The 3-tx "buy a new message on a streaming board" sequence: create the markee, approve the
// deposit if needed, then open the stream. Extracted verbatim from StreamActivateModal.tsx so both
// it (kept for true board activation) and StreamSignModal share exactly one implementation of this
// working, money-moving flow instead of two copies that can drift.

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useSponsoredWriteContract } from '@/hooks/useSponsoredWriteContract'
import { useTrackedReceipt } from '@/hooks/useTrackedReceipt'
import { recordSubmitted, waitForStep } from '@/lib/tx/stepReceipt'
import { isPendingTxTracked } from '@/lib/tx/pendingStore'
import { erc20Abi, decodeEventLog, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, GDA_AGREEMENT_ID,
  CFA_FORWARDER_ABI, buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import { formatTransactionError, formatReceiptError, logTransactionError } from '@/lib/transactionErrors'
import { classifyPriorStream, clearCreated, loadCreated, planCreateStep, saveCreated, type CreatedMarkee } from '@/lib/superfluid/createResume'
import { textLimitError } from '@/lib/leaderboard/textBytes'

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

  const { writeContractAsync, isPending, reset } = useSponsoredWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: txReverted, error: receiptError } =
    useTrackedReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

  const mountedRef = useRef(isOpen)
  mountedRef.current = isOpen

  // createMarkee clones unconditionally -- there is no per-owner uniqueness check on-chain. So if tx 1
  // lands and a later step fails, retrying must resume from the markee that already exists rather than
  // minting a second orphan one. Cleared with the rest of the state when the modal closes.
  const createdRef = useRef<CreatedMarkee | null>(null)

  useEffect(() => {
    if (isSuccess && address) clearCreated(board, address)
  }, [isSuccess, address, board])

  useEffect(() => {
    if (!isOpen) {
      setPhase('idle'); setError(null); setTxHash(undefined); createdRef.current = null; reset()
    }
  }, [isOpen, reset])

  useEffect(() => {
    if (txReverted && txHash && isOpen) {
      setPhase('idle')
      setError(formatReceiptError(receiptError, 'useCreateStreamFlow.receipt'))
    }
  }, [txReverted, txHash, isOpen, receiptError])

  async function activate(
    message: string,
    calc: CreateStreamCalc,
    opts: { maxLen: number; maxNameLen: number; belowMin: boolean; minMonthlyEth: string },
    name = '',
  ) {
    setError(null)
    if (!address || !publicClient) return
    if (!message.trim()) { setError('Enter a message.'); return }
    const textError = textLimitError('Message', message, opts.maxLen) ?? textLimitError('Name', name, opts.maxNameLen)
    if (textError) { setError(textError); return }
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

      // ── Tx 1: Create Markee (skipped when resuming a partly-finished attempt) ──
      const owner = address.toLowerCase()
      if (createdRef.current?.owner !== owner) createdRef.current = loadCreated(board, owner)
      // A saved markee whose stream was already submitted (e.g. the modal closed before it confirmed,
      // so the isSuccess effect never cleared it) must be resolved before it is reused or edited.
      if (createdRef.current?.streamHash) {
        const priorHash = createdRef.current.streamHash
        let receipt: 'success' | 'reverted' | null = null
        try {
          receipt = (await publicClient.getTransactionReceipt({ hash: priorHash })).status
        } catch (e) {
          // Only "no receipt yet" means no receipt. Any other RPC failure leaves the answer unknown,
          // and guessing could edit a markee that is already backed.
          if ((e as { name?: string })?.name !== 'TransactionReceiptNotFoundError') {
            setError('Could not check your previous stream on this board. Check your connection and try again.')
            return
          }
        }
        const prior = classifyPriorStream(receipt, isPendingTxTracked(priorHash))
        if (prior === 'in-flight') {
          setError('Your previous stream on this board is still confirming. Wait for it to finish, or if Basescan shows it never went through, dismiss it and try again.')
          return
        }
        if (prior === 'reusable') {
          const { streamHash: _reverted, ...unbacked } = createdRef.current
          createdRef.current = unbacked
          saveCreated(board, unbacked)
        } else {
          clearCreated(board, owner)
          createdRef.current = null
        }
      }
      const stepCtx = { account: address, board, label: 'Your stream', chainId: CANONICAL_CHAIN.id }
      const createStep = planCreateStep(createdRef.current, message)
      if (createdRef.current && createStep === 'update') {
        setPhase('creating')
        const editHash = await writeContractAsync({
          address: board,
          abi: StreamingLeaderboardABI,
          functionName: 'updateMessage',
          args: [createdRef.current.markee, message],
          chainId: CANONICAL_CHAIN.id,
        })
        const editReceipt = await waitForStep(publicClient, editHash, stepCtx)
        if (editReceipt.status !== 'success') throw new Error('Updating the message reverted.')
        createdRef.current = { ...createdRef.current, message }
        saveCreated(board, createdRef.current)
        if (!mountedRef.current) return
      }
      if (!createdRef.current) {
        setPhase('creating')
        const createHash = await writeContractAsync({
          address: board,
          abi: StreamingLeaderboardABI,
          functionName: 'createMarkee',
          args: [message, ''],
          chainId: CANONICAL_CHAIN.id,
        })
        const createReceipt = await waitForStep(publicClient, createHash, stepCtx)
        if (createReceipt.status !== 'success') throw new Error('Create Markee transaction reverted.')

        // Decode markee address from MarkeeCreated event
        let created: Address | null = null
        for (const log of createReceipt.logs) {
          if (log.address.toLowerCase() !== board.toLowerCase()) continue
          try {
            const ev = decodeEventLog({ abi: MARKEE_CREATED_ABI, data: log.data, topics: log.topics })
            if (ev.eventName === 'MarkeeCreated') { created = ev.args.markeeAddress; break }
          } catch { /* not the right event, keep scanning */ }
        }
        if (!created) throw new Error('Could not find new Markee address in receipt.')

        // Pool is created inside createMarkee but the RPC may lag behind chain state.
        const createdPool = await waitForPool(
          (addr) => publicClient.readContract({ address: board, abi: StreamingLeaderboardABI, functionName: 'poolOf', args: [addr] }),
          created,
        )
        createdRef.current = { markee: created, pool: createdPool, owner, message }
        saveCreated(board, createdRef.current)
        if (!mountedRef.current) return
      }
      const { markee: markeeAddress, pool } = createdRef.current

      const [cfaAgreement, gdaAgreement, currentAllowance, heldDeposit] = await Promise.all([
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID] }),
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [GDA_AGREEMENT_ID] }),
        publicClient.readContract({ address: ETHX, abi: erc20Abi, functionName: 'allowance', args: [address, board] }),
        publicClient.readContract({ address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: [address] }),
      ])
      const depositTopUp = calc.buffer > (heldDeposit as bigint) ? calc.buffer - (heldDeposit as bigint) : 0n
      if (!mountedRef.current) return

      // ── Tx 2: Approve (if needed) ────────────────────────────────────────
      if (depositTopUp > 0n && (currentAllowance as bigint) < depositTopUp) {
        setPhase('approving')
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, depositTopUp],
          chainId: CANONICAL_CHAIN.id,
        })
        if (!mountedRef.current) return
        const approveReceipt = await waitForStep(publicClient, approveHash, stepCtx)
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
        buffer: depositTopUp,
        cfaAgreement: cfaAgreement as Address,
        gdaAgreement: gdaAgreement as Address,
        pool: pool as Address,
        wrapValue: calc.value,
      })
      const streamHash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: calc.value,
        chainId: CANONICAL_CHAIN.id,
      })
      recordSubmitted(streamHash, stepCtx)
      createdRef.current = { ...createdRef.current, streamHash }
      saveCreated(board, createdRef.current)
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
