import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { CONTRACTS, FACTORIES, V13_LEADERBOARDS } from '../lib/contracts/addresses'
import { trustedMembership, membershipDeps } from '../lib/moderation/membership'
import { automaticDeps, checkPublished, evaluateObserved, softRecords, softKey, SOFT_INDEX, AUTO_POLICY, contentHash } from '../lib/moderation/automatic'
import { queueDeps } from '../lib/moderation/queue-deps'
import { flagKey } from '../lib/moderation/server'
import { GET as queue } from '../app/api/moderation/queue/route'
import { POST as view } from '../app/api/views/route'
import { viewsWriteDeps } from '../lib/views/write-deps'
import { moderateEmbed, embedModerationDeps } from '../lib/moderation/embed'
import { boardPolicyDeps } from '../lib/moderation/board-policy'

const markee = '0x1111111111111111111111111111111111111111'
const fake = '0x2222222222222222222222222222222222222222'
const board = '0x3333333333333333333333333333333333333333'
const attackerBoard = '0x4444444444444444444444444444444444444444'
const moderator = '0x5555555555555555555555555555555555555555'
function setup(t: any) {
  t.mock.method(boardPolicyDeps, 'get', async () => null)
  const old = process.env.FLAG_AUTO_MODERATION
  process.env.FLAG_AUTO_MODERATION = 'true'
  t.after(() => old === undefined ? delete process.env.FLAG_AUTO_MODERATION : process.env.FLAG_AUTO_MODERATION = old)
  const records = new Map<string, any>(), index = new Set<string>()
  const client = {
    async getBlockNumber() { return 100n },
    async multicall({ contracts, blockNumber }: any) {
      assert.equal(blockNumber, 100n)
      return contracts.map((c: any) => {
        let result: any
        if (c.functionName === 'message') result = 'shit'
        if (c.functionName === 'pricingStrategy') result = board
        if (c.functionName === 'factory') result = FACTORIES.GITHUB
        if (c.functionName === 'isFactoryLeaderboard') result = c.args[0] === board
        if (c.functionName === 'isMarkeeOnLeaderboard') result = c.args[0] === markee
        return { status: 'success', result }
      })
    },
  }
  t.mock.method(automaticDeps, 'client', () => client as any)
  t.mock.method(membershipDeps, 'client', () => client as any)
  t.mock.method(automaticDeps, 'flags', async () => ({ board: [], site: [] }))
  t.mock.method(automaticDeps, 'get', async (key: string) => records.get(key) ?? null)
  t.mock.method(automaticDeps, 'members', async () => [...index])
  t.mock.method(automaticDeps, 'mget', async (...keys: string[]) => keys.map(k => records.get(k) ?? null))
  t.mock.method(automaticDeps, 'pipeline', () => {
    const p = {
      set(k: string, v: unknown) { records.set(k, v); return p },
      del(k: string) { records.delete(k); return p },
      sadd(_k: string, v: string) { index.add(v); return p },
      srem(_k: string, v: string) { index.delete(v); return p },
      async exec() { return [] },
    }
    return p
  })
  return { client, records, index }
}

test('homepage fixed strategies trust only their actual Markee and preserve moderation', async t => {
  const { client } = setup(t)
  const strategy = CONTRACTS[8453].fixedPriceStrategies[0].address
  let text = 'this is a sign.'
  let available = true
  t.mock.method(client, 'multicall', async ({ contracts, blockNumber }: any) => {
    assert.equal(blockNumber, 100n)
    return contracts.map((c: any) => {
      if (c.functionName === 'message') return { status: 'success', result: text }
      if (c.functionName === 'pricingStrategy') return { status: 'success', result: strategy }
      if (c.functionName === 'markeeAddress' && available) return { status: 'success', result: markee }
      return { status: 'failure' }
    })
  })
  assert.deepEqual(await trustedMembership([{ markee, board: strategy }, { markee: fake, board: strategy }]), [true, false])
  for (const configured of CONTRACTS[8453].fixedPriceStrategies) {
    assert.deepEqual(await trustedMembership([{ markee, board: configured.address }]), [true])
  }
  assert.equal((await checkPublished([strategy]))[0].state, 'unavailable')
  const [visible] = await checkPublished([markee])
  assert.equal(visible.state, 'visible')
  assert.equal(visible.contentHash, contentHash(text))
  text = 'shit'
  assert.equal((await checkPublished([markee]))[0].state, 'soft-flagged')
  assert.equal((await evaluateObserved(markee, text, strategy, { board: true, site: true })).state, 'manual-flagged')
  available = false
  assert.equal((await checkPublished([markee]))[0].state, 'unavailable')
})

