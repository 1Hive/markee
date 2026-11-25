import type { Address } from 'viem'

// A Safe proposal can wait days for signers, but a lookup that keeps failing must not lock the
// account out forever.
export const PENDING_CALLS_TTL_MS = 24 * 60 * 60 * 1000

export const PROPOSAL_PENDING_MESSAGE = 'Your previous transaction is still waiting in your wallet. Execute or reject it there (for a Safe, in the Safe queue) before trying again.'
export const PROPOSAL_EXECUTED_MESSAGE = 'Your previous transaction from your wallet already went through. Refresh the page to see it.'

export type PriorCallsStatus = 'pending' | 'success' | 'failure' | 'unknown'

export interface PendingCallsStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

function storageKey(account: Address, chainId: number) {
  return `markee:pending-calls:${chainId}:${account.toLowerCase()}`
}

export function readPendingCalls(store: PendingCallsStore, account: Address, chainId: number, now: number): string | null {
  try {
    const raw = store.get(storageKey(account, chainId))
    if (!raw) return null
    const { id, at } = JSON.parse(raw) as { id?: unknown; at?: unknown }
    if (typeof id !== 'string' || typeof at !== 'number' || now - at > PENDING_CALLS_TTL_MS) {
      store.remove(storageKey(account, chainId))
      return null
    }
    return id
  } catch {
    return null
  }
}

export function writePendingCalls(store: PendingCallsStore, account: Address, chainId: number, id: string, now: number) {
  try { store.set(storageKey(account, chainId), JSON.stringify({ id, at: now })) } catch {}
}

export function clearPendingCalls(store: PendingCallsStore, account: Address, chainId: number) {
  try { store.remove(storageKey(account, chainId)) } catch {}
}

// A prior batch that may still execute (pending, or a status the wallet could not report) blocks a
// new one so nothing is paid twice; one that already executed blocks too, since resubmitting would pay
// again. Only a failed batch clears the way.
export function priorCallsBlock(status: PriorCallsStatus): string | null {
  if (status === 'failure') return null
  if (status === 'success') return PROPOSAL_EXECUTED_MESSAGE
  return PROPOSAL_PENDING_MESSAGE
}

export const browserPendingCallsStore: PendingCallsStore = {
  get: key => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
  remove: key => window.localStorage.removeItem(key),
}
