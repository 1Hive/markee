import assert from 'node:assert/strict'
import test from 'node:test'
import { farFromCurrentWarning, parseEthAmountInput } from '../lib/leaderboard/ethAmount'

test('accepts plain decimal amounts', () => {
  assert.equal(parseEthAmountInput('0.01').wei, 10_000_000_000_000_000n)
  assert.equal(parseEthAmountInput(' 1 ').wei, 10n ** 18n)
  assert.equal(parseEthAmountInput('.5').wei, 5n * 10n ** 17n)
  assert.equal(parseEthAmountInput('0.000000000000000001').wei, 1n)
})

test('rejects amounts that round to zero wei', () => {
  assert.ok(parseEthAmountInput('0.0000000000000000001').error)
  assert.ok(parseEthAmountInput('0').error)
  assert.ok(parseEthAmountInput('0.000').error)
})

test('rejects non-decimal notation instead of passing it to the contract', () => {
  for (const input of ['1e-3', '1,5', '-1', '0x10', '', '.', '1.2.3', 'Infinity']) {
    assert.ok(parseEthAmountInput(input).error, input)
  }
})

test('warns on prices far from the current one', () => {
  const current = 10n ** 15n
  assert.equal(farFromCurrentWarning(current * 2n, current), null)
  assert.equal(farFromCurrentWarning(current / 2n, current), null)
  assert.ok(farFromCurrentWarning(current * 100n, current))
  assert.ok(farFromCurrentWarning(100_000_000_000_000_000_000n * 10n ** 18n, current))
  assert.ok(farFromCurrentWarning(current / 100n, current))
  assert.equal(farFromCurrentWarning(current, 0n), null)
})