test('a claimed victim board or canonical factory cannot inject soft flags; real members pass', async t => {
  const { records } = setup(t)
  assert.equal((await checkPublished([fake]))[0].state, 'unavailable')
  assert.equal(records.has(softKey(fake)), false)
  assert.deepEqual(await trustedMembership([{ markee, board: attackerBoard }]), [false])
  assert.equal((await evaluateObserved(fake, 'shit', board, { board: false, site: false })).state, 'unavailable')
  assert.equal(records.has(softKey(fake)), false)
  assert.equal((await checkPublished([markee]))[0].state, 'soft-flagged')
  assert.equal(records.has(softKey(markee)), true)
  assert.deepEqual(await trustedMembership([{ markee, board: V13_LEADERBOARDS.GARDENS }]), [true])
})

test('unknown RPC membership never becomes trusted or deletes a persisted flag', async t => {
  const s = setup(t)
  const record = { markee, board, contentHash: contentHash('shit'), state: 'soft-flagged', siteState: 'soft-flagged', policyVersion: AUTO_POLICY }
  s.records.set(softKey(markee), record); s.index.add(markee)
  t.mock.method(s.client, 'multicall', async ({ contracts }: any) => contracts.map(() => ({ status: 'failure' })))
  assert.deepEqual(await trustedMembership([{ markee, board }]), [null])
  await assert.rejects(softRecords(), /membership unavailable/)
  assert.equal(s.index.has(markee), true)
  assert.equal(s.records.has(softKey(markee)), true)
})

test('legacy injected soft-index records are purged without dropping legitimate records', async t => {
  const s = setup(t)
  for (const id of [fake, markee]) {
    s.index.add(id)
    s.records.set(softKey(id), { markee: id, board, state: 'soft-flagged', siteState: 'soft-flagged', contentHash: contentHash('shit'), policyVersion: AUTO_POLICY })
  }
  assert.deepEqual((await softRecords()).map(r => r.markee), [markee])
  assert.equal(s.index.has(fake), false)
  assert.equal(s.records.has(softKey(fake)), false)
  assert.ok(s.records.get('sdk:snapshots:generation'))
})

test('queue does not surface previously injected ordinary or automatic entries', async t => {
  setup(t)
  t.mock.method(queueDeps, 'listModeratedBoards', async () => [{ address: board, name: 'Board', platform: null, strategy: 'fixed', moderators: [moderator] }])
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  t.mock.method(queueDeps, 'pipeline', () => { const p = { zrange() { return p }, async exec() { return [[fake, markee]] } }; return p })
  const review = { status: 'pending', reviewedBy: null, reviewedAt: null }
  t.mock.method(queueDeps, 'readItems', async () => [fake, markee].map(id => ({ markee: id, board, message: 'shit', name: '', author: '', kind: 'created', previousMessage: null, blockNumber: '1', at: 1, reviews: { board: review, site: review } })))
  // Inject via this seam to independently test queue ingestion, not only softRecords cleanup.
  t.mock.method(queueDeps, 'softRecords', async () => [{ markee: fake, board, state: 'soft-flagged', siteState: 'soft-flagged', contentHash: contentHash('shit'), policyVersion: AUTO_POLICY }])
  const result = await (await queue(new NextRequest(`https://www.markee.xyz/api/moderation/queue?moderator=${moderator}`))).json()
  assert.deepEqual(result.items.map((r: any) => r.markee), [markee])
  assert.deepEqual(result.flagged, [])
})

