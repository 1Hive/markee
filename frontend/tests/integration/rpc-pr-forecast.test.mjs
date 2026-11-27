import assert from 'node:assert/strict'
import test from 'node:test'
import { compareRpcFixtures, projectRegression } from './rpc-pr-forecast.mjs'

const now = Date.parse('2026-11-26T00:00:00Z')
const config = { monthlyLimitCU: 10000, maxInputAgeHours: 24 }
const live = {
  status: 'passed', source: 'alchemy-admin-api', account: 'Markee', scope: 'all-apps',
  asOf: '2026-11-26T00:00:00Z', billingPeriod: {
    startTime: '2026-11-01T00:00:00Z', endTime: '2026-11-27T00:00:00Z',
  }, projectedMonthEndCU: 9900, monthlyLimitCU: 10000,
}
const fixture = estimatedCU => ({
  schemaVersion: 2, status: 'fixtures-only', mode: 'deterministic-fixture', members: 1000,
  results: ['warm', 'edit', 'hourly-reconcile'].map(scenario => ({ scenario, estimatedCU })),
})

test('flags a PR that adds CU and crosses the budget', () => {
  const result = projectRegression(live, fixture(10), fixture(11), config, now)
  assert.equal(result.addedCU, 288)
  assert.equal(result.status, 'regression-over-limit')
})
test('distinguishes unchanged over-budget usage and does not credit savings', () => {
  const result = projectRegression({ ...live, status: 'over-limit', projectedMonthEndCU: 10200 },
    fixture(10), fixture(8), config, now)
  assert.equal(result.status, 'baseline-over-limit')
  assert.equal(result.addedCU, 0)
})
test('rejects stale evidence and mismatched fixture sizes', () => {
  assert.throws(() => projectRegression({ ...live, asOf: '2026-11-24T00:00:00Z' },
    fixture(10), fixture(11), config, now), /stale/)
  assert.throws(() => projectRegression(live, fixture(10), { ...fixture(11), members: 999 },
    config, now), /not comparable/)
})

test('gates the live forecast on RPC changes, including method changes with equal estimates', () => {
  const base = fixture(10)
  base.results[0].methods = { eth_call: 1 }
  const candidate = structuredClone(base)
  candidate.results.reverse()
  assert.equal(compareRpcFixtures(base, candidate).changed, false)
  candidate.results[2].methods = { eth_getLogs: 1 }
  assert.equal(compareRpcFixtures(base, candidate).changed, true)
  assert.equal(compareRpcFixtures(fixture(10), fixture(9)).changed, true)
})
