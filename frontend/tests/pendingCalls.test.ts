import assert from 'node:assert/strict'
import test from 'node:test'
import type { Address } from 'viem'
import {
  clearPendingCalls, priorCallsBlock, readPendingCalls, writePendingCalls,
  PENDING_CALLS_TTL_MS, PROPOSAL_PENDING_MESSAGE, PROPOSAL_UNKNOWN_MESSAGE, UNKNOWN_CALLS_GRACE_MS, type PendingCallsStore,
} from '../lib/tx/pendingCalls'

const SAFE = '0x00000000000000000000000000000000000000Aa' as Address

function memoryStore(): PendingCallsStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v) }, remove: k => { data.delete(k) } }
}

test('a proposal survives a remount and is keyed by account and chain', () => {
  const store = memoryStore()
  writePendingCalls(store, SAFE, 8453, 'batch-1', 0)
  assert.deepEqual(readPendingCalls(store, SAFE.toLowerCase() as Address, 8453, 1000), { id: 'batch-1', at: 0 })
  assert.equal(readPendingCalls(store, SAFE, 10, 1000), null)
  clearPendingCalls(store, SAFE, 8453)
  assert.equal(readPendingCalls(store, SAFE, 8453, 1000), null)
})

test('an expired or corrupt entry is dropped', () => {
  const store = memoryStore()
  writePendingCalls(store, SAFE, 8453, 'batch-1', 0)
  assert.equal(readPendingCalls(store, SAFE, 8453, PENDING_CALLS_TTL_MS + 1), null)
  assert.equal(store.data.size, 0)
  store.set(`markee:pending-calls:8453:${SAFE.toLowerCase()}`, '{not json')
  assert.equal(readPendingCalls(store, SAFE, 8453, 0), null)
})

test('storage that throws never breaks the flow', () => {
  const broken: PendingCallsStore = { get: () => { throw new Error('denied') }, set: () => { throw new Error('denied') }, remove: () => { throw new Error('denied') } }
  writePendingCalls(broken, SAFE, 8453, 'batch-1', 0)
  assert.equal(readPendingCalls(broken, SAFE, 8453, 0), null)
})

test('a pending prior batch blocks a new payment; a settled one does not', () => {
  assert.equal(priorCallsBlock('pending', 0), PROPOSAL_PENDING_MESSAGE)
  assert.equal(priorCallsBlock('pending', PENDING_CALLS_TTL_MS - 1), PROPOSAL_PENDING_MESSAGE)
  assert.equal(priorCallsBlock('failure', 0), null)
  assert.equal(priorCallsBlock('success', 0), null)
})

test('a batch the wallet cannot report on blocks only within the grace period', () => {
  assert.equal(priorCallsBlock('unknown', 0), PROPOSAL_UNKNOWN_MESSAGE)
  assert.equal(priorCallsBlock('unknown', UNKNOWN_CALLS_GRACE_MS - 1), PROPOSAL_UNKNOWN_MESSAGE)
  assert.equal(priorCallsBlock('unknown', UNKNOWN_CALLS_GRACE_MS), null)
})
