import assert from 'node:assert/strict'
import test from 'node:test'
import { listMarkees, runModerationScan, scanDeps } from '../lib/moderation/scan'
import { observeMessage } from '../lib/moderation/queue'
import { BASELINE_KEY, flagKey, itemKey } from '../lib/moderation/server'
import { lifetimeDeps } from '../lib/streaming/lifetime-deps'
import { GET as lifetime } from '../app/api/streaming/lifetime-streamed/route'
import { snapshotStorage } from '../lib/sdk/cached-display'
import { BACKOFF, PUBLISH, RELEASE, type SnapshotStore } from '../lib/sdk/snapshot-cache'

const board = '0x1111111111111111111111111111111111111111'
const ids = ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333']
const owner = '0x4444444444444444444444444444444444444444'

function storage(t: any) {
  const records = new Map<string, any>()
  for (const deps of [scanDeps, lifetimeDeps]) {
    t.mock.method(deps, 'get', async (key: string) => structuredClone(records.get(key) ?? null))
    t.mock.method(deps, 'set', async (key: string, value: any) => { records.set(key, structuredClone(value)); return 'OK' })
  }
  t.mock.method(scanDeps, 'mget', async (...keys: string[]) => keys.map(key => structuredClone(records.get(key) ?? null)))
  t.mock.method(scanDeps, 'readItems', async (ids: string[]) => ids.map(id => structuredClone(records.get(itemKey(id)) ?? null)))
  t.mock.method(scanDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  t.mock.method(lifetimeDeps, 'underRateLimit', async () => true)
  t.mock.method(scanDeps, 'pipeline', () => {
    const pipeline: any = { set(key: string, value: any) { records.set(key, structuredClone(value)); return pipeline }, zadd() { return pipeline }, zrem() { return pipeline }, async exec() { return [] } }
    return pipeline
  })
  return records
}

function scanner(t: any) {
  const records = storage(t)
  records.set(BASELINE_KEY, '1')
  records.set('moderation:scan:logBlock', '49800')
  records.set(`moderation:scan:v2:${board}`, { count: '2', ids, reconciledAt: 1000 })
  ids.forEach(markee => records.set(itemKey(markee), observeMessage(null, { markee, board, message: 'old text', name: '', author: owner, blockNumber: '49000', at: 1000 }, { preexisting: true, flagged: { board: false, site: false } })))
  let edits: any[] = [], textReads = 0, fail = false, at = 1100
  const client = {
    async getBlock() { return { number: 50000n, timestamp: BigInt(at) } },
    async getLogs() { return edits },
    async multicall({ contracts }: any) {
      return contracts.map((call: any) => {
        if (call.address !== board && ['markeeCount', 'getTopMarkees', 'getMarkees'].includes(call.functionName)) return { status: 'success', result: call.functionName === 'markeeCount' ? 0n : call.functionName === 'getTopMarkees' ? [[], []] : [] }
        if (['message', 'name'].includes(call.functionName)) textReads++
        if (fail && call.functionName === 'message') return { status: 'failure' }
        const value: any = { leaderboardCount: 1n, getLeaderboards: [board], markeeCount: 2n, getMarkees: ids, getTopMarkees: [ids, [2n, 1n]], message: 'new text', name: '', owner, pricingStrategy: board }
        return { status: 'success', result: value[call.functionName] }
      })
    },
  }
  t.mock.method(scanDeps, 'client', () => client as any)
  t.mock.method(scanDeps, 'membership', async (pairs: unknown[]) => pairs.map(() => true))
  t.mock.method(scanDeps, 'recordActivity', async () => ({ events: 0, byWallet: new Map() }))
  t.mock.method(scanDeps, 'notifyLowBudgets', async () => 0)
  t.mock.method(scanDeps, 'notifyStatusChanges', async () => 0)
  t.mock.method(scanDeps, 'updateTopHistories', async () => {})
  const old = process.env.FLAG_AUTO_MODERATION; process.env.FLAG_AUTO_MODERATION = 'false'
  t.after(() => old === undefined ? delete process.env.FLAG_AUTO_MODERATION : process.env.FLAG_AUTO_MODERATION = old)
  return { records, client, reads: () => textReads, edit: () => { edits = [{ address: ids[0] }] }, fail: () => { fail = true }, reconcile: () => { at = 5000 } }
}

test('incremental moderation skips unchanged text, refreshes edited text and retains manual reviews', async t => {
  const s = scanner(t)
  await runModerationScan(); assert.equal(s.reads(), 0)
  s.edit(); await runModerationScan(); assert.equal(s.reads(), 2)
  assert.equal(s.records.get(itemKey(ids[0])).message, 'new text')
  assert.equal(s.records.get(itemKey(ids[0])).reviews.board.status, 'pending')
})

test('hourly moderation reconciliation rereads known messages; failed reads do not advance cursors', async t => {
  const s = scanner(t); s.reconcile()
  await runModerationScan(); assert.equal(s.reads(), 4)
  const before = s.records.get('moderation:scan:logBlock')
  const boardBefore = structuredClone(s.records.get(`moderation:scan:v2:${board}`))
  s.edit(); s.fail()
  await assert.rejects(runModerationScan(), /retaining checkpoints/)
  assert.equal(s.records.get('moderation:scan:logBlock'), before)
  assert.deepEqual(s.records.get(`moderation:scan:v2:${board}`), boardBefore)
})

test('new board moderation enumeration is bounded and checkpoints only fetched pages', async t => {
  const s = scanner(t)
  s.records.delete(`moderation:scan:v2:${board}`)
  const first = await listMarkees(s.client as any, [board], 50000n, 1100)
  assert.equal(first.reconcile.has(board), true)
  assert.equal(first.states.get(board)?.count, '2')
  assert.equal(first.pairs.length, 2)
})

test('spoofed edit logs cannot add non-members to either moderation queue', async t => {
  const s = scanner(t)
  const attacker = '0x9999999999999999999999999999999999999999'
  t.mock.method(s.client, 'getLogs', async () => [{ address: attacker }])
  t.mock.method(scanDeps, 'membership', async (pairs: { markee: string; board: string }[], _client: unknown, block: bigint) => {
    assert.equal(block, 50000n)
    assert.deepEqual(pairs, [{ markee: attacker, board }])
    return [false]
  })
  const report = await runModerationScan()
  assert.equal(report.fromLogs, 0)
  assert.equal(s.records.has(itemKey(attacker)), false)
  assert.equal(s.reads(), 0)
})

function snapshots(t: any) {
  const data = new Map<string, any>()
  const store: SnapshotStore = {
    async get<T>(key: string) { return structuredClone(data.get(key) ?? null) as T },
    async set(key, value, options) { if (options.nx && data.has(key)) return null; data.set(key, value); return 'OK' },
    async eval(script, keys, args) {
      if (data.get(keys[0]) !== args[0]) return 0
      if (script === RELEASE) { data.delete(keys[0]); return 1 }
      if (script === PUBLISH) { data.set(keys[1], JSON.parse(String(args[1]))); return 1 }
      if (script === BACKOFF) { data.set(keys[1], 1); return 1 }
      throw new Error('Unknown script')
    },
  }
  t.mock.method(snapshotStorage, 'get', () => store)
  return data
}

test('quiet rental history checkpoints advance and concurrent readers share a cached replay', async t => {
  const records = storage(t), cache = snapshots(t)
  const key = `streaming:lifetime:${board}:${ids[0]}:${owner}`
  records.set(key, { streamed: '100', refunded: '20', rate: '2', isTop: true, since: 100, lastBlock: '1000' })
  const ranges: bigint[] = []; let head = 1200n
  t.mock.method(lifetimeDeps, 'client', () => ({ async getBlockNumber() { return head }, async getLogs({ fromBlock }: any) { ranges.push(fromBlock); return [] } }) as any)
  const request = () => new Request(`https://markee.example/api/streaming/lifetime-streamed?board=${board}&markee=${ids[0]}&backer=${owner}`)
  const first = await lifetime(request()); assert.equal(first.status, 200)
  assert.equal(records.get(key).lastBlock, '1100'); assert.equal(records.get(key).streamed, '100')
  assert.equal(ranges.length, 3)
  await lifetime(request()); assert.equal(ranges.length, 3)
  cache.clear(); head = 1300n
  await lifetime(request()); assert.deepEqual(ranges.slice(3), [1101n, 1101n, 1101n])
  assert.equal(records.get(key).lastBlock, '1200')
})

test('rental history keeps unsafe tail out of persisted totals and retries after RPC failure', async t => {
  const records = storage(t); snapshots(t)
  const key = `streaming:lifetime:${board}:${ids[0]}:${owner}`
  const checkpoint = { streamed: '0', refunded: '0', rate: '0', isTop: false, since: 0, lastBlock: '1000' }
  records.set(key, checkpoint)
  t.mock.method(lifetimeDeps, 'client', () => ({ async getBlockNumber() { return 1200n }, async getLogs() { throw new Error('RPC unavailable') } }) as any)
  const result = await lifetime(new Request(`https://markee.example/api/streaming/lifetime-streamed?board=${board}&markee=${ids[0]}&backer=${owner}`))
  assert.equal(result.status, 500); assert.deepEqual(records.get(key), checkpoint)
})

test('editing an automatically rechecked message does not clear a manual moderation flag', async t => {
  const s = scanner(t)
  const prior = s.records.get(itemKey(ids[0])); prior.reviews.board.status = 'flagged'
  t.mock.method(scanDeps, 'readAllFlagged', async () => ({ board: [flagKey(ids[0])], site: [] }))
  s.edit(); await runModerationScan()
  assert.equal(s.records.get(itemKey(ids[0])).reviews.board.status, 'pending')
  // Editing queues a fresh review; visibility continues to use the unchanged manual flag set.
  assert.deepEqual((await scanDeps.readAllFlagged()).board, [flagKey(ids[0])])
})

test('rental history replays the reorg tail for display without counting it twice in checkpoints', async t => {
  const records = storage(t), cache = snapshots(t)
  const key = `streaming:lifetime:${board}:${ids[0]}:${owner}`
  records.set(key, { streamed: '10', refunded: '0', rate: '2', isTop: true, since: 100, lastBlock: '1000' })
  let head = 1200n
  const events = [
    { eventName: 'BackerUpdated', blockNumber: 1050n, logIndex: 0, args: { flowRate: 4n } },
    { eventName: 'BackerUpdated', blockNumber: 1150n, logIndex: 0, args: { flowRate: 6n } },
  ]
  t.mock.method(lifetimeDeps, 'client', () => ({
    async getBlockNumber() { return head },
    async getLogs({ event, fromBlock }: any) { return event.name === 'BackerUpdated' ? events.filter(e => e.blockNumber >= fromBlock) : [] },
    async getBlock({ blockNumber }: any) { return { number: blockNumber, timestamp: blockNumber === 1050n ? 150n : 200n } },
  }) as any)
  const request = () => new Request(`https://markee.example/api/streaming/lifetime-streamed?board=${board}&markee=${ids[0]}&backer=${owner}`)
  assert.equal((await (await lifetime(request())).json()).streamedWei, '310')
  assert.equal(records.get(key).streamed, '110'); assert.equal(records.get(key).lastBlock, '1100')
  cache.clear(); head = 1250n
  assert.equal((await (await lifetime(request())).json()).streamedWei, '310')
  assert.equal(records.get(key).streamed, '310'); assert.equal(records.get(key).lastBlock, '1150')
})
