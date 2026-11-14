import assert from 'node:assert/strict'
import test from 'node:test'
import { zeroAddress, type Address } from 'viem'
import {
  currentAddressCacheSeconds, parseCurrentAddress, redirectTarget, resolveCurrentAddress,
  RESOLVED_CACHE_SECONDS, UNCHANGED_CACHE_SECONDS,
} from '../lib/contracts/currentAddress'

const legacy = '0x82cbe3BdFC4e01940D186Ac5EA151355647DE0d3' as Address
const successor = '0x7F625449Bcda0E330B5C97312452F83F0e4b23ed' as Address
const none = async () => null

test('a finished board migration resolves to the successor board', async () => {
  const resolution = await resolveCurrentAddress(legacy, { board: async () => successor, markee: none })
  assert.deepEqual(resolution, { address: successor, kind: 'board' })
})

test('a migrated markee resolves to the successor markee', async () => {
  const resolution = await resolveCurrentAddress(legacy, { board: none, markee: async () => successor })
  assert.deepEqual(resolution, { address: successor, kind: 'markee' })
})

test('an unmigrated address and a zero successor stay unchanged', async () => {
  assert.deepEqual(await resolveCurrentAddress(legacy, { board: none, markee: none }), { address: legacy, kind: 'unchanged' })
  assert.deepEqual(
    await resolveCurrentAddress(legacy, { board: async () => zeroAddress, markee: none }),
    { address: legacy, kind: 'unchanged' },
  )
})

test('resolved successors cache long-term and unchanged answers only briefly', () => {
  assert.equal(currentAddressCacheSeconds({ address: successor, kind: 'board' }), RESOLVED_CACHE_SECONDS)
  assert.equal(currentAddressCacheSeconds({ address: successor, kind: 'markee' }), RESOLVED_CACHE_SECONDS)
  assert.equal(currentAddressCacheSeconds({ address: legacy, kind: 'unchanged' }), UNCHANGED_CACHE_SECONDS)
})

test('parseCurrentAddress rejects malformed payloads', () => {
  assert.deepEqual(parseCurrentAddress({ address: successor, kind: 'board' }), { address: successor, kind: 'board' })
  assert.equal(parseCurrentAddress({ address: 'nope', kind: 'board' }), null)
  assert.equal(parseCurrentAddress({ address: successor, kind: 'other' }), null)
  assert.equal(parseCurrentAddress(null), null)
})

test('redirectTarget only redirects to a different successor', () => {
  assert.equal(redirectTarget(legacy, { address: successor, kind: 'board' }), successor)
  assert.equal(redirectTarget(legacy.toLowerCase(), { address: legacy, kind: 'board' }), null)
  assert.equal(redirectTarget(legacy, { address: legacy, kind: 'unchanged' }), null)
  assert.equal(redirectTarget(legacy, null), null)
})
