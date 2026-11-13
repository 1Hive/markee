import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeFunctionData, parseAbi, type Address } from 'viem'
import { bufferFor, buildOpenStreamOps, computeAutoDeposit, depositShortfall } from '../lib/superfluid/streaming'

const rate = 380_517_503n
const a = '0x1111111111111111111111111111111111111111' as Address

test('the shortfall is only what the held deposit does not cover', () => {
  const buffer = bufferFor(rate)
  assert.equal(depositShortfall(rate, 0n), buffer)
  assert.equal(depositShortfall(rate, buffer / 2n), buffer - buffer / 2n)
  assert.equal(depositShortfall(rate, buffer * 3n), 0n)
})

test('auto deposit with no held deposit behaves as before', () => {
  const buffer = bufferFor(rate)
  const rich = computeAutoDeposit(buffer * 10n, rate, 10n ** 18n)
  assert.equal(rich.wrapValue, 0n)
  assert.equal(rich.prefund, buffer * 9n)
})

test('a held deposit is not pulled again, so the wallet keeps that ETHx', () => {
  const buffer = bufferFor(rate)
  const reused = computeAutoDeposit(buffer * 10n, rate, 10n ** 18n, buffer)
  assert.equal(reused.wrapValue, 0n)
  assert.equal(reused.prefund, buffer * 10n)
})

test('the open batch skips depositBuffer when the board already holds enough', () => {
  const ops = (buffer: bigint) => buildOpenStreamOps({ ethx: a, board: a, markee: a, backer: a, ratePerSec: rate, buffer, cfaAgreement: a, gdaAgreement: a, pool: a, wrapValue: 0n })
  const abi = parseAbi(['function depositBuffer(address,uint256)'])
  const hasDeposit = (list: ReturnType<typeof ops>) => list.some(op => { try { return decodeFunctionData({ abi, data: op.data }).functionName === 'depositBuffer' } catch { return false } })
  assert.equal(hasDeposit(ops(bufferFor(rate))), true)
  assert.equal(hasDeposit(ops(0n)), false)
})
