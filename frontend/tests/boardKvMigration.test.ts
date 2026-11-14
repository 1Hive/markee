import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BOOSTED_KEY,
  CAS_SCRIPT,
  MERGE_COUNTER_SCRIPT,
  MERGE_HASH_SCRIPT,
  MIGRATION_OPERATOR,
  buildMigrationMap,
  buildPlan,
  classifyKey,
  executePlan,
  readOnly,
  restrictMap,
  rewriteBoostHistory,
  rewriteBoostedList,
  truncateSpans,
  type Command,
  type KvStore,
  type MigrationLog,
} from '../lib/migration/boardKv'

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`
const LEGACY_BOARD = addr(0xb1)
const SUCCESSOR_BOARD = addr(0xb2)
const LEGACY_MARKEE = addr(0xa1)
const SUCCESSOR_MARKEE = addr(0xa2)
const OTHER_BOARD = addr(0xc1)
const UNFINISHED_BOARD = addr(0xd1)
const MIGRATOR = addr(0xee)

const logs: MigrationLog[] = [
  { eventName: 'MigrationStarted', migrator: MIGRATOR, blockNumber: 100n, legacyBoard: LEGACY_BOARD, successor: SUCCESSOR_BOARD },
  { eventName: 'MarkeeCopied', migrator: MIGRATOR, blockNumber: 101n, legacyBoard: LEGACY_BOARD, legacyMarkee: LEGACY_MARKEE.toUpperCase().replace('0X', '0x'), successorMarkee: SUCCESSOR_MARKEE },
  { eventName: 'BoardMigrated', migrator: MIGRATOR, blockNumber: 102n, legacyBoard: LEGACY_BOARD, successor: SUCCESSOR_BOARD },
  { eventName: 'MigrationStarted', migrator: MIGRATOR, blockNumber: 103n, legacyBoard: UNFINISHED_BOARD, successor: addr(0xd2) },
  { eventName: 'MarkeeCopied', migrator: MIGRATOR, blockNumber: 104n, legacyBoard: UNFINISHED_BOARD, legacyMarkee: addr(0xd3), successorMarkee: addr(0xd4) },
  { eventName: 'BoardMigrated', migrator: MIGRATOR, blockNumber: 105n, legacyBoard: UNFINISHED_BOARD, successor: addr(0xd2) },
]
const map = () => buildMigrationMap(logs, board => board === LEGACY_BOARD)

type Entry = { type: 'string'; value: string; pttl: number } | { type: 'hash'; value: Map<string, string> } | { type: 'zset'; value: Map<string, string> } | { type: 'set'; value: Set<string> }

function memoryStore(seed: Record<string, Entry> = {}) {
  const data = new Map<string, Entry>(Object.entries(seed))
  const writes: Command[] = []
  const glob = (pattern: string) => new RegExp(`^${pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  const hash = (key: string) => {
    const e = data.get(key)
    if (e && e.type !== 'hash') throw new Error('WRONGTYPE')
    if (!e) data.set(key, { type: 'hash', value: new Map() })
    return (data.get(key) as { value: Map<string, string> }).value
  }
  const set = (key: string) => {
    if (!data.has(key)) data.set(key, { type: 'set', value: new Set() })
    return (data.get(key) as { value: Set<string> }).value
  }
  const run = (c: Command): unknown => {
    const [cmd, ...a] = c.map(String)
    switch (cmd) {
      case 'SCAN': return ['0', [...data.keys()].filter(k => glob(a[2]).test(k))]
      case 'TYPE': return data.get(a[0])?.type ?? 'none'
      case 'PTTL': { const e = data.get(a[0]); return !e ? -2 : e.type === 'string' ? e.pttl : -1 }
      case 'GET': { const e = data.get(a[0]); return e?.type === 'string' ? e.value : null }
      case 'EXISTS': return data.has(a[0]) ? 1 : 0
      case 'HGETALL': { const e = data.get(a[0]); return e?.type === 'hash' ? [...e.value].flat() : [] }
      case 'ZRANGE': { const e = data.get(a[0]); return e?.type === 'zset' ? [...e.value].flat() : [] }
      case 'SMEMBERS': { const e = data.get(a[0]); return e?.type === 'set' ? [...e.value] : [] }
      case 'SISMEMBER': { const e = data.get(a[0]); return e?.type === 'set' && e.value.has(a[1]) ? 1 : 0 }
    }
    writes.push(c)
    switch (cmd) {
      case 'SET': {
        if (a.includes('NX') && data.has(a[0])) return null
        const px = a.indexOf('PX')
        data.set(a[0], { type: 'string', value: a[1], pttl: px > 0 ? Number(a[px + 1]) : -1 })
        return 'OK'
      }
      case 'HSETNX': { const h = hash(a[0]); if (h.has(a[1])) return 0; h.set(a[1], a[2]); return 1 }
      case 'SADD': { const s = set(a[0]); const before = s.size; a.slice(1).forEach(m => s.add(m)); return s.size - before }
      case 'ZADD': {
        if (!data.has(a[0])) data.set(a[0], { type: 'zset', value: new Map() })
        const z = (data.get(a[0]) as { value: Map<string, string> }).value
        for (let i = 2; i < a.length; i += 2) if (!z.has(a[i + 1])) z.set(a[i + 1], a[i])
        return 1
      }
      case 'EVAL': {
        const [script, , k1, k2, ...argv] = a
        if (script === CAS_SCRIPT) {
          const e = data.get(k1)
          if (e?.type !== 'string' || e.value !== k2) return 0
          data.set(k1, { type: 'string', value: argv[0], pttl: -1 })
          return 1
        }
        const s = set(k2)
        if (s.has(argv[0])) return 0
        s.add(argv[0])
        if (script === MERGE_COUNTER_SCRIPT) {
          const e = data.get(k1)
          const next = String(BigInt(e?.type === 'string' ? e.value : '0') + BigInt(argv[1]))
          data.set(k1, { type: 'string', value: next, pttl: -1 })
          return next
        }
        if (script === MERGE_HASH_SCRIPT) {
          const h = hash(k1)
          for (let i = 1; i < argv.length; i += 2) h.set(argv[i], String(BigInt(h.get(argv[i]) ?? '0') + BigInt(argv[i + 1])))
          return 1
        }
        throw new Error('unknown script')
      }
    }
    throw new Error(`unsupported ${cmd}`)
  }
  const store: KvStore = { exec: async commands => commands.map(run) }
  return { store, data, writes }
}

