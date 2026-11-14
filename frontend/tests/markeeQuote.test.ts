import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEther, zeroAddress, type Address } from 'viem'
import {
  buyerPayAmount, directPayPlan, formatMarkeeEstimate, markeeEstimateHeadline, markeePayPlan, mintFloorTokens,
  quotePayPlan, settlementPayPlan, type RevnetRoute,
} from '../lib/markee/quote'
import { estimateLeaderboardPurchaseMarkeeTokens } from '../lib/tokenPhases'

const buyer = '0x1111111111111111111111111111111111111111' as Address
const fee = '0x2222222222222222222222222222222222222222' as Address
const route: RevnetRoute = {
  revnetEnabled: true, beneficiary: '0x3333333333333333333333333333333333333333', beneficiaryBps: 6200n,
  feeReceiver: fee, feeBps: 3800n, terminal: '0x130f5Dd2bD8805443Cf41755253D778a75a67f53', projectId: 7n,
}
const now = Date.parse('2026-11-13T00:00:00Z')

test('a board purchase pays the fee receiver first and the buyer second, as Markee.pay does', () => {
  const plan = markeePayPlan(parseEther('0.001'), route, buyer)
  assert.deepEqual(plan.pays, [
    { amount: 144400000000000n, beneficiary: fee },
    { amount: 235600000000000n, beneficiary: buyer },
  ])
  assert.equal(plan.buyerIndex, 1)
})

test('no MARKEE is routed without RevNet, without a beneficiary, or without a fee receiver taking a cut', () => {
  assert.equal(markeePayPlan(parseEther('1'), { ...route, revnetEnabled: false }, buyer).buyerIndex, null)
  assert.equal(markeePayPlan(parseEther('1'), { ...route, beneficiary: zeroAddress }, buyer).buyerIndex, null)
  const noFee = markeePayPlan(parseEther('1'), { ...route, feeReceiver: zeroAddress }, buyer)
  assert.deepEqual(noFee.pays, [{ amount: parseEther('0.38'), beneficiary: buyer }])
  assert.throws(() => markeePayPlan(1n, { ...route, beneficiaryBps: 10_001n }, buyer))
})

test('a stream settlement pays the backer before the fee', () => {
  const plan = settlementPayPlan(parseEther('1'), route, buyer)
  assert.equal(plan.pays[0].beneficiary, buyer)
  assert.equal(plan.buyerIndex, 0)
  assert.equal(buyerPayAmount(plan), 235600000000000000n)
})

test('the mint floor equals the issuance-rate figure for the same split', () => {
  const floor = mintFloorTokens(markeePayPlan(parseEther('0.001'), route, buyer), now)
  assert.ok(Math.abs(floor - estimateLeaderboardPurchaseMarkeeTokens(0.001, now)) < 1e-9)
  assert.ok(Math.abs(mintFloorTokens(directPayPlan(parseEther('0.001'), route.terminal, 7n, buyer), now) - 7.75) < 1e-9)
})

test('the quote simulates every payment in order and returns the buyer payment output', async () => {
  let seen: { calls: { value: bigint }[]; stateOverrides: { balance: bigint }[] } | undefined
  const client = { simulateCalls: async (args: typeof seen) => {
    seen = args
    return { results: [{ status: 'success', result: 3n }, { status: 'success', result: 9443427541423725376n }] }
  } }
  const plan = markeePayPlan(parseEther('0.001'), route, buyer)
  assert.equal(await quotePayPlan(client as never, plan, buyer), 9443427541423725376n)
  assert.deepEqual(seen!.calls.map(c => c.value), [144400000000000n, 235600000000000n])
  assert.ok(seen!.stateOverrides[0].balance > parseEther('0.001'))
  const failing = { simulateCalls: async () => ({ results: [{ status: 'failure', error: new Error('paused') }, { status: 'success', result: 1n }] }) }
  await assert.rejects(quotePayPlan(failing as never, plan, buyer), /paused/)
})

test('labels never present more than the floor as guaranteed', () => {
  assert.equal(formatMarkeeEstimate({ quoted: 9.443, floor: 1.826 }), '~9.443 MARKEE (at least 1.826)')
  assert.equal(formatMarkeeEstimate({ quoted: 91.295, floor: 91.295 }), '91.3 MARKEE')
  assert.equal(formatMarkeeEstimate({ quoted: null, floor: 1.826 }), 'at least 1.826 MARKEE')
  assert.equal(formatMarkeeEstimate({ quoted: null, floor: null }), null)
  assert.deepEqual(markeeEstimateHeadline({ quoted: null, floor: null, loading: true }), { headline: '…', note: null })
  assert.deepEqual(markeeEstimateHeadline({ quoted: null, floor: 1.826 }), { headline: '≥ 1.826', note: null })
})
