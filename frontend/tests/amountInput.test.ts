import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEthInput, sanitizeDecimalInput } from '../components/modals/StreamUI'

test('a decimal comma is a decimal point, never dropped', () => {
  assert.equal(sanitizeDecimalInput('1,5'), '1.5')
  assert.equal(sanitizeDecimalInput('0,005'), '0.005')
  assert.equal(sanitizeDecimalInput(','), '.')
  assert.equal(parseEthInput(sanitizeDecimalInput('0,005')!), 5_000_000_000_000_000n)
})

test('mixed separators read the last one as the decimal point', () => {
  assert.equal(sanitizeDecimalInput('1,000.5'), '1000.5')
  assert.equal(sanitizeDecimalInput('1.000,5'), '1000.5')
})

test('plain decimals and spaces pass through', () => {
  assert.equal(sanitizeDecimalInput('0.01'), '0.01')
  assert.equal(sanitizeDecimalInput(' .5 '), '.5')
  assert.equal(sanitizeDecimalInput(''), '')
})

test('anything else is refused instead of rewritten', () => {
  for (const input of ['1e-3', '-1', '0x10', '1.2.3', '1,2,3', 'abc', '1234567890', '0.1234567890']) {
    assert.equal(sanitizeDecimalInput(input), null, input)
  }
})