const str = (value: string, pttl = -1): Entry => ({ type: 'string', value, pttl })
const get = (data: Map<string, Entry>, key: string) => (data.get(key) as { value: string } | undefined)?.value

test('only finished boards and their copied markees enter the map', () => {
  const m = map()
  assert.deepEqual([...m.boards.keys()], [LEGACY_BOARD])
  assert.equal(m.boards.get(LEGACY_BOARD)!.startedBlock, 100n)
  assert.equal(m.boards.get(LEGACY_BOARD)!.migratedBlock, 102n)
  assert.equal(m.markees.get(LEGACY_MARKEE), SUCCESSOR_MARKEE)
  assert.equal(m.markees.has(addr(0xd3)), false)
})

test('restrictMap narrows to one board and its markees', () => {
  assert.equal(restrictMap(map(), { board: OTHER_BOARD }).markees.size, 0)
  assert.equal(restrictMap(map(), { board: LEGACY_BOARD.toUpperCase().replace('0X', '0x') }).markees.size, 1)
  assert.equal(restrictMap(map(), { limit: 1 }).boards.size, 1)
})

test('classifyKey picks the right rule and swaps the captured address', () => {
  const m = map()
  const msg = classifyKey(`views:msg:${LEGACY_MARKEE}:abc`, m)
  assert.ok(msg && 'rule' in msg)
  assert.equal(msg.rule.name, 'views:msg')
  assert.equal(msg.successorKey, `views:msg:${SUCCESSOR_MARKEE}:abc`)
  const last = classifyKey(`views:url:last:${LEGACY_BOARD}:example.com`, m)
  assert.ok(last && 'rule' in last && last.rule.name === 'views:url:last')
  const cache = classifyKey(`views:github:${LEGACY_BOARD}`, m)
  assert.ok(cache && 'rule' in cache && cache.rule.action === 'skip')
  assert.deepEqual(classifyKey(`oi:meta:${LEGACY_MARKEE}`, m), { mismatch: `oi:meta:${LEGACY_MARKEE}` })
  assert.deepEqual(classifyKey(`mystery:${LEGACY_BOARD}`, m), { unclassified: `mystery:${LEGACY_BOARD}` })
  assert.equal(classifyKey(`oi:meta:${OTHER_BOARD}`, m), null)
})

test('truncateSpans drops spans after the migration and reopens the last', () => {
  const spans = [{ markee: 'a', from: 1, to: 5 }, { markee: 'b', from: 5, to: 20 }, { markee: 'c', from: 20, to: null }]
  assert.deepEqual(truncateSpans(spans, 10), [{ markee: 'a', from: 1, to: 5 }, { markee: 'b', from: 5, to: null }])
})

