import assert from 'node:assert/strict'
import test from 'node:test'
import { BaseError, ContractFunctionExecutionError, ContractFunctionZeroDataError, parseAbi, zeroAddress } from 'viem'
import { isUndeployedContract, isVisibleBoard, originalBoard, MIGRATION_FINISHED } from '../lib/contracts/migration'

const legacy = '0x00000000000000000000000000000000000000aa'
const IMPORTING = 1

test('an unmigrated board stays visible', () => {
  assert.equal(isVisibleBoard({ status: 0, predecessor: zeroAddress, predecessorStatus: 0 }), true)
})

test('a board still importing stays visible until it finishes', () => {
  assert.equal(isVisibleBoard({ status: IMPORTING, predecessor: zeroAddress, predecessorStatus: 0 }), true)
  assert.equal(isVisibleBoard({ status: MIGRATION_FINISHED, predecessor: zeroAddress, predecessorStatus: 0 }), false)
})

test('a successor appears only once its predecessor finished', () => {
  assert.equal(isVisibleBoard({ status: 0, predecessor: legacy, predecessorStatus: IMPORTING }), false)
  assert.equal(isVisibleBoard({ status: 0, predecessor: legacy, predecessorStatus: MIGRATION_FINISHED }), true)
})

test('original board falls back to the address itself', () => {
  const successor = '0x00000000000000000000000000000000000000BB'
  const predecessors = new Map([[successor.toLowerCase(), legacy as `0x${string}`]])
  assert.equal(originalBoard(successor, predecessors), legacy)
  assert.equal(originalBoard(legacy, predecessors), legacy)
})

test('a contract with no code at the read block counts as undeployed, other errors do not', () => {
  const zeroData = new ContractFunctionZeroDataError({ functionName: 'status' })
  const wrapped = new ContractFunctionExecutionError(zeroData, { abi: parseAbi(['function status(address) view returns (uint8)']), functionName: 'status' })
  assert.equal(isUndeployedContract(zeroData), true)
  assert.equal(isUndeployedContract(wrapped), true)
  assert.equal(isUndeployedContract(new BaseError('rate limited')), false)
  assert.equal(isUndeployedContract(new Error('network')), false)
})
