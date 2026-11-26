// handleKeeperRoute guards every cron route that signs with the keeper wallet: it must reject callers
// without the cron secret before touching the signer or KV, refuse malformed signer config without
// echoing it, hold the shared nonce lock for live runs (and release it after failures), and keep RPC
// error detail out of responses.
import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { NextRequest } from 'next/server'
import type { KeeperClients } from '../lib/server/keeperRoute'

const SECRET = 'cron-test-secret'
// A fixed dummy key: never funded, only used so privateKeyToAccount succeeds.
const DUMMY_KEY = `0x${'ab'.repeat(32)}`
const LOCK_KEY = 'streaming:keeper:lock'

process.env.NEXT_PUBLIC_STREAMING_FACTORY = '0x37f420fdE5c98e611EB7cb9b74ef579D84697039'
process.env.ALCHEMY_BASE_URL = 'https://rpc.test/v2/should-not-leak'
process.env.KV_REST_API_URL = 'https://kv.test'
process.env.KV_REST_API_TOKEN = 'test'

// Loaded with require() after the env above, never with a top-level import: STREAMING_ENABLED is read
// once at module load, and imports are hoisted above these assignments. node --test runs each file in
// its own process, so no other test file can load the module first; keep any import of keeperRoute (or
// anything that imports it) in this file below this point.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handleKeeperRoute } = require('../lib/server/keeperRoute') as typeof import('../lib/server/keeperRoute')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../lib/server/logger') as typeof import('../lib/server/logger')

function env(t: TestContext, vars: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]))
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : process.env[k] = v
  t.after(() => { for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : process.env[k] = v })
}

// In-memory Upstash REST, recording every command so tests can assert on the lock.
function fakeKv(t: TestContext) {
  const store = new Map<string, string>()
  const commands: string[][] = []
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (new URL(url).origin !== 'https://kv.test') throw new Error(`Unexpected fetch ${url}: only the fake KV is reachable, so a stray request fails instead of hitting the network`)
    const run = ([cmd, ...args]: string[]): unknown => {
      commands.push([cmd.toUpperCase(), ...args])
      switch (cmd.toUpperCase()) {
        case 'SET': {
          if (args.some(a => String(a).toLowerCase() === 'nx') && store.has(args[0])) return null
          store.set(args[0], args[1]); return 'OK'
        }
        case 'DEL': return args.filter(k => store.delete(k)).length
        default: throw new Error(`Unexpected KV command ${cmd}`)
      }
    }
    const body = JSON.parse(String(init?.body))
    if (url.endsWith('/pipeline') || url.endsWith('/multi-exec')) return Response.json(body.map((c: string[]) => ({ result: run(c) })))
    return Response.json({ result: run(body) })
  })
  return { store, commands }
}

const req = (headers: Record<string, string> = {}, query = '') =>
  new NextRequest(`http://localhost/api/cron/streaming-settle${query}`, { headers })
const auth = { authorization: `Bearer ${SECRET}` }

function route(run: (c: KeeperClients) => Promise<object> = async () => ({ done: 1 })) {
  const calls: KeeperClients[] = []
  return { calls, opts: { name: 'test-keeper', maxDuration: 300, run: async (c: KeeperClients) => { calls.push(c); return run(c) } } }
}

test('rejects callers without the cron secret before reading the signer or KV', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  const { commands } = fakeKv(t)
  const { calls, opts } = route()
  const attempts: Record<string, string>[] = [{}, { authorization: 'Bearer wrong' }, { 'x-keeper-secret': 'wrong' }, { authorization: SECRET.slice(0, -1) }]
  for (const headers of attempts) {
    const res = await handleKeeperRoute(req(headers), opts)
    assert.equal(res.status, 401, JSON.stringify(headers))
  }
  assert.equal(calls.length, 0)
  assert.equal(commands.length, 0)
})

