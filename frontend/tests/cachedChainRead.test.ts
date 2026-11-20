import assert from 'node:assert/strict'
import test from 'node:test'
import { BACKOFF, PUBLISH, RELEASE, type SnapshotStore } from '../lib/sdk/snapshot-cache'
import { cachedChainRead, chainReadDeps } from '../lib/server/cachedChainRead'

function database() {
  const data = new Map<string, { value: unknown; expires: number }>()
  const store: SnapshotStore = {
    async get<T>(key: string) {
      const item = data.get(key)
      if (!item || item.expires <= Date.now()) return null
      return structuredClone(item.value) as T
    },
    async set(key, value, options) {
      const existing = data.get(key)
      if (options.nx && existing && existing.expires > Date.now()) return null
      data.set(key, { value: structuredClone(value), expires: Date.now() + options.ex * 1000 })
      return 'OK'
    },
    async eval(script, keys, args) {
      if ((await store.get(keys[0])) !== args[0]) return 0
      if (script === RELEASE) { data.delete(keys[0]); return 1 }
      if (script === PUBLISH) { await store.set(keys[1], JSON.parse(String(args[1])), { ex: Number(args[2]) }); return 1 }
      if (script === BACKOFF) return store.set(keys[1], 1, { ex: Number(args[1]) })
      throw new Error('Unknown script')
    },
  }
  return store
}

function setup(t: test.TestContext, limits: Record<string, number> = {}) {
  let clock = 1_000_000
  t.mock.method(Date, 'now', () => clock)
  const store = database()
  const hits = new Map<string, number>()
  t.mock.method(chainReadDeps, 'store', () => store)
  t.mock.method(chainReadDeps, 'configured', () => true)
  t.mock.method(chainReadDeps, 'underRateLimit', async (scope: string, _ip: string, max: number) => {
    hits.set(scope, (hits.get(scope) ?? 0) + 1)
    return hits.get(scope)! <= (limits[scope] ?? max)
  })
  return { advance: (ms: number) => { clock += ms } }
}

const request = (query = '') => new Request(`https://markee.example/api/x${query}`, { headers: { 'x-forwarded-for': '1.2.3.4' } })
type Body = { status: number; data?: unknown; stale?: boolean; error?: string }
const body = async (response: Response): Promise<Body> => ({ ...(await response.json()) as Omit<Body, 'status'>, status: response.status })

test('viewers share one chain read until it goes stale', async t => {
  setup(t)
  let loads = 0
  const load = async () => ({ value: ++loads })
  for (let i = 0; i < 5; i++) {
    const result = await body(await cachedChainRead(request(), { scope: 's', key: 'k', load }))
    assert.deepEqual(result.data, { value: 1 })
  }
  assert.equal(loads, 1)
})

test('?fresh=1 forces a chain read, but only within the per-IP forced limit', async t => {
  const { advance } = setup(t, { 's:fresh': 1 })
  let loads = 0
  const load = async () => ({ value: ++loads })
  await cachedChainRead(request(), { scope: 's', key: 'k', load })
  // A forced read only accepts data loaded after it arrived, so let time pass.
  advance(1)
  assert.deepEqual((await body(await cachedChainRead(request('?fresh=1'), { scope: 's', key: 'k', load }))).data, { value: 2 })
  assert.deepEqual((await body(await cachedChainRead(request('?fresh=1'), { scope: 's', key: 'k', load }))).data, { value: 2 },
    'a forced refresh over the limit is answered from the cache')
  assert.equal(loads, 2)
})

test('an RPC outage serves the last good payload after the normal stale window', async t => {
  const { advance } = setup(t)
  await cachedChainRead(request(), { scope: 's', key: 'k', load: async () => ({ value: 'saved' }) })
  advance(60 * 60 * 1000)
  const failing = async (): Promise<{ value: string }> => { throw new Error('RPC unavailable') }
  const result = await body(await cachedChainRead(request(), { scope: 's', key: 'k', load: failing }))
  assert.equal(result.status, 200)
  assert.equal(result.stale, true)
  assert.deepEqual(result.data, { value: 'saved' })
})

test('a failing cold read without a saved payload returns 503', async t => {
  setup(t)
  const result = await body(await cachedChainRead(request(), { scope: 's', key: 'k', load: async () => { throw new Error('RPC unavailable') } }))
  assert.equal(result.status, 503)
})

test('callers over the per-IP limit are rejected before any chain read', async t => {
  setup(t, { s: 0 })
  let loads = 0
  const result = await cachedChainRead(request(), { scope: 's', key: 'k', load: async () => ++loads })
  assert.equal(result.status, 429)
  assert.equal(loads, 0)
})

test('a rate-limit storage error still serves the cache, without forcing a refresh', async t => {
  setup(t)
  let loads = 0
  const load = async () => ({ value: ++loads })
  await cachedChainRead(request(), { scope: 's', key: 'k', load })
  t.mock.method(chainReadDeps, 'underRateLimit', async () => { throw new Error('KV unavailable') })
  const plain = await body(await cachedChainRead(request(), { scope: 's', key: 'k', load }))
  assert.equal(plain.status, 200)
  assert.deepEqual(plain.data, { value: 1 })
  const forced = await body(await cachedChainRead(request('?fresh=1'), { scope: 's', key: 'k', load }))
  assert.deepEqual(forced.data, { value: 1 }, 'an unchecked forced refresh is answered from the cache')
  assert.equal(loads, 1)
})

test('a forced read waiting on another refresh accepts it when that load began after the request', async t => {
  const { advance } = setup(t)
  await cachedChainRead(request(), { scope: 's', key: 'k', load: async () => ({ value: 'old' }) })
  advance(1)
  let started = false
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const holder = cachedChainRead(request('?fresh=1'), { scope: 's', key: 'k', load: async () => { started = true; await gate; return { value: 'new' } } })
  while (!started) await new Promise(resolve => setImmediate(resolve))
  // Arrives at the same instant the holder's load began, then waits on its lease.
  let ownLoads = 0
  const waiter = cachedChainRead(request('?fresh=1'), { scope: 's', key: 'k', load: async () => ({ value: `own ${++ownLoads}` }) })
  setTimeout(() => { advance(1000); release() }, 100)
  assert.deepEqual((await body(await holder)).data, { value: 'new' })
  assert.deepEqual((await body(await waiter)).data, { value: 'new' })
  assert.equal(ownLoads, 0, 'the waiter must not start a second chain read')
})
