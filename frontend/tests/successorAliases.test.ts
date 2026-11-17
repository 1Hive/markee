import assert from 'node:assert/strict'
import test from 'node:test'
import {
  currentBoardFromResolution, inheritBoosts, isBoostedBoard, originalAddress, successorsOf,
} from '../lib/contracts/successorAliases'
import { delimiterAliases } from '../lib/github/linkedFiles'

const legacy = '0xaa37d049dfbfc07f9e8526a4a9bde418df9f1b79'
const successor = '0x808ce55a0bcb26a5d5e1124472919c93bf8798b3'
const fresh = '0x1111111111111111111111111111111111111111'
const predecessorOf = new Map([[successor, '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as `0x${string}`]])

test('originalAddress prefers migratedFrom and lowercases', () => {
  assert.equal(originalAddress({ address: '0x808CE55a0BcB26a5d5e1124472919c93bf8798b3', migratedFrom: '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' }), legacy)
  assert.equal(originalAddress({ address: '0x808CE55a0BcB26a5d5e1124472919c93bf8798b3', migratedFrom: null }), successor)
  assert.equal(originalAddress({}), '')
})

test('successorsOf finds successors of a legacy board regardless of case', () => {
  assert.deepEqual(successorsOf('0xAA37D049DFBFC07F9E8526A4A9BDE418DF9F1B79', predecessorOf), [successor])
  assert.deepEqual(successorsOf(fresh, predecessorOf), [])
})

test('a boost set on the legacy board applies to its successor, not the other way round', () => {
  assert.equal(isBoostedBoard(successor, predecessorOf, new Set([legacy])), true)
  assert.equal(isBoostedBoard(successor, predecessorOf, new Set([successor])), true)
  assert.equal(isBoostedBoard(legacy, predecessorOf, new Set([successor])), false)
  assert.equal(isBoostedBoard(fresh, predecessorOf, new Set([legacy])), false)
})

test('inheritBoosts copies a legacy multiplier to the successor without overriding its own', () => {
  assert.deepEqual(inheritBoosts({ [legacy]: 3 }, predecessorOf), { [legacy]: 3, [successor]: 3 })
  assert.deepEqual(inheritBoosts({ [legacy]: 3, [successor]: 5 }, predecessorOf), { [legacy]: 3, [successor]: 5 })
  assert.deepEqual(inheritBoosts({ [fresh]: 2 }, predecessorOf), { [fresh]: 2 })
})

test('currentBoardFromResolution follows only board successors', () => {
  const requested = '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as const
  assert.equal(currentBoardFromResolution(requested, { address: '0x808CE55a0BcB26a5d5e1124472919c93bf8798b3', kind: 'board' }), '0x808CE55a0BcB26a5d5e1124472919c93bf8798b3')
  assert.equal(currentBoardFromResolution(requested, { address: fresh, kind: 'markee' }), requested)
  assert.equal(currentBoardFromResolution(requested, { address: requested, kind: 'unchanged' }), requested)
  assert.equal(currentBoardFromResolution(requested, { error: 'Resolution unavailable' }), requested)
})

test('delimiterAliases adds the on-chain predecessor and its grandfathered aliases', () => {
  const v13 = '0x43d025ea7f0bfcc508c5dc1708415fe2e41c464a'
  assert.deepEqual(delimiterAliases(successor, null), [])
  assert.deepEqual(delimiterAliases(successor, v13.toUpperCase().replace('0X', '0x')), [
    v13,
    '0xc6c2e9efb898a42db4137b07b727b45e0c353d81',
    '0xb974d9df9b6302ff99b9cc18b1a14ff363aaee21',
  ])
  assert.deepEqual(delimiterAliases(v13, null), [
    '0xc6c2e9efb898a42db4137b07b727b45e0c353d81',
    '0xb974d9df9b6302ff99b9cc18b1a14ff363aaee21',
  ])
})
