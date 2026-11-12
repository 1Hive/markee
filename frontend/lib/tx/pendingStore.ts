export interface PendingTx {
  hash: `0x${string}`
  chainId: number
  account?: string
  board?: string
  label?: string
  createdAt: number
}

export const PENDING_TX_KEY = 'markee:pending-tx:v1'
export const PENDING_TX_EVENT = 'markee:pending-tx'
// Hashes the user explicitly marked as never sent (after checking Basescan). Kept so an open modal
// tracking that hash stops waiting on it, and so it isn't treated as still in flight.
export const DISMISSED_TX_KEY = 'markee:dismissed-tx:v1'
const MAX_AGE_MS = 24 * 60 * 60_000
const HASH = /^0x[0-9a-fA-F]{64}$/

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function isPendingTx(value: unknown): value is PendingTx {
  const v = value as PendingTx
  return !!v && typeof v === 'object' && typeof v.hash === 'string' && HASH.test(v.hash)
    && typeof v.chainId === 'number' && typeof v.createdAt === 'number'
}

export function readPendingTxs(now = Date.now()): PendingTx[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed = JSON.parse(store.getItem(PENDING_TX_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isPendingTx).filter(p => now - p.createdAt < MAX_AGE_MS) : []
  } catch {
    return []
  }
}

function writePendingTxs(list: PendingTx[]) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(PENDING_TX_KEY, JSON.stringify(list))
    window.dispatchEvent(new Event(PENDING_TX_EVENT))
  } catch { /* Tracking falls back to the open modal only. */ }
}

export function addPendingTx(tx: PendingTx) {
  const list = readPendingTxs().filter(p => p.hash.toLowerCase() !== tx.hash.toLowerCase())
  writePendingTxs([...list, { ...tx, account: tx.account?.toLowerCase(), board: tx.board?.toLowerCase() }])
}

export function removePendingTx(hash: string) {
  const list = readPendingTxs()
  const next = list.filter(p => p.hash.toLowerCase() !== hash.toLowerCase())
  if (next.length !== list.length) writePendingTxs(next)
}

function readDismissed(now = Date.now()): { hash: string; at: number }[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed = JSON.parse(store.getItem(DISMISSED_TX_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter(d => d && typeof d.hash === 'string' && HASH.test(d.hash) && typeof d.at === 'number' && now - d.at < MAX_AGE_MS)
      : []
  } catch {
    return []
  }
}

export function isDismissedTx(hash: string | undefined): boolean {
  if (!hash) return false
  const h = hash.toLowerCase()
  return readDismissed().some(d => d.hash === h)
}

export function isPendingTxTracked(hash: string): boolean {
  const h = hash.toLowerCase()
  return readPendingTxs().some(p => p.hash.toLowerCase() === h)
}

// Only from an explicit user action ("it never went through"): the app never decides on its own
// that a payment was dropped (see lib/tx/receiptOutcome.ts).
export function dismissPendingTx(hash: string) {
  const store = storage()
  if (store) {
    try {
      const h = hash.toLowerCase()
      const list = readDismissed().filter(d => d.hash !== h)
      store.setItem(DISMISSED_TX_KEY, JSON.stringify([...list, { hash: h, at: Date.now() }]))
    } catch { /* Still removed from the pending list below. */ }
  }
  removePendingTx(hash)
  try { window.dispatchEvent(new Event(PENDING_TX_EVENT)) } catch { /* No window. */ }
}

export function pendingFor(list: PendingTx[], account: string | undefined, board: string | undefined): PendingTx[] {
  if (!account) return []
  const a = account.toLowerCase()
  const b = board?.toLowerCase()
  return list.filter(p => p.account === a && (!b || !p.board || p.board === b))
}
