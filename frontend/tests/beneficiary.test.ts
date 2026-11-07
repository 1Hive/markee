import assert from 'node:assert/strict'
import test from 'node:test'
import { beneficiaryError, isPayableBeneficiary, isZeroAddress } from '../lib/beneficiary'

const wallet = '0x1111111111111111111111111111111111111111'
const zero = '0x0000000000000000000000000000000000000000'

test('a real wallet is a payable beneficiary, even with pasted whitespace', () => {
  assert.equal(beneficiaryError(wallet), null)
  assert.equal(isPayableBeneficiary(`  ${wallet}\n`), true)
})

test('the zero address is rejected with its own reason', () => {
  assert.match(beneficiaryError(zero)!, /zero address/)
  assert.equal(isPayableBeneficiary(zero), false)
  assert.equal(isZeroAddress(` ${zero} `), true)
})

test('malformed input is rejected', () => {
  for (const value of ['', undefined, null, '0x123', `${wallet}0`, 'vitalik.eth']) assert.equal(isPayableBeneficiary(value), false)
})
