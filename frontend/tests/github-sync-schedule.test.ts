import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FAILED_RETRY_MS, RESYNC_AFTER_MS, syncDecision } from '../lib/github/syncSchedule'

const now = 1_800_000_000_000

test('syncs a board with no history', () => {
  assert.equal(syncDecision('a', null, null, now), 'sync')
})

test('skips a board already synced with the same billboard today', () => {
  assert.equal(syncDecision('a', { signature: 'a', at: now - 60_000 }, null, now), 'unchanged')
})

test('resyncs the same billboard once a day', () => {
  assert.equal(syncDecision('a', { signature: 'a', at: now - RESYNC_AFTER_MS }, null, now), 'sync')
})

test('backs off a board whose same billboard failed recently', () => {
  assert.equal(syncDecision('a', null, { signature: 'a', at: now - 10 * 60_000 }, now), 'backoff')
})

test('retries a failed board once the backoff passes', () => {
  assert.equal(syncDecision('a', null, { signature: 'a', at: now - FAILED_RETRY_MS }, now), 'sync')
})

test('retries a failed board at once when its billboard changes', () => {
  assert.equal(syncDecision('b', null, { signature: 'a', at: now - 60_000 }, now), 'sync')
})
