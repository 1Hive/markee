import type { Hex, PublicClient, TransactionReceipt } from 'viem'
import { addPendingTx, removePendingTx } from '@/lib/tx/pendingStore'

export const STEP_TIMEOUT_MS = 180_000
export const STEP_STILL_CONFIRMING = 'This step is still confirming. Check Basescan before trying again, so nothing is paid twice.'

export interface StepContext { account?: string; board?: string; label?: string; chainId: number }

export function recordSubmitted(hash: Hex, ctx: StepContext) {
  addPendingTx({ hash, chainId: ctx.chainId, account: ctx.account, board: ctx.board, label: ctx.label, createdAt: Date.now() })
}

export async function waitForStep(client: PublicClient, hash: Hex, ctx: StepContext): Promise<TransactionReceipt> {
  recordSubmitted(hash, ctx)
  let receipt: TransactionReceipt
  try {
    receipt = await client.waitForTransactionReceipt({ hash, timeout: STEP_TIMEOUT_MS })
  } catch (error) {
    if ((error as { name?: string })?.name === 'WaitForTransactionReceiptTimeoutError') throw new Error(STEP_STILL_CONFIRMING)
    throw error
  }
  removePendingTx(hash)
  return receipt
}
