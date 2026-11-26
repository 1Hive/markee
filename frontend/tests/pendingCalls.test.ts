import assert from 'node:assert/strict'
import test from 'node:test'
import type { Address } from 'viem'
import {
  beginPendingCalls, guardPendingCalls,
  readPendingCalls, sendRecoverableCalls, PROPOSAL_EXECUTED_MESSAGE, PROPOSAL_PENDING_MESSAGE,
  PROPOSAL_UNKNOWN_MESSAGE, PENDING_CALLS_STORAGE_MESSAGE, type PendingCallsStore,
} from '../lib/tx/pendingCalls'

const SAFE = '0x00000000000000000000000000000000000000Aa' as Address
const HASH = `0x${'a'.repeat(64)}` as `0x${string}`
const ACTION = 'payment-action-a'

function memoryStore(): PendingCallsStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v) }, remove: k => { data.delete(k) } }
}

test('accepted batch ID is saved before polling or a remount, and an old Safe proposal never expires', async () => {
  const store = memoryStore()
  const id = await sendRecoverableCalls(store, SAFE, 8453, ACTION, async () => 'batch-1', () => false, () => 0)
  assert.equal(id, 'batch-1')
  assert.deepEqual(readPendingCalls(store, SAFE.toLowerCase() as Address, 8453), {
    version: 2, phase: 'submitted', action: ACTION, id: 'batch-1', at: 0,
  })
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => ({ status: 'pending' }), async () => 'unknown'), { message: PROPOSAL_PENDING_MESSAGE })
  assert.equal(readPendingCalls(store, SAFE, 8453)?.phase, 'submitted')
})

test('a reload while the wallet prompt is open leaves a blocking intent', async () => {
  const store = memoryStore()
  beginPendingCalls(store, SAFE, 8453, ACTION, 1)
  assert.deepEqual(readPendingCalls(store, SAFE, 8453), { version: 2, phase: 'submitting', action: ACTION, at: 1 })
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => { throw new Error('must not poll without an ID') }, async () => 'unknown'), { message: PROPOSAL_UNKNOWN_MESSAGE })
})

test('polling failure or an unknown wallet status never permits another submission', async () => {
  const store = memoryStore()
  await sendRecoverableCalls(store, SAFE, 8453, ACTION, async () => 'batch-1', () => false)
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => { throw new Error('connector changed') }, async () => 'unknown'), { message: PROPOSAL_UNKNOWN_MESSAGE })
  assert.equal(readPendingCalls(store, SAFE, 8453)?.phase, 'submitted')
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => ({ status: 'unknown' }), async () => 'unknown'), { message: PROPOSAL_UNKNOWN_MESSAGE })
})

test('a confirmed payment blocks the same action and releases a different one', async () => {
  const store = memoryStore()
  await sendRecoverableCalls(store, SAFE, 8453, ACTION, async () => 'batch-1', () => false)
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => ({ status: 'success', transactionHash: HASH }), async () => 'success'), { message: PROPOSAL_EXECUTED_MESSAGE })
  assert.equal(readPendingCalls(store, SAFE, 8453)?.phase, 'confirmed')
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => { throw new Error('already confirmed') }, async () => 'unknown'), { message: PROPOSAL_EXECUTED_MESSAGE })
  await guardPendingCalls(store, SAFE, 8453, 'payment-action-b', async () => { throw new Error() }, async () => 'unknown')
  assert.equal(readPendingCalls(store, SAFE, 8453), null)
})

test('wallet success without a verified chain receipt remains blocked', async () => {
  const store = memoryStore()
  await sendRecoverableCalls(store, SAFE, 8453, ACTION, async () => 'batch-1', () => false)
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => ({ status: 'success', transactionHash: HASH }), async () => 'unknown'), { message: PROPOSAL_UNKNOWN_MESSAGE })
  assert.equal(readPendingCalls(store, SAFE, 8453)?.phase, 'submitted')
})

test('verified failure permits retry; a wallet rejection clears the unsubmitted intent', async () => {
  const store = memoryStore()
  await sendRecoverableCalls(store, SAFE, 8453, ACTION, async () => 'batch-1', () => false)
  await guardPendingCalls(store, SAFE, 8453, ACTION, async () => ({ status: 'failure' }), async () => 'unknown')
  assert.equal(readPendingCalls(store, SAFE, 8453), null)
  const rejection = Object.assign(new Error('User rejected'), { code: 4001 })
  await assert.rejects(sendRecoverableCalls(store, SAFE, 8453, ACTION,
    async () => { throw rejection }, e => (e as { code?: number }).code === 4001), rejection)
  assert.equal(readPendingCalls(store, SAFE, 8453), null)
})

test('an unsupported batch method can fall back without leaving a pending intent', async () => {
  const store = memoryStore()
  const unsupported = Object.assign(new Error('wallet_sendCalls unsupported'), { code: -32601 })
  await assert.rejects(sendRecoverableCalls(store, SAFE, 8453, ACTION,
    async () => { throw unsupported }, e => (e as { code?: number }).code === -32601), unsupported)
  assert.equal(readPendingCalls(store, SAFE, 8453), null)
})

test('ambiguous send error preserves the intent; unavailable storage stops before the wallet opens', async () => {
  const store = memoryStore()
  await assert.rejects(sendRecoverableCalls(store, SAFE, 8453, ACTION,
    async () => { throw new Error('wallet disconnected after approval') }, () => false), /wallet disconnected/)
  assert.equal(readPendingCalls(store, SAFE, 8453)?.phase, 'submitting')

  const broken: PendingCallsStore = { get: () => { throw new Error('denied') }, set: () => { throw new Error('denied') }, remove: () => { throw new Error('denied') } }
  let sent = false
  await assert.rejects(sendRecoverableCalls(broken, SAFE, 8453, ACTION,
    async () => { sent = true; return 'batch-2' }, () => false), { message: PENDING_CALLS_STORAGE_MESSAGE })
  assert.equal(sent, false)
})

test('legacy records remain readable beyond 24 hours and require a fresh review after receipt verification', async () => {
  const store = memoryStore()
  store.set(`markee:pending-calls:8453:${SAFE.toLowerCase()}`, JSON.stringify({ id: 'old-batch', at: 0 }))
  assert.deepEqual(readPendingCalls(store, SAFE, 8453), { version: 1, phase: 'submitted', action: null, id: 'old-batch', at: 0 })
  await assert.rejects(guardPendingCalls(store, SAFE, 8453, ACTION,
    async () => ({ status: 'success', transactionHash: HASH }), async () => 'success'), { message: PROPOSAL_EXECUTED_MESSAGE })
  assert.equal(readPendingCalls(store, SAFE, 8453), null)
})

test('malformed recovery records fail closed and do not get erased', () => {
  const store = memoryStore()
  const key = `markee:pending-calls:8453:${SAFE.toLowerCase()}`
  store.set(key, '{bad json')
  assert.throws(() => readPendingCalls(store, SAFE, 8453), { message: PROPOSAL_UNKNOWN_MESSAGE })
  assert.equal(store.get(key), '{bad json')
})
