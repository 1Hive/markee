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

export function pendingFor(list: PendingTx[], account: string | undefined, board: string | undefined): PendingTx[] {
  if (!account) return []
  const a = account.toLowerCase()
  const b = board?.toLowerCase()
  return list.filter(p => p.account === a && (!b || !p.board || p.board === b))
}
