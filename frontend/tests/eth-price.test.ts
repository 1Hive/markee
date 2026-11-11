// getEthPriceUsd treats the KV cache as optional: with KV unconfigured (the @vercel/kv proxy throws
// synchronously on property access) or with every KV request rejecting, it must still fetch the
// price from a provider and return it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const KV_URL = 'https://kv.invalid'
const PRICE = 3123.45

let providerRequests = 0
let kvRequests = 0
let providerDelayMs = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.hostname === new URL(KV_URL).hostname) {
    kvRequests++
    throw new TypeError('fetch failed')
  }
  providerRequests++
  if (providerDelayMs) await new Promise(resolve => setTimeout(resolve, providerDelayMs))
  if (url.hostname === 'api.coingecko.com') return Response.json({ ethereum: { usd: PRICE } })
  return new Response('unexpected', { status: 500 })
}) as typeof fetch

const savedUrl = process.env.KV_REST_API_URL
const savedToken = process.env.KV_REST_API_TOKEN

test('returns the provider price when KV is not configured', async () => {
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
  providerRequests = 0
  // Fresh import so the @vercel/kv proxy has not created a client yet.
  const { getEthPriceUsd } = await import('../lib/server/ethPrice')
  assert.equal(await getEthPriceUsd(), PRICE)
  assert.equal(providerRequests, 1, 'the provider must still be asked')
})

test('concurrent cache misses share one provider request', async () => {
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
  providerRequests = 0
  providerDelayMs = 50
  const { getEthPriceUsd } = await import('../lib/server/ethPrice')
  const prices = await Promise.all([getEthPriceUsd(), getEthPriceUsd(), getEthPriceUsd()])
  providerDelayMs = 0
  assert.deepEqual(prices, [PRICE, PRICE, PRICE])
  assert.equal(providerRequests, 1)
})

test('a listing waits for slow providers only up to its limit', async () => {
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
  const { getEthPriceUsdWithin } = await import('../lib/server/ethPrice')
  providerDelayMs = 300
  const started = Date.now()
  assert.equal(await getEthPriceUsdWithin(50), null, 'no price within the limit')
  assert.ok(Date.now() - started < 250, 'returned without waiting for the provider')
  providerDelayMs = 0
  assert.equal(await getEthPriceUsdWithin(1_000), PRICE)
})

// Last: it leaves a KV client pointed at an unreachable host (the client retries with backoff).
test('returns the provider price when KV requests reject', async () => {
  process.env.KV_REST_API_URL = KV_URL
  process.env.KV_REST_API_TOKEN = 'test-token'
  providerRequests = 0
  kvRequests = 0
  const { getEthPriceUsd } = await import('../lib/server/ethPrice')
  assert.equal(await getEthPriceUsd(), PRICE)
  assert.equal(providerRequests, 1, 'the provider must still be asked')
  assert.ok(kvRequests >= 2, 'both the cache read and the cache write should have been attempted')
})

test.after(() => {
  globalThis.fetch = realFetch
  if (savedUrl === undefined) delete process.env.KV_REST_API_URL
  else process.env.KV_REST_API_URL = savedUrl
  if (savedToken === undefined) delete process.env.KV_REST_API_TOKEN
  else process.env.KV_REST_API_TOKEN = savedToken
})
