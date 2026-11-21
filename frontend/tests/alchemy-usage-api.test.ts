import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAlchemyUsage } from './integration/alchemy-usage-api'
import { monthlyForecast } from './integration/rpc-monthly-forecast'

const now = Date.parse('2026-11-16T00:35:00Z')
const hour = 3_600_000
const end = Math.floor(now / hour) * hour
const config = { monthlyLimitCU: 111100000, maxInputAgeHours: 24 }
function fixture() {
  const summary = {
    billingPeriod: { startTime: '2026-11-01T00:00:00Z', endTime: '2026-12-01T00:00:00Z' },
    freshness: { dataThrough: new Date(now).toISOString() },
    totals: { monthToDate: { amount: '50000000', unit: 'ALCHEMY_COMPUTE_UNIT' }, last7Days: { amount: '21000000', unit: 'ALCHEMY_COMPUTE_UNIT' } },
  }
  const query = { startTime: new Date(end - 24 * hour).toISOString(), endTime: new Date(end).toISOString(), granularity: 'hour', products: ['SUPERNODE_CU'], metrics: ['amount'] }
  const rows = Array.from({ length: 24 }, (_, i) => ({ startTime: new Date(end - (24 - i) * hour).toISOString(), endTime: new Date(end - (23 - i) * hour).toISOString(), isPartial: false, amount: '125000', unit: 'ALCHEMY_COMPUTE_UNIT' }))
  const hourly = { query, freshness: summary.freshness, data: rows }
  return { summary, query, hourly }
}
const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })

test('Admin API uses fixed endpoints, usage auth, no filters, and follows pagination', async () => {
  const f = fixture(), calls: { url: string; options: RequestInit }[] = []
  const fetcher = (async (url: string, options: RequestInit) => {
    calls.push({ url, options })
    if (calls.length === 1) return json(f.summary)
    if (calls.length === 2) return json({ ...f.hourly, data: f.hourly.data.slice(0, 12), cursor: 'next-page' })
    return json({ ...f.hourly, data: f.hourly.data.slice(12) })
  }) as typeof fetch
  const usage = await fetchAlchemyUsage('test-access-key', fetcher)
  assert.deepEqual(calls.map(c => c.url), ['summary', 'time-series', 'time-series'].map(p => `https://admin-api.alchemy.com/v1/usage/${p}`))
  assert.deepEqual(JSON.parse(calls[1].options.body as string), f.query)
  assert.deepEqual(JSON.parse(calls[2].options.body as string), { ...f.query, cursor: 'next-page' })
  for (const { options } of calls) {
    assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer test-access-key')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal)
  }
  assert.equal(usage.hourly.data.length, 24)
  const forecast = monthlyForecast(usage, config, now)
  assert.equal(forecast.source, 'alchemy-admin-api')
  assert.equal(forecast.status, 'passed')
})

test('missing key makes no request; HTTP and transport errors do not expose credentials', async () => {
  let calls = 0
  const failure = (async () => { calls++; throw new Error('test-access-key') }) as typeof fetch
  await assert.rejects(fetchAlchemyUsage('', failure), /Set the ALCHEMY_ADMIN_ACCESS_KEY/)
  assert.equal(calls, 0)
  await assert.rejects(fetchAlchemyUsage('test-access-key', failure), { message: 'Alchemy summary request failed (network or timeout)' })
  await assert.rejects(fetchAlchemyUsage('test-access-key', (async () => new Response('test-access-key', { status: 403 })) as typeof fetch), { message: 'Alchemy summary returned HTTP 403' })
})

test('pagination cannot loop or change account scope', async () => {
  for (const changedScope of [false, true]) {
    const f = fixture(); let calls = 0
    const fetcher = (async () => {
      if (++calls === 1) return json(f.summary)
      return json({ ...f.hourly, query: calls > 2 && changedScope ? { ...f.query, filters: { appIds: ['other-app'] } } : f.query, data: [], cursor: 'repeated' })
    }) as typeof fetch
    await assert.rejects(fetchAlchemyUsage('test-access-key', fetcher), changedScope ? /changed query scope/ : /pagination cursor/)
  }
})

test('missing and partial Admin API buckets cannot produce a passing forecast', async () => {
  for (const partial of [false, true]) {
    const f = fixture(); let calls = 0
    if (partial) f.hourly.data[23].isPartial = true
    else f.hourly.data.pop()
    const usage = await fetchAlchemyUsage('test-access-key', (async () => json(++calls === 1 ? f.summary : f.hourly)) as typeof fetch)
    assert.throws(() => monthlyForecast(usage, config, now), partial ? /Partial/ : /Missing/)
  }
})
