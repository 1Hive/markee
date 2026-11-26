import type { Address } from 'viem'

export const PROPOSAL_PENDING_MESSAGE = 'Your previous transaction is still waiting in your wallet. Execute or reject it there (for a Safe, in the Safe queue) before trying again.'
export const PROPOSAL_UNKNOWN_MESSAGE = "We couldn't verify your previous wallet transaction. Reconnect the wallet that submitted it and check its queue before trying again. If it cannot be recovered, contact Markee support."
export const PROPOSAL_EXECUTED_MESSAGE = 'Your previous wallet transaction went through. Check the updated stream before starting another payment.'
export const PENDING_CALLS_STORAGE_MESSAGE = 'Transaction recovery storage is unavailable. Enable site storage before submitting a wallet batch.'

export type PriorCallsStatus = 'pending' | 'success' | 'failure' | 'unknown'
export type PendingCalls =
  | { version: 2; phase: 'submitting'; action: string; at: number }
  | { version: 2; phase: 'submitted'; action: string; id: string; at: number }
  | { version: 2; phase: 'confirmed'; action: string; id: string; at: number }
  | { version: 1; phase: 'submitted'; action: null; id: string; at: number }

export interface PendingCallsStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

function storageKey(account: Address, chainId: number) {
  return `markee:pending-calls:${chainId}:${account.toLowerCase()}`
}

// The v1 record was { id, at }. Keep reading it without its old 24-hour expiry: an outstanding Safe
// proposal may execute days later. An unreadable record must fail closed instead of permitting a retry.
export function readPendingCalls(store: PendingCallsStore, account: Address, chainId: number): PendingCalls | null {
  let raw: string | null
  try { raw = store.get(storageKey(account, chainId)) }
  catch { throw new Error(PENDING_CALLS_STORAGE_MESSAGE) }
  if (!raw) return null
  try {
    const record = JSON.parse(raw) as Record<string, unknown>
    if (typeof record.at !== 'number' || !Number.isFinite(record.at)) throw new Error()
    if (record.version === 2 && typeof record.action === 'string' && record.action) {
      if (record.phase === 'submitting') return { version: 2, phase: 'submitting', action: record.action, at: record.at }
      if ((record.phase === 'submitted' || record.phase === 'confirmed') && typeof record.id === 'string' && record.id) return { version: 2, phase: record.phase, action: record.action, id: record.id, at: record.at }
    }
    if (record.version === undefined && typeof record.id === 'string' && record.id) {
      return { version: 1, phase: 'submitted', action: null, id: record.id, at: record.at }
    }
  } catch { /* A malformed record may still represent a submitted transaction. */ }
  throw new Error(PROPOSAL_UNKNOWN_MESSAGE)
}

function save(store: PendingCallsStore, account: Address, chainId: number, record: PendingCalls) {
  const key = storageKey(account, chainId)
  try {
    store.set(key, JSON.stringify(record))
    if (store.get(key) !== JSON.stringify(record)) throw new Error('Storage did not retain the transaction')
  } catch { throw new Error(PENDING_CALLS_STORAGE_MESSAGE) }
}

export function beginPendingCalls(store: PendingCallsStore, account: Address, chainId: number, action: string, now: number) {
  if (readPendingCalls(store, account, chainId)) throw new Error(PROPOSAL_UNKNOWN_MESSAGE)
  save(store, account, chainId, { version: 2, phase: 'submitting', action, at: now })
}

export function acceptPendingCalls(store: PendingCallsStore, account: Address, chainId: number, action: string, id: string, now: number) {
  const prior = readPendingCalls(store, account, chainId)
  if (!prior || prior.version !== 2 || prior.phase !== 'submitting' || prior.action !== action || !id) throw new Error(PROPOSAL_UNKNOWN_MESSAGE)
  save(store, account, chainId, { version: 2, phase: 'submitted', action, id, at: now })
}

