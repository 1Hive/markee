import { erc20Abi, type Abi, type Address, type Hex } from 'viem'

export type ContractCall = {
  address: Address
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  value?: bigint
  chainId: number
}

export type ApproveAndCallParams = {
  account: Address
  token: Address
  spender: Address
  amount: bigint
  call: ContractCall
}

export type ApproveAndCallMode = 'direct' | 'batch' | 'sequential'

export type ApproveAndCallResult =
  | { kind: 'submitted'; hash: Hex; mode: ApproveAndCallMode }
  | { kind: 'proposed'; id: string }
  | { kind: 'aborted' }

export type CallsOutcome =
  | { status: 'success'; transactionHash: Hex }
  | { status: 'failure' }
  | { status: 'pending' }

export type ApproveAndCallDeps = {
  readAllowance: (owner: Address, token: Address, spender: Address) => Promise<bigint>
  supportsAtomicBatch: (account: Address, chainId: number) => Promise<boolean>
  write: (call: ContractCall) => Promise<Hex>
  waitForReceipt: (hash: Hex) => Promise<{ status: 'success' | 'reverted' }>
  sendCalls: (account: Address, chainId: number, calls: ContractCall[]) => Promise<string>
  waitForCalls: (id: string) => Promise<CallsOutcome>
  onApproving?: () => void
  onApproved?: () => void
  isActive?: () => boolean
}

export const BATCH_FAILED_MESSAGE = 'The batched transaction failed in your wallet. Nothing was paid. Please try again.'
export const BATCH_PROPOSED_NOTICE = 'Submitted to your wallet as one transaction. If you use a Safe, it runs once the other signers confirm and execute it there, and the sign updates after that.'

export function needsApproval(allowance: bigint, amount: bigint): boolean {
  return amount > 0n && allowance < amount
}

type AtomicCapability = { status?: unknown }
type LegacyAtomicCapability = { supported?: unknown }

// 'ready' means the wallet would first ask to upgrade an EOA to a smart account (EIP-7702), so only
// accounts that already batch atomically take the batch path.
export function supportsAtomicBatch(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== 'object') return false
  const { atomic, atomicBatch } = capabilities as { atomic?: AtomicCapability; atomicBatch?: LegacyAtomicCapability }
  if (atomic && atomic.status === 'supported') return true
  return atomicBatch?.supported === true
}

// Codes a wallet returns when it refuses wallet_sendCalls outright (unsupported method, EIP-5792
// capability errors, invalid params), so nothing was submitted and the two-step flow is safe to use
// instead. Matches the SDK's BATCH_UNSUPPORTED_CODES.
const BATCH_UNSUPPORTED_CODES = new Set([4200, -32601, -32602, 5700, 5710, 5740, 5760])

export function isBatchUnsupportedError(error: unknown): boolean {
  for (let e = error, depth = 0; e && typeof e === 'object' && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    if (BATCH_UNSUPPORTED_CODES.has((e as { code?: unknown }).code as number)) return true
  }
  return false
}

export function approveCall(token: Address, spender: Address, amount: bigint, chainId: number): ContractCall {
  return { address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount], chainId }
}

export async function approveAndCall(params: ApproveAndCallParams, deps: ApproveAndCallDeps): Promise<ApproveAndCallResult> {
  const { account, token, spender, amount, call } = params
  const active = deps.isActive ?? (() => true)

  const allowance = await deps.readAllowance(account, token, spender)
  if (!needsApproval(allowance, amount)) {
    return { kind: 'submitted', hash: await deps.write(call), mode: 'direct' }
  }

  const atomic = await deps.supportsAtomicBatch(account, call.chainId).catch(() => false)
  if (atomic) {
    const id = await deps.sendCalls(account, call.chainId, [approveCall(token, spender, amount, call.chainId), call])
      .catch((e: unknown) => { if (isBatchUnsupportedError(e)) return null; throw e })
    if (id !== null) {
      const outcome = await deps.waitForCalls(id)
      if (outcome.status === 'success') return { kind: 'submitted', hash: outcome.transactionHash, mode: 'batch' }
      if (outcome.status === 'failure') throw new Error(BATCH_FAILED_MESSAGE)
      return { kind: 'proposed', id }
    }
  }

  deps.onApproving?.()
  const approveHash = await deps.write(approveCall(token, spender, amount, call.chainId))
  if (!active()) return { kind: 'aborted' }
  const receipt = await deps.waitForReceipt(approveHash)
  if (receipt.status !== 'success') throw new Error('The approval transaction reverted.')
  if (!active()) return { kind: 'aborted' }
  deps.onApproved?.()
  return { kind: 'submitted', hash: await deps.write(call), mode: 'sequential' }
}
