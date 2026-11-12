import assert from 'node:assert/strict'
import test from 'node:test'
import { UNSEEN_UNKNOWN_AFTER_MS, UNKNOWN_AFTER_MS, nextTracking, type ReceiptTracking } from '../lib/tx/receiptOutcome'
import { addPendingTx, pendingFor, readPendingTxs, removePendingTx, PENDING_TX_KEY } from '../lib/tx/pendingStore'
import { formatTransactionError, isWalletTimeoutError, WALLET_TIMEOUT_MESSAGE } from '../lib/transactionErrors'
import { createTrackedCache } from '../lib/tx/trackedCache'
import { loadCreated, planCreateStep, resumeKey, saveCreated, type CreatedMarkee } from '../lib/superfluid/createResume'

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

test('a hash the RPC cannot see is never treated as dropped', () => {
  let t = nextTracking(start, { kind: 'unseen' }, 0)
  assert.equal(t.outcome, 'confirming')
  t = nextTracking(t, { kind: 'unseen' }, UNSEEN_UNKNOWN_AFTER_MS - 1)
  assert.equal(t.outcome, 'confirming')
  // Long-unseen becomes unknown (still guarded), never a resolved "nothing was charged".
  const unknown = nextTracking(t, { kind: 'unseen' }, UNSEEN_UNKNOWN_AFTER_MS)
  assert.equal(unknown.outcome, 'unknown')
  assert.equal(nextTracking(unknown, { kind: 'unseen' }, 100 * UNSEEN_UNKNOWN_AFTER_MS).outcome, 'unknown')
  // It can still confirm later, e.g. once a private-mempool or relayed tx lands.
  assert.equal(nextTracking(unknown, { kind: 'pending' }, UNSEEN_UNKNOWN_AFTER_MS).outcome, 'confirming')
  assert.equal(nextTracking(unknown, { kind: 'receipt', status: 'success' }, UNSEEN_UNKNOWN_AFTER_MS).outcome, 'confirmed')
})

function withStorage(run: () => void) {
  const data = new Map<string, string>()
  const g = globalThis as Record<string, unknown>
  const previous = g.window
  g.window = {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v) },
      removeItem: (k: string) => { data.delete(k) },
    },
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

test('RPC failures and HTTP timeouts before sending are not wallet timeouts', () => {
  const httpTimeout = Object.assign(new Error('The request took too long to respond.\nURL: https://mainnet.base.org\nDetails: The request timed out.'), { name: 'TimeoutError' })
  const unknownRpc = new Error('An unknown RPC error occurred.\nDetails: execution reverted')
  for (const error of [httpTimeout, unknownRpc]) {
    assert.equal(isWalletTimeoutError(error), false)
    assert.notEqual(formatTransactionError(error), WALLET_TIMEOUT_MESSAGE)
  }
})

test('tracked receipts survive while pending and are evicted once resolved and unwatched', () => {
  const cache = createTrackedCache<ReceiptTracking>(t => t.outcome !== 'confirming' && t.outcome !== 'unknown')
  cache.retain('a')
  cache.set('a', { outcome: 'confirming' })
  cache.release('a')
  assert.equal(cache.get('a')?.outcome, 'confirming')
  cache.retain('a')
  cache.retain('a')
  cache.set('a', { outcome: 'confirmed' })
  cache.release('a')
  assert.equal(cache.get('a')?.outcome, 'confirmed')
  cache.release('a')
  assert.equal(cache.get('a'), undefined)
  cache.set('b', { outcome: 'unknown' })
  assert.equal(cache.get('b')?.outcome, 'unknown')
  cache.set('b', { outcome: 'reverted' })
  assert.equal(cache.size(), 0)
})

const board = `0x${'1'.repeat(40)}`
const owner = `0x${'2'.repeat(40)}`
const created: CreatedMarkee = { markee: `0x${'3'.repeat(40)}`, pool: `0x${'4'.repeat(40)}`, owner, message: 'first' }

test('a stream resume reuses, edits, or creates based on the saved markee', () => {
  withStorage(() => {
    assert.equal(planCreateStep(loadCreated(board, owner), 'first'), 'create')
    saveCreated(board, created)
    assert.equal(planCreateStep(loadCreated(board, owner.toUpperCase().replace('0X', '0x')), 'first'), 'reuse')
    assert.equal(planCreateStep(loadCreated(board, owner), 'second'), 'update')
    assert.equal(planCreateStep(loadCreated(board, `0x${'5'.repeat(40)}`), 'first'), 'create')
  })
})

test('a saved markee keeps a valid submitted stream hash and drops a malformed one', () => {
  withStorage(() => {
    const streamHash = `0x${'6'.repeat(64)}` as const
    saveCreated(board, { ...created, streamHash })
    assert.equal(loadCreated(board, owner)?.streamHash, streamHash)
    saveCreated(board, { ...created, streamHash: '0xnope' as `0x${string}` })
    const loaded = loadCreated(board, owner)
    assert.equal(loaded?.markee, created.markee)
    assert.equal(loaded?.streamHash, undefined)
  })
})

test('an unconfirmed message edit keeps the saved message so a retry edits again instead of creating', () => {
  withStorage(() => {
    saveCreated(board, created)
    const beforeEdit = loadCreated(board, owner)
    assert.equal(planCreateStep(beforeEdit, 'second'), 'update')
    const afterReopen = loadCreated(board, owner)
    assert.equal(afterReopen?.markee, created.markee)
    assert.equal(planCreateStep(afterReopen, 'second'), 'update')
    saveCreated(board, { ...afterReopen!, message: 'second' })
    assert.equal(planCreateStep(loadCreated(board, owner), 'second'), 'reuse')
  })
})

test('a corrupt saved markee starts a fresh create', () => {
  const data = withStorage(() => {
    window.localStorage.setItem(resumeKey(board, owner), JSON.stringify({ ...created, pool: 'nope' }))
    assert.equal(loadCreated(board, owner), null)
    window.localStorage.setItem(resumeKey(board, owner), '{')
    assert.equal(planCreateStep(loadCreated(board, owner), 'first'), 'create')
  })
  assert.ok(data.has(resumeKey(board, owner)))
})
