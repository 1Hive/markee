import assert from 'node:assert/strict'
import test from 'node:test'
import { buyerBoards, ownedMessageSpend, walletSpend } from '../lib/account/spend'

const eth = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n

test('a Sale message counts its total and a Rent message counts what was streamed to it', () => {
  assert.equal(ownedMessageSpend({ strategy: 'fixed', totalFundsAdded: eth(0.2) }), eth(0.2))
  assert.equal(ownedMessageSpend({ strategy: 'streaming', totalFundsAdded: 0n, rentSpent: eth(0.17) }), eth(0.17))
  assert.equal(ownedMessageSpend({ strategy: 'streaming', totalFundsAdded: eth(0.05), rentSpent: eth(0.1) }), eth(0.15))
})

test('an unknown Rent spend makes the wallet total unavailable rather than low', () => {
  assert.equal(ownedMessageSpend({ strategy: 'streaming', totalFundsAdded: 0n, rentSpent: null }), null)
  assert.equal(walletSpend([{ strategy: 'streaming', totalFundsAdded: 0n }], []), null)
})

test('wallet spend adds owned messages and only its own contributions to others', () => {
  const total = walletSpend(
    [{ strategy: 'fixed', totalFundsAdded: eth(0.2) }, { strategy: 'streaming', totalFundsAdded: 0n, rentSpent: eth(0.17) }],
    [{ totalContributed: eth(0.01).toString() }],
  )
  assert.equal(total, eth(0.38))
})

test('buyer boards include boards the wallet only funds', () => {
  assert.deepEqual(buyerBoards([{ strategyId: '0xAA' }], [{ strategyId: '0xaa' }, { strategyId: '0xBB' }]), ['0xaa', '0xbb'])
})
