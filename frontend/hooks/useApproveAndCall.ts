'use client'

import { useCallback, useRef } from 'react'
import { useConfig, usePublicClient, useSendCalls } from 'wagmi'
import { getCallsStatus, getCapabilities, waitForCallsStatus } from 'wagmi/actions'
import { encodeFunctionData, erc20Abi, keccak256, stringToHex, type Abi } from 'viem'
import { useSponsoredWriteContract } from '@/hooks/useSponsoredWriteContract'
import { waitForStep, type StepContext } from '@/lib/tx/stepReceipt'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import {
  approveAndCall, isBatchUnsupportedError, supportsAtomicBatch,
  type ApproveAndCallParams, type ApproveAndCallResult, type CallsOutcome, type ContractCall,
} from '@/lib/tx/approveAndCall'
import {
  browserPendingCallsStore, clearPendingCalls, confirmPendingCalls, guardPendingCalls, sendRecoverableCalls,
  type PriorCallsStatus,
} from '@/lib/tx/pendingCalls'

export const BATCH_WAIT_MS = 45_000

type WriteAsync = (call: ContractCall) => Promise<`0x${string}`>

function encodeCall(call: ContractCall) {
  return {
    to: call.address,
    data: encodeFunctionData({ abi: call.abi as Abi, functionName: call.functionName, args: call.args as unknown[] | undefined }),
    value: call.value ?? 0n,
  }
}

function isDefinitelyNotSubmitted(error: unknown): boolean {
  if (isBatchUnsupportedError(error)) return true
  for (let e = error, depth = 0; e && typeof e === 'object' && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === 4001) return true
  }
  return false
}

// Approve-then-act for an ERC20 pull. Reads the allowance fresh, skips the approve when it already
// covers the amount, sends approve + action as one EIP-5792 atomic batch when the wallet supports it
// (Safe, smart wallets), and otherwise falls back to two transactions.
export function useApproveAndCall() {
  const config = useConfig()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN.id })
  const sponsored = useSponsoredWriteContract()
  const { sendCallsAsync, isPending: sendingCalls, reset: resetCalls } = useSendCalls()

  const latest = useRef({ externalWallet: sponsored.needsGasReserve })
  latest.current = { externalWallet: sponsored.needsGasReserve }

  const writeAsync = sponsored.writeContractAsync as unknown as WriteAsync
  const resetWrite = sponsored.reset

  const run = useCallback(async (
    params: ApproveAndCallParams,
    opts: { step: StepContext; onApproving?: () => void; onApproved?: () => void; isActive?: () => boolean },
  ): Promise<ApproveAndCallResult> => {
    if (!publicClient) throw new Error('Network client is not ready. Please try again.')

    const { account, call: { chainId } } = params
    const encoded = encodeCall(params.call)
    const action = keccak256(stringToHex(JSON.stringify([
      account.toLowerCase(), chainId, params.token.toLowerCase(), params.spender.toLowerCase(),
      params.amount.toString(), encoded.to.toLowerCase(), encoded.data, encoded.value.toString(),
    ])))
    await guardPendingCalls(
      browserPendingCallsStore, account, chainId, action,
      async id => {
        const result = await getCallsStatus(config, { id })
        const status: PriorCallsStatus = result.status === 'pending' || result.status === 'success' || result.status === 'failure' ? result.status : 'unknown'
        return { status, transactionHash: result.receipts?.at(-1)?.transactionHash }
      },
      async hash => (await publicClient.getTransactionReceipt({ hash })).status,
    )

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
        return sendRecoverableCalls(browserPendingCallsStore, account, chainId, action, async () => {
          const { id } = await sendCallsAsync({
            account, chainId: chainId as typeof CANONICAL_CHAIN.id, calls: calls.map(encodeCall), forceAtomic: true,
          })
          return id
        }, isDefinitelyNotSubmitted)
      },
      waitForCalls: async (id): Promise<CallsOutcome> => {
        try {
          const status = await waitForCallsStatus(config, { id, timeout: BATCH_WAIT_MS })
          const transactionHash = status.receipts?.at(-1)?.transactionHash
          if (status.status === 'success' && transactionHash) {
            const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash }).catch(() => null)
            if (receipt?.status === 'success') {
              confirmPendingCalls(browserPendingCallsStore, account, chainId, id)
              return { status: 'success', transactionHash }
            }
            if (receipt?.status === 'reverted') {
              clearPendingCalls(browserPendingCallsStore, account, chainId)
              return { status: 'failure' }
            }
          }
          if (status.status === 'failure') {
            clearPendingCalls(browserPendingCallsStore, account, chainId)
            return { status: 'failure' }
          }
          return { status: 'pending' }
        } catch { return { status: 'pending' } }
      },
      onApproving: opts.onApproving,
      onApproved: opts.onApproved,
      isActive: opts.isActive,
    })
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
