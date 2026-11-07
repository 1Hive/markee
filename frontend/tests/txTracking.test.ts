import assert from 'node:assert/strict'
import test from 'node:test'
import { DROPPED_AFTER_MS, UNKNOWN_AFTER_MS, nextTracking, type ReceiptTracking } from '../lib/tx/receiptOutcome'
import { addPendingTx, pendingFor, readPendingTxs, removePendingTx, PENDING_TX_KEY } from '../lib/tx/pendingStore'
import { formatTransactionError, isWalletTimeoutError, WALLET_TIMEOUT_MESSAGE } from '../lib/transactionErrors'

const start: ReceiptTracking = { outcome: 'confirming' }

test('a mined receipt resolves the outcome and stays resolved', () => {
  const confirmed = nextTracking(start, { kind: 'receipt', status: 'success' }, 0)
  assert.equal(confirmed.outcome, 'confirmed')
  assert.equal(nextTracking(confirmed, { kind: 'error' }, 1e9).outcome, 'confirmed')
  assert.equal(nextTracking(start, { kind: 'receipt', status: 'reverted' }, 0).outcome, 'reverted')
})

test('RPC failures never look like a failed payment', () => {
  let t = nextTracking(start, { kind: 'error' }, 0)
  assert.equal(t.outcome, 'confirming')
  t = nextTracking(t, { kind: 'error' }, UNKNOWN_AFTER_MS)
  assert.equal(t.outcome, 'unknown')
  t = nextTracking(t, { kind: 'error' }, 10 * UNKNOWN_AFTER_MS)
  assert.equal(t.outcome, 'unknown')
  assert.equal(nextTracking(t, { kind: 'receipt', status: 'success' }, 0).outcome, 'confirmed')
})

test('a hash the network never knew becomes dropped only after the grace period', () => {
  let t = nextTracking(start, { kind: 'unseen' }, 0)
  assert.equal(t.outcome, 'confirming')
  t = nextTracking(t, { kind: 'unseen' }, DROPPED_AFTER_MS - 1)
  assert.equal(t.outcome, 'confirming')
  assert.equal(nextTracking(t, { kind: 'unseen' }, DROPPED_AFTER_MS).outcome, 'dropped')
  assert.equal(nextTracking(t, { kind: 'pending' }, DROPPED_AFTER_MS).outcome, 'confirming')
})

function withStorage(run: () => void) {
  const data = new Map<string, string>()
  const g = globalThis as Record<string, unknown>
  const previous = g.window
  g.window = {
    localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } },
    dispatchEvent: () => true,
  }
  try { run() } finally { g.window = previous }
  return data
}

const hashA = `0x${'a'.repeat(64)}` as const
const hashB = `0x${'b'.repeat(64)}` as const

test('pending payments survive a reload and are scoped by wallet and board', () => {
  withStorage(() => {
    addPendingTx({ hash: hashA, chainId: 8453, account: '0xAbc', board: '0xBoard', createdAt: Date.now() })
    addPendingTx({ hash: hashB, chainId: 8453, account: '0xother', board: '0xboard', createdAt: Date.now() })
    const list = readPendingTxs()
    assert.equal(list.length, 2)
    assert.deepEqual(pendingFor(list, '0xABC', '0xBOARD').map(p => p.hash), [hashA])
    assert.deepEqual(pendingFor(list, '0xabc', '0xelsewhere'), [])
    assert.deepEqual(pendingFor(list, undefined, '0xboard'), [])
    removePendingTx(hashA.toUpperCase().replace('0X', '0x'))
    assert.deepEqual(readPendingTxs().map(p => p.hash), [hashB])
  })
})

test('corrupt or stale pending records are ignored', () => {
  const data = withStorage(() => {
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(PENDING_TX_KEY, JSON.stringify([
      { hash: 'nope', chainId: 8453, createdAt: Date.now() },
      { hash: hashA, chainId: 8453, createdAt: Date.now() - 2 * 86400_000 },
      { hash: hashB, chainId: 8453, createdAt: Date.now() },
    ]))
    assert.deepEqual(readPendingTxs().map(p => p.hash), [hashB])
  })
  assert.ok(data.has(PENDING_TX_KEY))
})

test('wallet timeouts get their own message and are not rejections', () => {
  const timeout = new Error('An unknown RPC error occurred.\nDetails: Wallet timeout')
  assert.equal(isWalletTimeoutError(timeout), true)
  assert.equal(formatTransactionError(timeout), WALLET_TIMEOUT_MESSAGE)
  assert.equal(isWalletTimeoutError(new Error('User rejected the request.')), false)
})