test('queue never lists a blank seed Markee, even one carrying a flag', async t => {
  setup(t)
  t.mock.method(queueDeps, 'listModeratedBoards', async () => [{ address: board, name: 'Board', platform: null, strategy: 'fixed', moderators: [moderator] }])
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [flagKey(markee)], site: [] }))
  t.mock.method(queueDeps, 'pipeline', () => { const p = { zrange() { return p }, async exec() { return [[markee]] } }; return p })
  const flaggedReview = { status: 'flagged', reviewedBy: null, reviewedAt: null }
  t.mock.method(queueDeps, 'readItems', async () => [{ markee, board, message: '', name: '', author: '', kind: 'created', previousMessage: null, blockNumber: '1', at: 1, reviews: { board: flaggedReview, site: flaggedReview } }])
  t.mock.method(queueDeps, 'softRecords', async () => [])
  t.mock.method(automaticDeps, 'read', async () => [{ markee, board, message: '', blockNumber: '2' }])
  const result = await (await queue(new NextRequest(`https://www.markee.xyz/api/moderation/queue?moderator=${moderator}`))).json()
  assert.deepEqual(result.items, [])
  assert.deepEqual(result.flagged, [])
})

test('views reject malformed, oversized, unrelated, duplicate and rate-limited requests before moderation', async t => {
  setup(t)
  let reads = 0
  t.mock.method(automaticDeps, 'read', async () => { reads++; throw new Error('Must not read chain') })
  t.mock.method(viewsWriteDeps, 'get', async (key: string) => key.startsWith('oi:meta:') ? { verifiedUrls: ['https://allowed.example'] } : true)
  t.mock.method(viewsWriteDeps, 'set', async () => 'OK')
  t.mock.method(viewsWriteDeps, 'mget', async () => [3, 2])
  t.mock.method(viewsWriteDeps, 'underRateLimit', async () => true)
  const request = (body: unknown, origin = 'https://allowed.example') => new NextRequest('https://www.markee.xyz/api/views', { method: 'POST', headers: { origin }, body: JSON.stringify(body) })
  for (const body of [null, { address: [], message: 'hello' }, { address: markee, message: {} }, { address: 'bad', message: 'hello' }, { address: markee, message: 'x'.repeat(4097) }, { address: markee, message: 'hello', url: 'x'.repeat(2049) }]) assert.equal((await view(request(body))).status, 400)
  assert.equal((await view(request({ address: markee, message: 'x'.repeat(20000) }))).status, 413)
  assert.equal((await (await view(request({ address: markee, message: 'hello' }, 'https://attacker.example'))).json()).counted, false)
  assert.equal((await (await view(request({ address: markee, message: 'hello' }))).json()).counted, false)
  t.mock.method(viewsWriteDeps, 'underRateLimit', async () => false)
  assert.equal((await view(request({ address: markee, message: 'hello' }))).status, 429)
  assert.equal(reads, 0)
})

test('visible accepted views count; hidden and unavailable messages never increment', async t => {
  setup(t)
  t.mock.method(viewsWriteDeps, 'get', async () => null)
  t.mock.method(viewsWriteDeps, 'set', async () => 'OK')
  t.mock.method(viewsWriteDeps, 'underRateLimit', async () => true)
  t.mock.method(viewsWriteDeps, 'mget', async () => [3, 2])
  let increments = 0
  t.mock.method(viewsWriteDeps, 'pipeline', () => {
    const p = { incr() { increments++; return p }, set() { return p }, hincrby() { return p }, async exec() { return [4, 3] } }; return p
  })
  const request = () => new NextRequest('https://www.markee.xyz/api/views', { method: 'POST', headers: { origin: 'https://www.markee.xyz' }, body: JSON.stringify({ address: markee, message: 'Hello' }) })
  t.mock.method(automaticDeps, 'read', async () => [{ markee, board, message: 'Hello' }])
  assert.equal((await (await view(request())).json()).counted, true)
  const before = increments
  t.mock.method(automaticDeps, 'read', async () => [{ markee, board, message: 'shit' }])
  assert.equal((await (await view(request())).json()).counted, false)
  t.mock.method(automaticDeps, 'read', async () => [])
  assert.equal((await (await view(request())).json()).counted, false)
  assert.equal(increments, before)
})

