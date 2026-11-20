import test from 'node:test'
import assert from 'node:assert/strict'
import { monthlyForecast } from './integration/rpc-monthly-forecast'

const hour = 3_600_000
const asOf = Date.parse('2026-11-16T00:00:00Z')
const config = { monthlyLimitCU: 111100000, maxInputAgeHours: 24 }
function input() {
  return {
    source: 'alchemy-mcp', account: 'Markee', scope: 'all-apps',
    summary: {
      billingPeriod: { startTime: '2026-11-01T00:00:00Z', endTime: '2026-12-01T00:00:00Z' },
      freshness: { dataThrough: new Date(asOf).toISOString() },
      totals: { monthToDate: { amount: '50000000', unit: 'ALCHEMY_COMPUTE_UNIT' }, last7Days: { amount: '21000000', unit: 'ALCHEMY_COMPUTE_UNIT' } },
    },
    hourly: {
      query: { startTime: new Date(asOf - 24 * hour).toISOString(), endTime: new Date(asOf).toISOString(), granularity: 'hour', products: ['SUPERNODE_CU'], metrics: ['amount'], groupBy: [] as string[], filters: {} as Record<string, unknown> },
      freshness: { dataThrough: new Date(asOf).toISOString() },
      data: Array.from({ length: 24 }, (_, i) => ({ startTime: new Date(asOf - (24 - i) * hour).toISOString(), endTime: new Date(asOf - (23 - i) * hour).toISOString(), isPartial: false, amount: '125000', unit: 'ALCHEMY_COMPUTE_UNIT' })),
    },
  }
}

test('monthly gate includes already spent CU and uses actual billing-period duration', () => {
  const result = monthlyForecast(input(), config, asOf)
  assert.equal(result.projectedMonthEndCU, 100000000)
  assert.equal(result.status, 'passed')
  assert.equal(result.headroomCU, 11100000)
  assert.equal(result.hypotheticalSavingsIncluded, false)
  assert.equal(monthlyForecast(input(), { ...config, monthlyLimitCU: 100000000 }, asOf).status, 'passed')
  assert.equal(monthlyForecast(input(), { ...config, monthlyLimitCU: 99999999 }, asOf).status, 'over-limit')
})

test('recent traffic spikes can fail the limit even when the month-to-date average passes', () => {
  const data = input()
  data.hourly.data.forEach(row => { row.amount = '250000' })
  const result = monthlyForecast(data, config, asOf)
  assert.equal(result.projectedMonthEndCU, 140000000)
  assert.equal(result.status, 'over-limit')
  assert.equal(result.selectedRateCUPerHour, 250000)
})

test('seven-day usage is included and no hypothetical optimization credit can hide an overrun', () => {
  const data = { ...input(), hypotheticalSavingsCU: 100000000 }
  data.summary.totals.last7Days.amount = '50400000'
  assert.equal(monthlyForecast(data, config, asOf).projectedMonthEndCU, 158000000)
})

test('missing, stale, future or previous-period evidence cannot pass', () => {
  assert.throws(() => monthlyForecast(null, config, asOf))
  assert.throws(() => monthlyForecast(input(), config, asOf + 25 * hour), /stale/)
  assert.throws(() => monthlyForecast(input(), config, asOf - hour), /observation time/)
  assert.throws(() => monthlyForecast(input(), config, Date.parse('2026-12-01T00:00:00Z')), /current billing period/)
})

test('server-only or filtered exports cannot omit other apps sharing the monthly limit', () => {
  const data = input()
  data.scope = 'server-only'
  assert.throws(() => monthlyForecast(data, config, asOf), /all apps/)
  data.scope = 'all-apps'; data.hourly.query.filters = { appIds: ['server'] }
  assert.throws(() => monthlyForecast(data, config, asOf), /Filtered/)
})

test('gaps, duplicate or partial buckets and wrong units invalidate the forecast', () => {
  const gap = input(); gap.hourly.data.pop()
  assert.throws(() => monthlyForecast(gap, config, asOf), /Missing/)
  const duplicate = input(); duplicate.hourly.data[1] = { ...duplicate.hourly.data[0] }
  assert.throws(() => monthlyForecast(duplicate, config, asOf), /Gap or duplicate/)
  const partial = input(); partial.hourly.data[23].isPartial = true
  assert.throws(() => monthlyForecast(partial, config, asOf), /Partial/)
  const usd = input(); usd.summary.totals.monthToDate.unit = 'USD'
  assert.throws(() => monthlyForecast(usd, config, asOf), /not USD/)
  const badAmount = input(); badAmount.summary.totals.monthToDate.amount = '-1'
  assert.throws(() => monthlyForecast(badAmount, config, asOf), /amount/)
})
