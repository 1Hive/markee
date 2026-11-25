import type { Address } from 'viem'

// A Safe proposal can wait days for signers, but a lookup that keeps failing must not lock the
// account out forever.
export const PENDING_CALLS_TTL_MS = 24 * 60 * 60 * 1000

// A wallet that can't report on a stored batch (a different connector or session than the one that
// sent it) blocks only this long, so the account isn't locked out for the full TTL.
export const UNKNOWN_CALLS_GRACE_MS = 60 * 60 * 1000

export const PROPOSAL_PENDING_MESSAGE = 'Your previous transaction is still waiting in your wallet. Execute or reject it there (for a Safe, in the Safe queue) before trying again.'
export const PROPOSAL_UNKNOWN_MESSAGE = "We couldn't check on your previous transaction from this wallet. If it is still waiting (for a Safe, in the Safe queue), execute or reject it there; otherwise try again within the hour."

export type PriorCallsStatus = 'pending' | 'success' | 'failure' | 'unknown'

export interface PendingCallsStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

function storageKey(account: Address, chainId: number) {
  return `markee:pending-calls:${chainId}:${account.toLowerCase()}`
}

export function readPendingCalls(store: PendingCallsStore, account: Address, chainId: number, now: number): { id: string; at: number } | null {
  try {
    const raw = store.get(storageKey(account, chainId))
    if (!raw) return null
    const { id, at } = JSON.parse(raw) as { id?: unknown; at?: unknown }
    if (typeof id !== 'string' || typeof at !== 'number' || now - at > PENDING_CALLS_TTL_MS) {
      store.remove(storageKey(account, chainId))
      return null
    }
    return { id, at }
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

// A prior batch that may still execute blocks a new one so nothing is paid twice. One that executed or
// failed is settled and clears the way; the new action reads chain state fresh. A status the wallet
// can't report blocks only within UNKNOWN_CALLS_GRACE_MS of the proposal.
export function priorCallsBlock(status: PriorCallsStatus, ageMs: number): string | null {
  if (status === 'pending') return PROPOSAL_PENDING_MESSAGE
  if (status === 'unknown' && ageMs < UNKNOWN_CALLS_GRACE_MS) return PROPOSAL_UNKNOWN_MESSAGE
  return null
}

export const browserPendingCallsStore: PendingCallsStore = {
  get: key => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
  remove: key => window.localStorage.removeItem(key),
}