test('site-only false positives stay discoverable for an explicit SDK approval', async t => {
  setup(t)
  const record = { markee, board, state: 'soft-flagged', siteState: 'visible', contentHash: contentHash('shit'), policyVersion: AUTO_POLICY }
  t.mock.method(queueDeps, 'listModeratedBoards', async () => [{ address: board, name: 'Board', platform: null, strategy: 'fixed', moderators: [moderator] }])
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  t.mock.method(queueDeps, 'pipeline', () => { const p = { zrange() { return p }, async exec() { return [[]] } }; return p })
  t.mock.method(queueDeps, 'softRecords', async () => [record])
  t.mock.method(queueDeps, 'readItems', async () => [])
  const response = await queue(new NextRequest(`https://www.markee.xyz/api/moderation/queue?moderator=${moderator}`))
  const result = await response.json()
  assert.equal(result.flagged.length, 1)
  assert.equal(result.flagged[0].message, 'shit')
  assert.equal(result.flagged[0].automatic.siteState, 'visible')
})

test('pending queue refreshes current text before the scanner catches up and preserves manual flags', async t => {
  setup(t)
  const pending = { status: 'pending', reviewedBy: null, reviewedAt: null }
  const old = { markee, board, message: 'shite', name: 'Author', author: moderator, kind: 'edited', previousMessage: 'Real message', blockNumber: '80', at: 1, reviews: { board: pending, site: pending } }
  t.mock.method(queueDeps, 'listModeratedBoards', async () => [{ address: board, name: 'Board', platform: null, strategy: 'fixed', moderators: [moderator] }])
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  t.mock.method(queueDeps, 'pipeline', () => { const p = { zrange() { return p }, async exec() { return [[markee]] } }; return p })
  t.mock.method(queueDeps, 'softRecords', async () => [])
  t.mock.method(queueDeps, 'readItems', async () => [old])
  t.mock.method(automaticDeps, 'read', async () => [{ markee, board, message: 'bullshit', blockNumber: '100' }])
  const req = () => new NextRequest(`https://www.markee.xyz/api/moderation/queue?moderator=${moderator}`)
  const result = await (await queue(req())).json()
  assert.equal(result.items[0].message, 'bullshit')
  assert.equal(result.items[0].previousMessage, 'Real message')
  assert.equal(result.items[0].blockNumber, '100')
  assert.equal(old.message, 'shite', 'read-only refresh must not mutate stored reviews')
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [`8453:${markee}`], site: [] }))
  const flagged = await (await queue(req())).json()
  assert.equal(flagged.items.length, 0)
  assert.equal(flagged.flagged[0].message, 'bullshit')
  t.mock.method(automaticDeps, 'read', async () => [])
  t.mock.method(console, 'error', () => {})
  assert.equal((await queue(req())).status, 500, 'RPC failure must not expose an older revision for approval')
})

