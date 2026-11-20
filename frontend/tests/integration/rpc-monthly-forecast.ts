import assert from 'node:assert/strict'

type ObjectValue = Record<string, any>
const HOUR = 3_600_000
function object(value: unknown, label: string): ObjectValue {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as ObjectValue
}
function timestamp(value: unknown, label: string): number {
  assert.equal(typeof value, 'string', `${label} must be an ISO timestamp`)
  const parsed = Date.parse(value as string)
  assert.ok(Number.isFinite(parsed), `Invalid ${label}`)
  return parsed
}
function cu(value: unknown, label: string): number {
  const row = object(value, label)
  assert.equal(row.unit, 'ALCHEMY_COMPUTE_UNIT', `${label} must be compute units, not USD`)
  assert.ok(typeof row.amount === 'string' && /^\d+$/.test(row.amount), `Invalid ${label} amount`)
  const amount = Number(row.amount)
  assert.ok(Number.isSafeInteger(amount), `${label} exceeds safe precision`)
  return amount
}

/** Forecast actual all-app account usage. Never subtract undeployed fixture savings. */
export function monthlyForecast(input: unknown, config: { monthlyLimitCU: number; maxInputAgeHours: number }, now = Date.now()) {
  assert.ok(Number.isSafeInteger(config.monthlyLimitCU) && config.monthlyLimitCU > 0, 'Invalid monthly CU limit')
  assert.ok(Number.isFinite(config.maxInputAgeHours) && config.maxInputAgeHours > 0, 'Invalid freshness limit')
  const source = object(input, 'MCP export')
  assert.equal(source.source, 'alchemy-mcp', 'Usage must come from Alchemy MCP')
  assert.equal(source.account, 'Markee', 'Expected the Markee connection')
  assert.equal(source.scope, 'all-apps', 'Forecast must include all apps sharing the limit')
  const summary = object(source.summary, 'summary')
  const period = object(summary.billingPeriod, 'billing period')
  const start = timestamp(period.startTime, 'period start'), end = timestamp(period.endTime, 'period end')
  assert.ok(start < end && now >= start && now < end, 'Usage export is not for the current billing period')
  const asOf = timestamp(object(summary.freshness, 'summary freshness').dataThrough, 'summary dataThrough')
  assert.ok(asOf > start && asOf <= end && asOf <= now + 5 * 60_000, 'Invalid summary observation time')
  assert.ok(now - asOf <= config.maxInputAgeHours * HOUR, 'Usage export is stale; refresh Alchemy MCP data')
  const totals = object(summary.totals, 'totals')
  const usedCU = cu(totals.monthToDate, 'month-to-date'), last7DaysCU = cu(totals.last7Days, 'last seven days')
  const series = object(source.hourly, 'hourly usage')
  const query = object(series.query, 'hourly query')
  assert.equal(query.granularity, 'hour', 'Expected hourly buckets')
  assert.deepEqual(query.products, ['SUPERNODE_CU'], 'Unexpected product scope')
  assert.deepEqual(query.metrics, ['amount'], 'Expected native CU metric')
  assert.ok(!query.groupBy || query.groupBy.length === 0, 'Use ungrouped all-app totals')
  assert.ok(!query.filters || Object.keys(query.filters).length === 0, 'Filtered usage would omit account spend')
  const windowStart = timestamp(query.startTime, 'hourly start'), windowEnd = timestamp(query.endTime, 'hourly end')
  assert.equal(windowEnd - windowStart, 24 * HOUR, 'Need a complete 24-hour window')
  assert.ok(windowEnd <= now && windowEnd <= asOf && asOf - windowEnd < 2 * HOUR, 'Hourly window must end at the latest complete hour')
  const through = timestamp(object(series.freshness, 'hourly freshness').dataThrough, 'hourly dataThrough')
  assert.ok(through >= windowEnd, 'Provider has not completed the requested window')
  assert.ok(Array.isArray(series.data) && series.data.length === 24, 'Missing or duplicate hourly buckets')
  const rows = [...series.data].sort((a, b) => timestamp(a.startTime, 'bucket start') - timestamp(b.startTime, 'bucket start'))
  let last24HoursCU = 0
  rows.forEach((value, index) => {
    const row = object(value, 'bucket')
    assert.equal(row.isPartial, false, 'Partial hourly bucket cannot support a forecast')
    assert.equal(timestamp(row.startTime, 'bucket start'), windowStart + index * HOUR, 'Gap or duplicate in hourly usage')
    assert.equal(timestamp(row.endTime, 'bucket end'), windowStart + (index + 1) * HOUR, 'Invalid bucket duration')
    assert.ok(!row.dimensions || Object.keys(row.dimensions).length === 0, 'Grouped buckets could omit usage')
    last24HoursCU += cu(row, 'hourly bucket')
  })
  const ratesCUPerHour = { monthToDate: usedCU / ((asOf - start) / HOUR), last7Days: last7DaysCU / (7 * 24), last24Hours: last24HoursCU / 24 }
  const selectedRate = Math.max(...Object.values(ratesCUPerHour))
  const remainingHours = (end - asOf) / HOUR
  const projectedMonthEndCU = Math.ceil(usedCU + selectedRate * remainingHours)
  return {
    status: projectedMonthEndCU <= config.monthlyLimitCU ? 'passed' as const : 'over-limit' as const,
    source: 'alchemy-mcp', account: 'Markee', scope: 'all-apps', asOf: new Date(asOf).toISOString(),
    billingPeriod: { startTime: period.startTime, endTime: period.endTime },
    monthlyLimitCU: config.monthlyLimitCU, usedCU, remainingHours, last24HoursCU,
    ratesCUPerHour, selectedRateCUPerHour: selectedRate,
    method: 'used + max(month-to-date, last-7-days, last-24-hours hourly rate) * remaining hours',
    projectedMonthEndCU, headroomCU: config.monthlyLimitCU - projectedMonthEndCU,
    remainingAllowanceCU: config.monthlyLimitCU - usedCU,
    maxAffordableCUPerHour: (config.monthlyLimitCU - usedCU) / remainingHours,
    hypotheticalSavingsIncluded: false,
  }
}
