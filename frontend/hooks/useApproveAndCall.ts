'use client'

import { useCallback, useRef } from 'react'
import { useConfig, usePublicClient, useSendCalls } from 'wagmi'
import { getCallsStatus, getCapabilities, waitForCallsStatus } from 'wagmi/actions'
import { encodeFunctionData, erc20Abi, type Abi } from 'viem'
import { useSponsoredWriteContract } from '@/hooks/useSponsoredWriteContract'
import { waitForStep, type StepContext } from '@/lib/tx/stepReceipt'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import {
  approveAndCall, supportsAtomicBatch,
  type ApproveAndCallParams, type ApproveAndCallResult, type CallsOutcome, type ContractCall,
} from '@/lib/tx/approveAndCall'

export const BATCH_WAIT_MS = 45_000
export const PROPOSAL_PENDING_MESSAGE = 'Your previous transaction is still waiting in your wallet. Execute or reject it there (for a Safe, in the Safe queue) before trying again.'

type WriteAsync = (call: ContractCall) => Promise<`0x${string}`>

function encodeCall(call: ContractCall) {
  return {
    to: call.address,
    data: encodeFunctionData({ abi: call.abi as Abi, functionName: call.functionName, args: call.args as unknown[] | undefined }),
    value: call.value ?? 0n,
  }
}

// Approve-then-act for an ERC20 pull. Reads the allowance fresh, skips the approve when it already
// covers the amount, sends approve + action as one EIP-5792 atomic batch when the wallet supports it
// (Safe, smart wallets), and otherwise falls back to two transactions.
export function useApproveAndCall() {
  const config = useConfig()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN.id })
  const sponsored = useSponsoredWriteContract()
  const { sendCallsAsync, isPending: sendingCalls, reset: resetCalls } = useSendCalls()
  const proposalRef = useRef<string | null>(null)

  const latest = useRef({ externalWallet: sponsored.needsGasReserve })
  latest.current = { externalWallet: sponsored.needsGasReserve }

  const writeAsync = sponsored.writeContractAsync as unknown as WriteAsync
  const resetWrite = sponsored.reset

  const run = useCallback(async (
    params: ApproveAndCallParams,
    opts: { step: StepContext; onApproving?: () => void; onApproved?: () => void; isActive?: () => boolean },
  ): Promise<ApproveAndCallResult> => {
    if (!publicClient) throw new Error('Network client is not ready. Please try again.')

    if (proposalRef.current) {
      const prior = await getCallsStatus(config, { id: proposalRef.current }).catch(() => null)
      if (prior?.status === 'pending') throw new Error(PROPOSAL_PENDING_MESSAGE)
      proposalRef.current = null
    }

    const result = await approveAndCall(params, {
      readAllowance: (owner, token, spender) =>
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] }),
      supportsAtomicBatch: async (account, chainId) => {
        // Privy embedded wallets must keep the gas-sponsored path, so only a known external wallet batches.
        if (!latest.current.externalWallet) return false
        return supportsAtomicBatch(await getCapabilities(config, { account, chainId }))
      },
      write: writeAsync,
      waitForReceipt: hash => waitForStep(publicClient, hash, opts.step),
      sendCalls: async (account, chainId, calls) => {
        const { id } = await sendCallsAsync({
          account, chainId: chainId as typeof CANONICAL_CHAIN.id, calls: calls.map(encodeCall), forceAtomic: true,
        })
        return id
      },
      waitForCalls: async (id): Promise<CallsOutcome> => {
        try {
          const status = await waitForCallsStatus(config, { id, timeout: BATCH_WAIT_MS })
          const transactionHash = status.receipts?.at(-1)?.transactionHash
          if (status.status === 'success' && transactionHash) return { status: 'success', transactionHash }
          if (status.status === 'failure') return { status: 'failure' }
          return { status: 'pending' }
        } catch (e) {
          if ((e as { name?: string })?.name === 'WaitForCallsStatusTimeoutError') return { status: 'pending' }
          throw e
        }
      },
      onApproving: opts.onApproving,
      onApproved: opts.onApproved,
      isActive: opts.isActive,
    })
    if (result.kind === 'proposed') proposalRef.current = result.id
    return result
  }, [config, publicClient, sendCallsAsync, writeAsync])

  const reset = useCallback(() => { resetWrite(); resetCalls() }, [resetWrite, resetCalls])

  return {
    approveAndCall: run,
    writeContractAsync: sponsored.writeContractAsync,
    isPending: sponsored.isPending || sendingCalls,
    reset,
  }
}
