import assert from 'node:assert/strict'
import test from 'node:test'
import { createDisplayCache, displayKey, INVALIDATE, snapshotStorage } from '../lib/sdk/cached-display'
import {
  BACKOFF,
  createSnapshotCache,
  PUBLISH,
  RELEASE,
  SnapshotUnavailable,
  type SnapshotStore,
} from '../lib/sdk/snapshot-cache'

function database() {
  let clock = 100000
  const data = new Map<string, { value: unknown; expires: number }>()
  const store: SnapshotStore = {
    async get<T>(key: string) {
      const item = data.get(key)
      if (!item || item.expires <= clock) return null
      return structuredClone(item.value) as T
    },
    async set(key, value, options) {
      if (options.nx && (await store.get(key)) != null) return null
      // The fake's SET must be atomic, like Redis SET NX.
      const existing = data.get(key)
      if (options.nx && existing && existing.expires > clock) return null
      data.set(key, { value: structuredClone(value), expires: clock + options.ex * 1000 })
      return 'OK'
    },
    async eval(script, keys, args) {
      if (script === INVALIDATE) {
        if (await store.get(keys[1])) return 0
        await store.set(keys[0], args[0], { ex: 100000000 })
        await store.set(keys[1], 1, { ex: 604800 })
        return 1
      }
      if ((await store.get(keys[0])) !== args[0]) return 0
      if (script === RELEASE) {
        data.delete(keys[0])
        return 1
      }
      if (script === PUBLISH) {
        await store.set(keys[1], JSON.parse(String(args[1])), { ex: Number(args[2]) })
        return 1
      }
      if (script === BACKOFF) return store.set(keys[1], 1, { ex: Number(args[1]) })
      throw new Error('Unknown script')
    },
  }
  return {
    store,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

test('display identities isolate boards, chains, accounts and paginated pages', () => {
  const p = { kind: 'board' as const, chainId: 8453, address: '0xAb' as const }
  const first = displayKey(p, '0xCd', 0)
  assert.equal(first, displayKey({ ...p, address: '0xab' }, '0xcd', 0))
  assert.equal(new Set([first, displayKey(p), displayKey(p, '0xef', 0), displayKey(p, '0xCd', 20), displayKey({ ...p, chainId: 11155111 }, '0xCd', 0), displayKey({ ...p, address: '0xef' }, '0xCd', 0)]).size, 6)
})

test('community display reads share the cache without caching authorization or quotes', async t => {
  const { GET } = await import('../lib/sdk/gardens/community')
  const { markeeAdapter } = await import('../lib/sdk/gardens/revenue')
  const { NextRequest } = await import('next/server')
  const db = database()
  t.mock.method(snapshotStorage, 'get', () => db.store)
  let calls = 0
  t.mock.method(markeeAdapter, 'getCommunityIntegration', async () => {
    calls++
    return { integration: { status: 'not_integrated', leaderboardAddress: null, vaultAddress: null }, markeeChainId: 8453, revenue: { claimableAmount: String(calls), symbol: 'ETH' } }
  })
  const previous = { KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN }
  process.env.KV_REST_API_URL = 'https://unused.example'
  process.env.KV_REST_API_TOKEN = 'test'
  const request = () => new NextRequest('https://markee.example/api/sdk/v1/community?chainId=100&community=0x1111111111111111111111111111111111111111')
  try {
    assert.equal((await GET(request())).status, 200)
    assert.equal((await (await GET(request())).json()).revenue.claimableAmount, '1')
    assert.equal(calls, 1)
    await createDisplayCache(db.store).invalidate('8453:verified-admin-receipt')
    assert.equal((await (await GET(request())).json()).revenue.claimableAmount, '2')
    assert.equal(calls, 2)
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})

test('verified invalidation fences in-flight loads and replay cannot evict rebuilt data', async () => {
  const db = database()
  const cache = createDisplayCache(db.store, db.now)
  let release!: () => void
  let started = false
  const old = cache.read('rent', async () => {
    started = true
    await new Promise<void>(resolve => { release = resolve })
    return 'old'
  })
  while (!started) await new Promise(resolve => setImmediate(resolve))
  await cache.invalidate('8453:0xreceipt')
  assert.equal((await cache.read('rent', async () => 'new')).data, 'new')
  release()
  await old
  await cache.invalidate('8453:0xreceipt')
  assert.equal((await cache.read('rent', async () => 'unexpected')).data, 'new')
})

test('SDK snapshots preserve both sale and rent and reuse cached on-chain reads', async t => {
  const { snapshot, snapshotReaders, communityPermissions } = await import('../lib/sdk/snapshot')
  const { getEnvPublicClient } = await import('../lib/sdk/chains')
  const { signEnvelope, verifyTransaction, prepare } = await import('../lib/sdk/transactions')
  const { getMarkeeEthxAddress } = await import('../lib/sdk/gardens/streaming')
  const { zeroAddress } = await import('viem')
  const db = database()
  t.mock.method(snapshotStorage, 'get', () => db.store)
  t.mock.method(snapshotReaders, 'presentation', async () => ({ flags: [], views: [], metadata: null }))
  const previous = { KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN }
  process.env.KV_REST_API_URL = 'https://unused.example'
  process.env.KV_REST_API_TOKEN = 'test'
  const client = getEnvPublicClient(8453)
  const account = '0x1111111111111111111111111111111111111111' as const
  const sale = '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' as const
  const rent = '0x0590b56430426A38D0fA065b839c10D542E75CCD' as const
  let reads = 0
  let version = '1.3.0'
  let council = account
  t.mock.method(client, 'getBalance', async () => 1000n)
  t.mock.method(client, 'getBlockNumber', async () => 100n)
  t.mock.method(client, 'readContract', async ({ functionName }: { functionName: string }) => {
    reads++
    const results: Record<string, unknown> = { VERSION: version, factory: zeroAddress, leaderboardName: 'Test', minimumPrice: 1n, minimumMonthlyRate: 2n, maxMessageLength: 100n, maxNameLength: 30n, revNetEnabled: true, markeeCount: 0n, getTopMarkees: [[], []], topMarkee: zeroAddress,
      ETHX: getMarkeeEthxAddress(8453), HOST: zeroAddress, getAgreementClass: zeroAddress, realtimeBalanceOfNow: [100n, 0n, 0n, 123n], getFlow: [0n, 3n, 0n, 0n], backerMarkee: zeroAddress, backerDeposit: 4n, pendingSettlement: 5n, getNetFlow: -3n, balanceOf: 6n, councilSafe: council }
    if (!(functionName in results)) throw new Error(`Unexpected read ${functionName}`)
    return results[functionName]
  })
  try {
    for (const [board, strategy, minimum] of [[sale, 'sale', '1'], [rent, 'rent', '2']] as const) {
      version = strategy === 'rent' ? 'streaming-1.0.0' : '1.3.0'
      const p = { kind: 'board' as const, chainId: 8453, address: board }
      const first = await snapshot(p)
      const count = reads
      assert.equal(first.strategy, strategy)
      assert.equal(first.minimum, minimum)
      assert.equal(first.freshness?.stale, false)
      assert.deepEqual(JSON.parse(JSON.stringify(await snapshot(p))), JSON.parse(JSON.stringify(first)))
      assert.equal(reads, count)
      const wallet = await snapshot(p, account)
      const walletReads = reads
      assert.equal(wallet.wallet?.eth, '1000')
      assert.equal(wallet.wallet?.markee, '6')
      assert.equal(wallet.wallet?.ethx, strategy === 'rent' ? '100' : '0')
      assert.equal(wallet.wallet?.flowRate, strategy === 'rent' ? '3' : '0')
      await snapshot(p, account)
      assert.equal(reads, walletReads)
      if (strategy === 'sale') {
        await assert.rejects(prepare(p, account, { kind: 'create', message: 'test', name: 'test', amount: '0' }), /Minimum payment/)
        assert.ok(reads > walletReads, 'preparation must read live board state')
      }
    }
    assert.equal((await communityPermissions(8453, rent, account)).canClaim, true)
    council = zeroAddress as typeof account
    assert.equal((await communityPermissions(8453, rent, account)).canClaim, false, 'permissions must immediately reflect a new council')
    // Receipt verification invalidates only successful, exactly matching actions.
    const tx = { from: account, to: rent, chainId: 8453, value: '0x0' as const, data: '0x1234' as const, gas: '0x1000' as const }
    const id = signEnvelope({ transaction: tx, placement: { kind: 'board', chainId: 8453, address: rent }, action: { kind: 'stop' }, expiresAt: Date.now() + 1000, issuedAt: Date.now(), board: rent, token: null })
    t.mock.method(client, 'getTransaction', async () => ({ from: account, to: rent, input: tx.data, value: 0n }))
    let status = 'reverted'
    t.mock.method(client, 'getTransactionReceipt', async () => ({ status, blockNumber: 98n, logs: [] }))
    const hash = `0x${'a'.repeat(64)}` as `0x${string}`
    await verifyTransaction(id, hash)
    const p = { kind: 'board' as const, chainId: 8453, address: rent }
    const before = reads
    await snapshot(p)
    assert.equal(reads, before, 'reverted receipt must not flush cache')
    status = 'success'
    await verifyTransaction(id, hash)
    await snapshot(p)
    assert.ok(reads > before, 'confirmed action refreshes display')
    const after = reads
    await verifyTransaction(id, hash)
    await snapshot(p)
    assert.equal(reads, after, 'replay preserves rebuilt snapshot')
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})

test('independent serverless instances share one refresh for a cold key', async () => {
  const db = database()
  let count = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const load = async () => {
    count++
    await gate
    return { balance: '42' }
  }
  const winner = createSnapshotCache(db.store, db.now)('board', load)
  // Let the lease holder reach the loader before concurrent requests arrive.
  while (count === 0) await new Promise((resolve) => setImmediate(resolve))
  const results = await Promise.allSettled(
    Array.from({ length: 40 }, () => createSnapshotCache(db.store, db.now)('board', load)),
  )
  assert.equal(count, 1)
  assert.ok(
    results.every(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof SnapshotUnavailable &&
        result.reason.retryAfter === 2,
    ),
  )
  release()
  assert.equal((await winner).data.balance, '42')
  assert.equal((await createSnapshotCache(db.store, db.now)('board', load)).data.balance, '42')
  assert.equal(count, 1)
})

test('concurrent requests receive the last successful snapshot while it refreshes', async () => {
  const db = database()
  const read = createSnapshotCache(db.store, db.now)
  await read('board', async () => 'old', 10)
  db.advance(11000)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  const refresh = read(
    'board',
    async () => {
      started = true
      await gate
      return 'new'
    },
    10,
  )
  while (!started) await new Promise((resolve) => setImmediate(resolve))
  const concurrent = await createSnapshotCache(db.store, db.now)(
    'board',
    async () => {
      throw new Error('Must not refresh')
    },
    10,
  )
  assert.equal(concurrent.data, 'old')
  assert.equal(concurrent.stale, true)
  assert.equal(concurrent.refreshing, true)
  release()
  assert.equal((await refresh).data, 'new')
})

test('provider failures preserve balances and suppress retry storms across instances', async () => {
  const db = database()
  const read = createSnapshotCache(db.store, db.now)
  await read('wallet', async () => ({ balance: '123' }), 10, 30)
  db.advance(11000)
  let failures = 0
  const fail = async () => {
    failures++
    throw new Error('RPC unavailable')
  }
  const stale = await read<{ balance: string }>('wallet', fail, 10, 30)
  assert.equal(stale.data.balance, '123')
  assert.equal(stale.stale, true)
  await createSnapshotCache(db.store, db.now)('wallet', fail, 10, 30)
  assert.equal(failures, 1)
  db.advance(30000)
  await assert.rejects(read('wallet', fail, 10, 30), SnapshotUnavailable)
})

test('an expired lease cannot publish over a newer snapshot or release its lock', async () => {
  const db = database()
  let release!: () => void
  let started = false
  const old = createSnapshotCache(db.store, db.now)('board', async () => {
    started = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return 'old'
  })
  while (!started) await new Promise((resolve) => setImmediate(resolve))
  db.advance(66000)
  const newer = await createSnapshotCache(db.store, db.now)('board', async () => 'new')
  assert.equal(newer.data, 'new')
  release()
  await assert.rejects(old, SnapshotUnavailable)
  assert.equal(
    (await createSnapshotCache(db.store, db.now)('board', async () => 'unexpected')).data,
    'new',
  )
})

test('a KV outage never falls through to uncoordinated RPC reads', async () => {
  const db = database()
  let loads = 0
  db.store.get = async () => {
    throw new Error('KV unavailable')
  }
  await assert.rejects(
    createSnapshotCache(db.store, db.now)('board', async () => {
      loads++
      return 'data'
    }),
    /KV unavailable/,
  )
  assert.equal(loads, 0)
})

test('cleanup failure does not discard a successfully published snapshot', async () => {
  const db = database()
  const evaluate = db.store.eval
  db.store.eval = async (script, keys, args) => {
    if (script === RELEASE) throw new Error('Storage connection lost')
    return evaluate(script, keys, args)
  }
  const result = await createSnapshotCache(db.store, db.now)('wallet', async () => '42')
  assert.equal(result.data, '42')
  assert.equal(result.stale, false)
})

test('storage failing during refresh preserves the previously loaded balance', async () => {
  const db = database()
  const read = createSnapshotCache(db.store, db.now)
  await read('wallet', async () => '42', 10)
  db.advance(11000)
  db.store.eval = async () => {
    throw new Error('Storage connection lost')
  }
  const result = await read('wallet', async () => '43', 10)
  assert.equal(result.data, '42')
  assert.equal(result.stale, true)
})

