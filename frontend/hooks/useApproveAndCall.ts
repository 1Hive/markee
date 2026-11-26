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
  browserPendingCallsStore, clearPendingCalls, confirmPendingCalls, guardPendingCalls, pendingCallsStorageWritable, sendRecoverableCalls, PENDING_CALLS_STORAGE_MESSAGE,
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

// EIP-1193/EIP-5792 errors that mean the wallet refused or could not process the request, so nothing
// was signed: user rejection (4001, 5750), unauthorized (4100), disconnected (4900/4901), plus the
// unsupported-batch codes. Matches the SDK's NOT_SENT_CODES. Any other error stays ambiguous.
const NOT_SUBMITTED_CODES = new Set([4001, 5750, 4100, 4900, 4901])

function isDefinitelyNotSubmitted(error: unknown): boolean {
  if (isBatchUnsupportedError(error)) return true
  for (let e = error, depth = 0; e && typeof e === 'object' && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    if (NOT_SUBMITTED_CODES.has((e as { code?: unknown }).code as number)) return true
  }
  return false
}

function walletErrorDiagnostic(error: unknown) {
  if (!error || typeof error !== 'object') return { name: 'unknown' }
  const { name, code } = error as { name?: unknown; code?: unknown }
  return {
    name: typeof name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'unknown',
    ...(typeof code === 'number' && Number.isSafeInteger(code) ? { code } : {}),
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
    // Storage that can't take a record holds no batch this browser could send, so only the batch path
    // needs it: the direct and two-step paths (Privy embedded wallets, existing allowances) stay open.
    // A record that can still be read is always honoured.
    const canRecordBatch = pendingCallsStorageWritable(browserPendingCallsStore)
    await guardPendingCalls(
      browserPendingCallsStore, account, chainId, action,
      async id => {
        const result = await getCallsStatus(config, { id })
        const status: PriorCallsStatus = result.status === 'pending' || result.status === 'success' || result.status === 'failure' ? result.status : 'unknown'
        return { status, transactionHash: result.receipts?.at(-1)?.transactionHash }
      },
      // A receipt lookup error is treated as unknown by guardPendingCalls, keeping the batch blocked.
      async hash => (await publicClient.getTransactionReceipt({ hash })).status,
    ).catch((error: unknown) => {
      if (canRecordBatch || !(error instanceof Error) || error.message !== PENDING_CALLS_STORAGE_MESSAGE) throw error
    })

    const result = await approveAndCall(params, {
      readAllowance: (owner, token, spender) =>
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] }),
      supportsAtomicBatch: async (account, chainId) => {
        // Privy embedded wallets must keep the gas-sponsored path, so only a known external wallet batches.
        if (!latest.current.externalWallet || !canRecordBatch) return false
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
            // The wallet can report success before our RPC has indexed the receipt; wait for it rather
            // than reporting an executed batch as still proposed.
            const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, timeout: BATCH_WAIT_MS }).catch(() => null)
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
        } catch (error) {
          // Never log the raw wallet/RPC error; it may contain provider data or transaction details.
          console.warn('[wallet-batch] status unavailable; retaining pending batch', walletErrorDiagnostic(error))
          return { status: 'pending' }
        }
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