test('queue refreshes only its candidates in batches of at most fifty', async t => {
  setup(t)
  const pending = { status: 'pending', reviewedBy: null, reviewedAt: null }
  const rows = Array.from({ length: 51 }, (_, i) => ({ markee: `0x${(i + 1).toString(16).padStart(40, '0')}`, board, message: 'old text', name: '', author: moderator, kind: 'created', previousMessage: null, blockNumber: '1', at: 1, reviews: { board: pending, site: pending } }))
  t.mock.method(queueDeps, 'listModeratedBoards', async () => [{ address: board, name: 'Board', platform: null, strategy: 'fixed', moderators: [moderator] }])
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  t.mock.method(queueDeps, 'pipeline', () => { const p = { zrange() { return p }, async exec() { return [rows.map(row => row.markee)] } }; return p })
  t.mock.method(queueDeps, 'softRecords', async () => [])
  t.mock.method(queueDeps, 'readItems', async () => rows)
  t.mock.method(automaticDeps, 'membership', async (pairs: unknown[]) => pairs.map(() => true))
  const batches: number[] = []
  t.mock.method(automaticDeps, 'read', async (ids: string[]) => { batches.push(ids.length); return ids.map(markee => ({ markee, board, message: 'current text' })) })
  const result = await (await queue(new NextRequest(`https://www.markee.xyz/api/moderation/queue?moderator=${moderator}`))).json()
  assert.deepEqual(batches, [50, 1])
  assert.equal(result.items.length, 51)
  assert.ok(result.items.every((item: any) => item.message === 'current text'))
})

test('cached embed text is withheld on moderation outage, new manual flag, auto flag or changed text', async t => {
  setup(t)
  const payload = { topMarkeeAddress: markee, message: 'Hello', name: 'Author', flagged: false }
  t.mock.method(embedModerationDeps, 'flags', async () => { throw new Error('KV down') })
  assert.equal((await moderateEmbed(payload)).message, '')
  t.mock.method(embedModerationDeps, 'flags', async () => ({ board: [`8453:${markee}`], site: [] }))
  assert.equal((await moderateEmbed(payload)).name, '')
  t.mock.method(embedModerationDeps, 'flags', async () => ({ board: [], site: [] }))
  t.mock.method(embedModerationDeps, 'checkPublished', async () => [{ markee, board, state: 'soft-flagged', siteState: 'visible', contentHash: contentHash('Hello'), policyVersion: AUTO_POLICY }])
  assert.equal((await moderateEmbed(payload)).flagged, true)
  t.mock.method(embedModerationDeps, 'checkPublished', async () => [{ markee, board, state: 'visible', siteState: 'visible', contentHash: contentHash('edited text'), policyVersion: AUTO_POLICY }])
  assert.equal((await moderateEmbed(payload)).message, '')
  t.mock.method(embedModerationDeps, 'checkPublished', async () => [{ markee, board, state: 'visible', siteState: 'visible', contentHash: contentHash('Hello'), policyVersion: AUTO_POLICY }])
  assert.equal((await moderateEmbed(payload)).message, 'Hello')
})

test('queue keeps a flagged message listed after its text is cleared, so it can be unflagged', async t => {
  setup(t)
  t.mock.method(queueDeps, 'listModeratedBoards', async () => [{ address: board, name: 'Board', platform: null, strategy: 'fixed', moderators: [moderator] }])
  t.mock.method(queueDeps, 'readAllFlagged', async () => ({ board: [flagKey(markee)], site: [] }))
  t.mock.method(queueDeps, 'pipeline', () => { const p = { zrange() { return p }, async exec() { return [[markee]] } }; return p })
  const flaggedReview = { status: 'flagged', reviewedBy: moderator, reviewedAt: 1 }
  t.mock.method(queueDeps, 'readItems', async () => [{ markee, board, message: 'rude', name: '', author: '', kind: 'created', previousMessage: null, blockNumber: '1', at: 1, reviews: { board: flaggedReview, site: flaggedReview } }])
  t.mock.method(queueDeps, 'softRecords', async () => [])
  // The owner cleared the message with a direct contract call.
  t.mock.method(automaticDeps, 'read', async () => [{ markee, board, message: '', blockNumber: '2' }])
  const result = await (await queue(new NextRequest(`https://www.markee.xyz/api/moderation/queue?moderator=${moderator}`))).json()
  assert.deepEqual(result.items, [])
  assert.deepEqual(result.flagged.map((r: any) => [r.markee, r.message, r.previousMessage]), [[markee, '', 'rude']])
})