test('boosted list and boost history add the successor beside the legacy board', () => {
  const m = map()
  const list = JSON.parse(rewriteBoostedList(JSON.stringify([{ address: LEGACY_BOARD, name: 'X' }]), m)!)
  assert.deepEqual(list.map((b: { address: string }) => b.address), [LEGACY_BOARD, SUCCESSOR_BOARD])
  assert.equal(rewriteBoostedList(JSON.stringify(list), m), null)
  const history = JSON.parse(rewriteBoostHistory(JSON.stringify([{ effectiveBlock: 1, multipliers: { [LEGACY_BOARD]: 3 } }]), m)!)
  assert.deepEqual(history[0].multipliers, { [LEGACY_BOARD]: 3, [SUCCESSOR_BOARD]: 3 })
})

function seeded() {
  const m = map()
  m.boards.get(LEGACY_BOARD)!.migratedAt = 1000
  const { store, data, writes } = memoryStore({
    [`views:total:${LEGACY_BOARD}`]: str('40'),
    [`views:total:${SUCCESSOR_BOARD}`]: str('2'),
    [`views:daily:${LEGACY_MARKEE}`]: { type: 'hash', value: new Map([['2026-11-01', '3']]) },
    [`oi:meta:${LEGACY_BOARD}`]: str('{"verifiedUrls":["https://a.example"]}', 5000),
    [`github:synced:${LEGACY_BOARD}`]: str('{"signature":"s","at":1}'),
    [`creator:oi:${LEGACY_BOARD}`]: str('0x00000000000000000000000000000000000000cc'),
    [`creator:oi:${SUCCESSOR_BOARD}`]: str(MIGRATION_OPERATOR),
    [`initial-admin:oi:${LEGACY_BOARD}`]: str('0x00000000000000000000000000000000000000dd'),
    [`moderation:item:8453:${LEGACY_MARKEE}`]: str(JSON.stringify({ markee: LEGACY_MARKEE, board: LEGACY_BOARD, message: 'hi' })),
    [`moderation:pending:${LEGACY_BOARD}`]: { type: 'zset', value: new Map([[LEGACY_MARKEE, '77']]) },
    [`reactions:v2:${LEGACY_MARKEE}`]: { type: 'hash', value: new Map([['0xuser', JSON.stringify({ id: `${LEGACY_MARKEE}-0xuser`, markeeAddress: LEGACY_MARKEE, emoji: 'x' })]]) },
    [`board:tophistory:${LEGACY_BOARD}`]: str(JSON.stringify({ spans: [{ markee: LEGACY_MARKEE, from: 500, to: null }], scannedTo: '150', totals: [[LEGACY_MARKEE, '9'], [addr(0x99), '1']] })),
    [`streaming:backing:${LEGACY_BOARD}`]: str(JSON.stringify({ backers: { '0xbacker': [LEGACY_MARKEE] }, scannedTo: '150' })),
    [`superfluid:s6:baseline:${LEGACY_BOARD}`]: str('123'),
    'moderation:flagged': { type: 'set', value: new Set([`8453:${LEGACY_MARKEE}`]) },
    'moderation:pending:site': { type: 'zset', value: new Map([[LEGACY_MARKEE, '55']]) },
    'activity:tops:8453': { type: 'hash', value: new Map([[LEGACY_BOARD, LEGACY_MARKEE]]) },
    [BOOSTED_KEY]: str(JSON.stringify([{ address: LEGACY_BOARD, name: 'X' }])),
  })
  return { m, store, data, writes }
}

test('dry run plans every write without touching the store', async () => {
  const { m, store, writes } = seeded()
  const plan = await buildPlan(readOnly(store), m)
  assert.equal(writes.length, 0)
  const status = (rule: string) => plan.entries.find(e => e.rule === rule)?.status
  assert.equal(status('views:total'), 'merge')
  assert.equal(status('creator'), 'replace')
  assert.equal(status('github:synced'), 'skip')
  assert.equal(status('oi:meta'), 'write')
  await assert.rejects(readOnly(store).exec([['SET', 'k', 'v']]), /dry run refused SET/)
})