export function confirmPendingCalls(store: PendingCallsStore, account: Address, chainId: number, id: string) {
  const prior = readPendingCalls(store, account, chainId)
  if (!prior || prior.version !== 2 || prior.phase !== 'submitted' || prior.id !== id) throw new Error(PROPOSAL_UNKNOWN_MESSAGE)
  save(store, account, chainId, { ...prior, phase: 'confirmed' })
}

export function clearPendingCalls(store: PendingCallsStore, account: Address, chainId: number) {
  const key = storageKey(account, chainId)
  try {
    store.remove(key)
    if (store.get(key) !== null) throw new Error('Storage did not clear the transaction')
  } catch { throw new Error(PENDING_CALLS_STORAGE_MESSAGE) }
}

// The intent is written before the wallet prompt. Only an explicit rejection or unsupported method
// proves that nothing was submitted; an ambiguous error leaves the intent for manual recovery.
export async function sendRecoverableCalls(
  store: PendingCallsStore, account: Address, chainId: number, action: string,
  send: () => Promise<string>, definitelyNotSubmitted: (error: unknown) => boolean,
  now: () => number = Date.now,
): Promise<string> {
  beginPendingCalls(store, account, chainId, action, now())
  let id: string
  try { id = await send() }
  catch (error) {
    if (definitelyNotSubmitted(error)) clearPendingCalls(store, account, chainId)
    throw error
  }
  acceptPendingCalls(store, account, chainId, action, id, now())
  return id
}

export function priorCallsBlock(status: PriorCallsStatus, phase: PendingCalls['phase'] = 'submitted'): string | null {
  if (phase === 'submitting' || status === 'unknown') return PROPOSAL_UNKNOWN_MESSAGE
  if (phase === 'confirmed') return PROPOSAL_EXECUTED_MESSAGE
  if (status === 'pending') return PROPOSAL_PENDING_MESSAGE
  if (status === 'success') return PROPOSAL_EXECUTED_MESSAGE
  return null
}

export async function guardPendingCalls(
  store: PendingCallsStore, account: Address, chainId: number, action: string,
  statusOf: (id: string) => Promise<{ status: PriorCallsStatus; transactionHash?: `0x${string}` }>,
  receiptOf: (hash: `0x${string}`) => Promise<'success' | 'reverted' | 'unknown'>,
): Promise<void> {
  const prior = readPendingCalls(store, account, chainId)
  if (!prior) return
  if (prior.phase === 'submitting') throw new Error(PROPOSAL_UNKNOWN_MESSAGE)
  if (prior.phase === 'confirmed') {
    if (prior.action === action) throw new Error(PROPOSAL_EXECUTED_MESSAGE)
    clearPendingCalls(store, account, chainId)
    return
  }
  const report = await statusOf(prior.id).catch(() => ({ status: 'unknown' as const }))
  if (report.status === 'failure') {
    clearPendingCalls(store, account, chainId)
    return
  }
  if (report.status !== 'success') throw new Error(priorCallsBlock(report.status) ?? PROPOSAL_UNKNOWN_MESSAGE)
  const receipt = report.transactionHash ? await receiptOf(report.transactionHash).catch(() => 'unknown' as const) : 'unknown'
  if (receipt === 'reverted') {
    clearPendingCalls(store, account, chainId)
    return
  }
  if (receipt !== 'success') throw new Error(PROPOSAL_UNKNOWN_MESSAGE)
  if (prior.version === 1) {
    // The legacy record has no action identity. After verifying its receipt, require a new review.
    clearPendingCalls(store, account, chainId)
    throw new Error(PROPOSAL_EXECUTED_MESSAGE)
  }
  confirmPendingCalls(store, account, chainId, prior.id)
  if (prior.action === action) throw new Error(PROPOSAL_EXECUTED_MESSAGE)
  clearPendingCalls(store, account, chainId)
}

export const browserPendingCallsStore: PendingCallsStore = {
  get: key => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
  remove: key => window.localStorage.removeItem(key),
}