test('an unset CRON_SECRET rejects everyone, including an empty bearer', async t => {
  env(t, { CRON_SECRET: undefined, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  fakeKv(t)
  const { calls, opts } = route()
  assert.equal((await handleKeeperRoute(req({ authorization: 'Bearer ' }), opts)).status, 401)
  assert.equal((await handleKeeperRoute(req({ 'x-keeper-secret': '' }), opts)).status, 401)
  assert.equal(calls.length, 0)
})

test('accepts the secret as a bearer token or x-keeper-secret header', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  fakeKv(t)
  const { calls, opts } = route()
  assert.equal((await handleKeeperRoute(req({ authorization: `bearer ${SECRET}` }), opts)).status, 200)
  assert.equal((await handleKeeperRoute(req({ 'x-keeper-secret': SECRET }), opts)).status, 200)
  assert.equal(calls.length, 2)
})

test('a missing or malformed signer fails closed without echoing the key', async t => {
  fakeKv(t)
  const { calls, opts } = route()
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: undefined })
  const missing = await handleKeeperRoute(req(auth), opts)
  assert.equal(missing.status, 500)
  assert.deepEqual(await missing.json(), { error: 'no signer configured' })

  const malformed = `0x${'cd'.repeat(31)}zz`
  process.env.KEEPER_PRIVATE_KEY = malformed
  const res = await handleKeeperRoute(req(auth), opts)
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.ok(!text.includes('cdcd'), 'response must not contain key material')
  assert.deepEqual(JSON.parse(text), { error: 'malformed signer configured' })
  assert.equal(calls.length, 0)
})

test('a dry run needs no signer, takes no lock, and gets no wallet client', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: undefined })
  const { commands } = fakeKv(t)
  const { calls, opts } = route()
  const res = await handleKeeperRoute(req(auth, '?dryRun=1'), opts)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, dryRun: true, done: 1 })
  assert.equal(calls[0].dryRun, true)
  assert.equal(calls[0].walletClient, undefined)
  assert.equal(commands.length, 0)
})

test('a live run holds the shared lock, skips while it is held, and releases it', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  const { store, commands } = fakeKv(t)
  let lockDuringRun: string | undefined
  const { calls, opts } = route(async () => { lockDuringRun = store.get(LOCK_KEY); return {} })

  const res = await handleKeeperRoute(req(auth), opts)
  assert.equal(res.status, 200)
  assert.ok(lockDuringRun, 'lock is held while the run executes')
  assert.ok(calls[0].walletClient, 'a live run gets a wallet client')
  assert.equal(calls[0].walletClient?.account?.address.length, 42)
  const set = commands.find(c => c[0] === 'SET')!
  assert.equal(set[1], LOCK_KEY)
  assert.ok(set.map(s => String(s).toLowerCase()).includes('nx'), 'the lock is taken with NX')
  assert.equal(store.has(LOCK_KEY), false, 'lock released after the run')

  store.set(LOCK_KEY, '1')
  const skipped = await handleKeeperRoute(req(auth), opts)
  assert.deepEqual(await skipped.json(), { ok: true, skipped: 'previous run still in flight' })
  assert.equal(calls.length, 1)
  assert.equal(store.get(LOCK_KEY), '1', 'a skipped run must not release another run\'s lock')
})

test('a failed run releases the lock and keeps RPC detail out of the response', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  const { store } = fakeKv(t)
  const logged: unknown[] = []
  t.mock.method(logger, 'error', async (_m: string, e: unknown) => { logged.push(e) })
  const { opts } = route(async () => { throw new Error(`HTTP request failed. URL: ${process.env.ALCHEMY_BASE_URL}`) })
  const res = await handleKeeperRoute(req(auth), opts)
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.ok(!text.includes('should-not-leak') && !text.includes('rpc.test'), text)
  assert.deepEqual(JSON.parse(text), { error: 'test-keeper run failed, see function logs' })
  assert.equal(logged.length, 1, 'full detail goes to the logs')
  assert.equal(store.has(LOCK_KEY), false, 'lock released after a failure')
})

test('a route with lockWaitMs waits for a held lock, then runs once it is released', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  const { store } = fakeKv(t)
  store.set(LOCK_KEY, 'keeper')
  const { calls, opts } = route()
  setTimeout(() => store.delete(LOCK_KEY), 20)
  const res = await handleKeeperRoute(req(auth), { ...opts, lockWaitMs: 500 })
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(store.has(LOCK_KEY), false)
})

test('a route with lockWaitMs reports a lock it never got as a failure, not a skip', async t => {
  env(t, { CRON_SECRET: SECRET, KEEPER_PRIVATE_KEY: DUMMY_KEY })
  const { store } = fakeKv(t)
  store.set(LOCK_KEY, 'keeper')
  const { calls, opts } = route()
  const res = await handleKeeperRoute(req(auth), { ...opts, lockWaitMs: 30 })
  assert.equal(res.status, 503)
  assert.equal(calls.length, 0)
  assert.equal(store.get(LOCK_KEY), 'keeper', 'the other run keeps its lock')
})
