import assert from 'node:assert/strict'
import test from 'node:test'
import type { Address } from 'viem'
import {
  clearPendingCalls, priorCallsBlock, readPendingCalls, writePendingCalls,
  PENDING_CALLS_TTL_MS, PROPOSAL_EXECUTED_MESSAGE, PROPOSAL_PENDING_MESSAGE, type PendingCallsStore,
} from '../lib/tx/pendingCalls'

const SAFE = '0x00000000000000000000000000000000000000Aa' as Address

function memoryStore(): PendingCallsStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v) }, remove: k => { data.delete(k) } }
}

test('a proposal survives a remount and is keyed by account and chain', () => {
  const store = memoryStore()
  writePendingCalls(store, SAFE, 8453, 'batch-1', 0)
  assert.equal(readPendingCalls(store, SAFE.toLowerCase() as Address, 8453, 1000), 'batch-1')
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

test('only a failed prior batch lets a new payment through', () => {
  assert.equal(priorCallsBlock('failure'), null)
  assert.equal(priorCallsBlock('pending'), PROPOSAL_PENDING_MESSAGE)
  assert.equal(priorCallsBlock('unknown'), PROPOSAL_PENDING_MESSAGE)
  assert.equal(priorCallsBlock('success'), PROPOSAL_EXECUTED_MESSAGE)
})
