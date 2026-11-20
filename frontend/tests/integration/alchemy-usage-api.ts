import assert from 'node:assert/strict'

const BASE = 'https://admin-api.alchemy.com/v1/usage'
const HOUR = 3_600_000

/** Usage-read access key for the Markee team; never an app RPC key. */
export async function fetchAlchemyUsage(key: string, fetcher: typeof fetch = fetch) {
  if (!key.trim()) throw new Error('Set the ALCHEMY_ADMIN_ACCESS_KEY GitHub Actions secret')
  async function request(path: string, body?: object) {
    let response: Response
    try {
      response = await fetcher(`${BASE}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error', signal: AbortSignal.timeout(30_000),
      })
    } catch { throw new Error(`Alchemy ${path} request failed (network or timeout)`) }
    // Never echo provider bodies, request headers or errors containing credentials.
    if (!response.ok) throw new Error(`Alchemy ${path} returned HTTP ${response.status}`)
    let payload: any
    try { payload = await response.json() } catch { throw new Error(`Alchemy ${path} returned invalid JSON`) }
    assert.ok(payload?.data && typeof payload.data === 'object', 'Missing Alchemy usage data')
    return payload.data
  }
  const summary = await request('summary')
  const asOf = Date.parse(summary.freshness?.dataThrough)
  assert.ok(Number.isFinite(asOf), 'Missing Alchemy summary observation time')
  const end = Math.floor(asOf / HOUR) * HOUR
  const query = { startTime: new Date(end - 24 * HOUR).toISOString(), endTime: new Date(end).toISOString(), granularity: 'hour', products: ['SUPERNODE_CU'], metrics: ['amount'] }
  const hourly = await request('time-series', query)
  assert.ok(Array.isArray(hourly.data), 'Missing hourly usage buckets')
  const rows = [...hourly.data]
  const cursors = new Set<string>()
  let cursor = hourly.cursor
  while (cursor) {
    assert.ok(typeof cursor === 'string' && !cursors.has(cursor) && cursors.size < 48, 'Invalid Alchemy pagination cursor')
    cursors.add(cursor)
    const page = await request('time-series', { ...query, cursor })
    assert.deepEqual(page.query, hourly.query, 'Alchemy pagination changed query scope')
    assert.ok(Array.isArray(page.data), 'Missing hourly usage page')
    assert.ok(Date.parse(page.freshness?.dataThrough) >= end, 'Incomplete hourly usage page')
    rows.push(...page.data)
    cursor = page.cursor
  }
  return { source: 'alchemy-admin-api', account: 'Markee', scope: 'all-apps', summary, hourly: { ...hourly, cursor: undefined, data: rows } }
}