test('execute copies, merges, rewrites, and leaves legacy keys in place', async () => {
  const { m, store, data } = seeded()
  await executePlan(store, await buildPlan(store, m))

  assert.equal(get(data, `views:total:${SUCCESSOR_BOARD}`), '42')
  assert.equal(get(data, `initial-admin:oi:${SUCCESSOR_BOARD}`), '0x00000000000000000000000000000000000000dd')
  assert.equal(get(data, `views:total:${LEGACY_BOARD}`), '40')
  assert.equal((data.get(`views:daily:${SUCCESSOR_MARKEE}`) as { value: Map<string, string> }).value.get('2026-11-01'), '3')
  assert.equal(get(data, `oi:meta:${SUCCESSOR_BOARD}`), '{"verifiedUrls":["https://a.example"]}')
  assert.equal((data.get(`oi:meta:${SUCCESSOR_BOARD}`) as { pttl: number }).pttl, 5000)
  assert.equal(data.has(`github:synced:${SUCCESSOR_BOARD}`), false)
  assert.equal(get(data, `creator:oi:${SUCCESSOR_BOARD}`), '0x00000000000000000000000000000000000000cc')
  assert.equal(get(data, `superfluid:s6:baseline:${SUCCESSOR_BOARD}`), '123')

  const item = JSON.parse(get(data, `moderation:item:8453:${SUCCESSOR_MARKEE}`)!)
  assert.equal(item.markee, SUCCESSOR_MARKEE)
  assert.equal(item.board, SUCCESSOR_BOARD)
  assert.equal((data.get(`moderation:pending:${SUCCESSOR_BOARD}`) as { value: Map<string, string> }).value.get(SUCCESSOR_MARKEE), '77')
  assert.equal((data.get('moderation:pending:site') as { value: Map<string, string> }).value.get(SUCCESSOR_MARKEE), '55')
  assert.ok((data.get('moderation:flagged') as { value: Set<string> }).value.has(`8453:${SUCCESSOR_MARKEE}`))
  assert.ok((data.get('moderation:flagged') as { value: Set<string> }).value.has(`8453:${LEGACY_MARKEE}`))
  assert.equal((data.get('activity:tops:8453') as { value: Map<string, string> }).value.get(SUCCESSOR_BOARD), SUCCESSOR_MARKEE)

  const reaction = JSON.parse((data.get(`reactions:v2:${SUCCESSOR_MARKEE}`) as { value: Map<string, string> }).value.get('0xuser')!)
  assert.equal(reaction.markeeAddress, SUCCESSOR_MARKEE)
  assert.equal(reaction.id, `${SUCCESSOR_MARKEE}-0xuser`)

  const history = JSON.parse(get(data, `board:tophistory:${SUCCESSOR_BOARD}`)!)
  assert.equal(history.scannedTo, '102')
  assert.deepEqual(history.spans, [{ markee: SUCCESSOR_MARKEE, from: 500, to: null }])
  assert.deepEqual(history.totals, [[SUCCESSOR_MARKEE, '9']])
  const backing = JSON.parse(get(data, `streaming:backing:${SUCCESSOR_BOARD}`)!)
  assert.deepEqual(backing, { backers: { '0xbacker': [SUCCESSOR_MARKEE] }, scannedTo: '99' })

  const boosted = JSON.parse(get(data, BOOSTED_KEY)!)
  assert.deepEqual(boosted.map((b: { address: string }) => b.address), [LEGACY_BOARD, SUCCESSOR_BOARD])
})

test('a second run is a no-op', async () => {
  const { m, store, data, writes } = seeded()
  await executePlan(store, await buildPlan(store, m))
  const firstRunWrites = writes.length
  const again = await buildPlan(store, m)
  assert.equal(again.entries.reduce((n, e) => n + e.commands.length, 0), 0)
  await executePlan(store, again)
  assert.equal(writes.length, firstRunWrites)
  assert.equal(get(data, `views:total:${SUCCESSOR_BOARD}`), '42')
})

test('existing successor values are kept, except an operator-resolved creator', async () => {
  const { m, store, data } = seeded()
  data.set(`oi:meta:${SUCCESSOR_BOARD}`, str('{"verifiedUrls":["https://b.example"]}'))
  data.set(`creator:oi:${SUCCESSOR_BOARD}`, str('0x00000000000000000000000000000000000000dd'))
  const plan = await buildPlan(store, m)
  assert.equal(plan.entries.find(e => e.rule === 'oi:meta')?.status, 'exists')
  assert.equal(plan.entries.find(e => e.rule === 'creator')?.status, 'exists')
  await executePlan(store, plan)
  assert.equal(get(data, `oi:meta:${SUCCESSOR_BOARD}`), '{"verifiedUrls":["https://b.example"]}')
  assert.equal(get(data, `creator:oi:${SUCCESSOR_BOARD}`), '0x00000000000000000000000000000000000000dd')
})
