import { POST as sdkPost } from '../app/api/sdk/v1/[...path]/route'
import { viewsWriteDeps } from '../lib/views/write-deps'
import { pathToFileURL } from 'node:url'
import { applySnapshotModeration } from '../lib/sdk/snapshot'
import { POST as checkRoute } from '../app/api/moderation/check/route'
import { POST as recordView } from '../app/api/views/route'
import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { checkDraft, checkPublished, evaluateObserved, softRecords, softKey, AUTO_POLICY, automaticDeps, automaticAuthDeps, contentHash, overrideKey, sharedOverrideKey, AUTO_LANGUAGES } from '../lib/moderation/automatic'
import { falsePositiveMessage } from '../lib/moderation/automatic-message'
import { POST } from '../app/api/moderation/false-positive/route'

const id = '0x1111111111111111111111111111111111111111'
const board = '0x2222222222222222222222222222222222222222'
function enable(t: any) {
  const previous = process.env.FLAG_AUTO_MODERATION
  process.env.FLAG_AUTO_MODERATION = 'true'
  t.after(() => previous === undefined ? delete process.env.FLAG_AUTO_MODERATION : process.env.FLAG_AUTO_MODERATION = previous)
}
function storage(t: any) {
  const records = new Map<string, any>()
  const soft = new Set<string>()
  t.mock.method(automaticDeps, 'membership', async (pairs: unknown[]) => pairs.map(() => true))
  t.mock.method(viewsWriteDeps, 'get', async () => null)
  t.mock.method(viewsWriteDeps, 'set', async () => 'OK')
  t.mock.method(viewsWriteDeps, 'underRateLimit', async () => true)
  t.mock.method(automaticDeps, 'get', async (key: string) => records.get(key) ?? null)
  t.mock.method(automaticDeps, 'members', async () => [...soft])
  t.mock.method(automaticDeps, 'mget', async (...keys: string[]) => keys.map(key => records.get(key) ?? null))
  t.mock.method(automaticDeps, 'flags', async () => ({ board: [], site: [] }))
  t.mock.method(automaticDeps, 'pipeline', () => {
    const pipeline = { set(key: string, value: unknown) { records.set(key, value); return pipeline }, sadd(_key: string, value: string) { soft.add(value); return pipeline }, srem(_key: string, value: string) { soft.delete(value); return pipeline }, async exec() { return [] } }
    return pipeline
  })
  return { records, soft }
}
test('automatic moderation defaults on, supports explicit opt-out, and preserves exact hashes', t => {
  const old = process.env.FLAG_AUTO_MODERATION; delete process.env.FLAG_AUTO_MODERATION
  t.after(() => old === undefined ? delete process.env.FLAG_AUTO_MODERATION : process.env.FLAG_AUTO_MODERATION = old)
  assert.equal(checkDraft('shit').enabled, true)
  assert.equal(checkDraft('shit').state, 'soft-flagged')
  assert.equal(checkDraft('DM your seed phrase to support').state, 'soft-flagged')
  for (const value of ['', 'true', ' TRUE ', 'unrecognized']) {
    process.env.FLAG_AUTO_MODERATION = value
    assert.equal(checkDraft('shit').enabled, true)
  }
  for (const value of ['false', ' FALSE ']) {
    process.env.FLAG_AUTO_MODERATION = value
    assert.equal(checkDraft('shit').enabled, false)
    assert.equal(checkDraft('shit').state, 'pass')
    assert.equal(checkDraft('DM your seed phrase to support').state, 'pass')
  }
  delete process.env.FLAG_AUTO_MODERATION
  assert.equal(checkDraft('shit').state, 'soft-flagged')
  assert.notEqual(contentHash('text'), contentHash('text '))
})

test('draft API advertises moderation enabled with no environment setting and honors explicit false', async t => {
  const old = process.env.FLAG_AUTO_MODERATION
  delete process.env.FLAG_AUTO_MODERATION
  t.after(() => old === undefined ? delete process.env.FLAG_AUTO_MODERATION : process.env.FLAG_AUTO_MODERATION = old)
  t.mock.method(automaticAuthDeps, 'underRateLimit', async () => true)
  const request = () => new NextRequest('https://www.markee.xyz/api/moderation/check', { method: 'POST', body: JSON.stringify({ kind: 'draft', message: 'DM your seed phrase to support' }) })
  const enabled = await (await checkRoute(request())).json()
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.state, 'soft-flagged')
  assert.deepEqual(enabled.reasonCodes, ['SECRET_REQUEST'])
  process.env.FLAG_AUTO_MODERATION = 'false'
  const disabled = await (await checkRoute(request())).json()
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.state, 'pass')
})

test('website rules share draft, published, sale/rent snapshot and view enforcement; passing edits recover', async t => {
  enable(t); const { records, soft } = storage(t)
  t.mock.method(automaticAuthDeps, 'underRateLimit', async () => true)
  t.mock.method(viewsWriteDeps, 'mget', async () => [12, 4])
  let message = 'Support desk: DM your seed phrase to recover funds'
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message }])
  const req = (body: object) => new NextRequest('https://www.markee.xyz/api/moderation/check', { method: 'POST', body: JSON.stringify(body) })
  const draft = await (await checkRoute(req({ kind: 'draft', message }))).json()
  assert.equal(draft.state, 'soft-flagged')
  assert.deepEqual(draft.reasonCodes, ['SECRET_REQUEST'])
  assert.match(draft.reason, /seed phrase/)
  const published = await (await checkRoute(req({ kind: 'published', chainId: 8453, markeeIds: [id] }))).json()
  assert.deepEqual(published.items[0].reasonCodes, draft.reasonCodes)
  assert.equal(soft.has(id), true)
  for (const strategy of ['sale', 'rent']) {
    const input = { chainId: 8453, board, top: id, strategy, warnings: [], entries: [{ address: id, message, moderated: false, totalFunds: '123' }] } as any
    const result = await applySnapshotModeration(input)
    assert.equal(result.entries[0].moderated, true)
    assert.deepEqual(result.entries[0].moderation?.reasonCodes, ['SECRET_REQUEST'])
    assert.equal(result.entries[0].totalFunds, '123')
    for (const artifact of (process.env.MARKEE_PUBLISHED_SDK_MODULES || '').split(',').filter(Boolean)) {
      const { signContent } = await import(pathToFileURL(artifact).href)
      assert.equal(signContent(result).visibility, 'flagged')
    }
  }
  const view = await recordView(new NextRequest('https://www.markee.xyz/api/views', { method: 'POST', body: JSON.stringify({ address: id, message }) }))
  assert.equal((await view.json()).counted, false)
  message = 'gm from alice.eth'
  assert.equal((await checkPublished([id]))[0].state, 'visible')
  assert.equal(soft.has(id), false)
  assert.equal(records.get(softKey(id)).policyVersion, AUTO_POLICY)
})

test('policy upgrades recheck old indexed flags instead of silently dropping them', async t => {
  enable(t); const { records, soft } = storage(t)
  soft.add(id)
  records.set(softKey(id), { markee: id, board, state: 'soft-flagged', siteState: 'soft-flagged', contentHash: contentHash('old text'), policyVersion: 'profanity-3.3.0-v1' })
  let message = 'Send ETH to giveaway-claim.eth and get 2x back'
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message }])
  const refreshed = await softRecords()
  assert.equal(refreshed[0].policyVersion, AUTO_POLICY)
  assert.ok(refreshed[0].reasonCodes?.includes('PAYMENT_SOLICITATION'))
  records.get(softKey(id)).policyVersion = 'older-policy'
  t.mock.method(automaticDeps, 'read', async () => { throw new Error('RPC unavailable') })
  await assert.rejects(softRecords(), /RPC unavailable/)
  assert.equal(soft.has(id), true)
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'Support public goods' }])
  assert.deepEqual(await softRecords(), [])
  assert.equal(soft.has(id), false)
})
test('all twelve dictionaries are enabled; native language fixtures, Unicode, boundaries and known dictionary limitations', t => {
  enable(t)
  assert.deepEqual([...AUTO_LANGUAGES].sort(), ['ar','de','en','es','fr','hi','it','ja','ko','pt','ru','zh'])
  for (const message of ['shit', 'merde', 'mierda', 'scheiße', 'cazzo', 'porra', 'блядь', 'الوغد', 'बिच', '他妈的', 'ファック', 'SHIT', 'ｓｈｉｔ', 'hello merde mierda']) assert.equal(checkDraft(message).state, 'soft-flagged', message)
  for (const message of ['classical music', 'Scunthorpe', 'assistance', 'Hello gardens']) assert.equal(checkDraft(message).state, 'pass', message)
  // Upstream Korean/Japanese dictionaries include mistranslated neutral terms and miss native profanity.
  // These are rollout limitations, not evidence of reliable contextual safety coverage.
  assert.equal(checkDraft('장바구니').state, 'soft-flagged')
  assert.equal(checkDraft('ログイン').state, 'soft-flagged')
  assert.equal(checkDraft('씨발').state, 'pass')
  assert.equal(checkDraft('くそ').state, 'pass')
})
test('soft flags recover on edit; manual flags win; site exceptions never reveal SDK content', async t => {
  enable(t); const { records, soft } = storage(t)
  const manual = { board: false, site: false }
  assert.equal((await evaluateObserved(id, 'shit', board, manual)).state, 'soft-flagged')
  assert.equal(soft.has(id), true)
  const approvedHash = contentHash('shit')
  records.set(overrideKey(id, approvedHash), { scope: 'site' })
  const approved = await evaluateObserved(id, 'shit', board, manual)
  assert.equal(approved.state, 'soft-flagged'); assert.equal(approved.siteState, 'visible')
  assert.equal((await evaluateObserved(id, 'merde', board, manual)).siteState, 'soft-flagged')
  assert.equal((await evaluateObserved(id, 'Hello gardens', board, manual)).state, 'visible')
  assert.equal(soft.has(id), false)
  assert.equal((await evaluateObserved(id, 'Hello gardens', board, { board: true, site: false })).state, 'manual-flagged')
  assert.equal((await evaluateObserved(id, 'shit', board, { board: false, site: true })).siteState, 'manual-flagged')
})
test('shared exceptions restore both surfaces for exact text, preserve manual flags and expire on edits', async t => {
  enable(t); const { records, soft } = storage(t)
  const hash = contentHash('shit')
  await evaluateObserved(id, 'shit', board, { board: false, site: false })
  records.set(sharedOverrideKey(id, hash), { scope: 'all', contentHash: hash })
  const result = await evaluateObserved(id, 'shit', board, { board: false, site: false })
  assert.equal(result.state, 'visible'); assert.equal(result.siteState, 'visible')
  assert.equal(soft.has(id), false)
  assert.equal((await evaluateObserved(id, 'shit', board, { board: true, site: false })).state, 'manual-flagged')
  assert.equal((await evaluateObserved(id, 'shit', board, { board: false, site: true })).siteState, 'manual-flagged')
  assert.equal((await evaluateObserved(id, 'merde', board, { board: false, site: false })).state, 'soft-flagged')
  records.set(sharedOverrideKey(id, hash), { scope: 'all', contentHash: contentHash('other') })
  assert.equal((await evaluateObserved(id, 'shit', board, { board: false, site: false })).state, 'soft-flagged')
})

test('engine and storage outages are unavailable, never passing; manual flags skip the engine', async t => {
  enable(t); storage(t)
  t.mock.method(automaticDeps.engine, 'check', () => { throw Error('checker down') })
  assert.equal(checkDraft('unique engine outage input').state, 'unavailable')
  assert.equal((await evaluateObserved(id, 'unique second engine outage', board, { board: false, site: false })).state, 'unavailable')
  assert.equal((await evaluateObserved(id, 'unique third engine outage', board, { board: true, site: false })).state, 'manual-flagged')
  t.mock.method(automaticDeps, 'get', async () => { throw Error('storage down') })
  assert.equal((await evaluateObserved(id, 'Hello gardens', board, { board: false, site: false })).state, 'unavailable')
})
test('published checks read authoritative server text and honor manual flags', async t => {
  enable(t); storage(t)
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'merde' }])
  assert.equal((await checkPublished([id]))[0].state, 'soft-flagged')
  t.mock.method(automaticDeps, 'flags', async () => ({ board: [`8453:${id}`], site: [] }))
  assert.equal((await checkPublished([id]))[0].state, 'manual-flagged')
})
test('false-positive approval rejects unsigned, unauthorized, stale, altered and raced revisions', async t => {
  enable(t); const { records } = storage(t)
  const moderator = privateKeyToAccount(`0x${'33'.repeat(32)}`)
  const attacker = privateKeyToAccount(`0x${'44'.repeat(32)}`)
  const hash = contentHash('shit'), timestamp = Math.floor(Date.now() / 1000)
  t.mock.method(automaticAuthDeps, 'underRateLimit', async () => true)
  t.mock.method(automaticAuthDeps, 'authorizedScopes', async () => ({ scopes: new Map([[id, ['board']]]), boardMap: new Map([[id, board]]) }))
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'shit' }])
  const signature = await moderator.signMessage({ message: falsePositiveMessage(8453, id, hash, timestamp) })
  const body = { chainId: 8453, markee: id, moderator: moderator.address, contentHash: hash, timestamp, signature }
  const req = (extra: object) => new NextRequest('https://markee.xyz/api/moderation/false-positive', { method: 'POST', body: JSON.stringify({ ...body, ...extra }) })
  assert.equal((await POST(req({ signature: undefined }))).status, 400)
  assert.equal((await POST(req({ signature: await attacker.signMessage({ message: falsePositiveMessage(8453, id, hash, timestamp) }) }))).status, 401)
  assert.equal((await POST(req({ timestamp: timestamp - 1000 }))).status, 401)
  assert.equal((await POST(req({ contentHash: contentHash('changed') }))).status, 401)
  t.mock.method(automaticAuthDeps, 'authorizedScopes', async () => ({ scopes: new Map(), boardMap: new Map() }))
  assert.equal((await POST(req({}))).status, 403)
  t.mock.method(automaticAuthDeps, 'authorizedScopes', async () => ({ scopes: new Map([[id, ['board']]]), boardMap: new Map([[id, board]]) }))
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'changed during signing' }])
  assert.equal((await POST(req({}))).status, 409)
  assert.equal(records.has(overrideKey(id, hash)), false)
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'shit' }])
  assert.equal((await POST(req({}))).status, 200)
  assert.equal(records.has(overrideKey(id, hash)), true)
  const result = (await checkPublished([id]))[0]
  assert.equal(result.siteState, 'visible'); assert.equal(result.state, 'soft-flagged')
  // A legacy site signature cannot be widened by changing the request body.
  assert.equal((await POST(req({ scope: 'all' }))).status, 401)
  assert.equal((await POST(req({ scope: 'unknown' }))).status, 400)
  assert.equal(records.has(sharedOverrideKey(id, hash)), false)
  const sharedSignature = await moderator.signMessage({ message: falsePositiveMessage(8453, id, hash, timestamp, 'all') })
  assert.equal((await POST(req({ signature: sharedSignature }))).status, 401)
  assert.equal((await POST(req({ signature: sharedSignature, scope: 'all' }))).status, 200)
  assert.equal(records.get(sharedOverrideKey(id, hash)).scope, 'all')
  const shared = (await checkPublished([id]))[0]
  assert.equal(shared.state, 'visible'); assert.equal(shared.siteState, 'visible')
})

test('draft and published HTTP boundaries reject invalid inputs and ignore caller-supplied published text', async t => {
  enable(t); storage(t)
  t.mock.method(automaticAuthDeps, 'underRateLimit', async () => true)
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'shit' }])
  const req = (body: unknown) => new NextRequest('https://markee.xyz/api/moderation/check', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await checkRoute(req({ kind: 'draft', message: 'x'.repeat(4097) }))).status, 400)
  assert.equal((await checkRoute(req({ kind: 'published', chainId: 1, markeeIds: [id] }))).status, 400)
  assert.equal((await checkRoute(req({ kind: 'published', chainId: 8453, markeeIds: Array(51).fill(id) }))).status, 400)
  const draft = await (await checkRoute(req({ kind: 'draft', message: 'shit' }))).json()
  assert.equal(draft.state, 'soft-flagged')
  const published = await (await checkRoute(req({ kind: 'published', chainId: 8453, markeeIds: [id], message: 'fake safe message' }))).json()
  assert.equal(published.items[0].state, 'soft-flagged')
  t.mock.method(viewsWriteDeps, 'mget', async () => [12, 4])
  const view = await recordView(new NextRequest('https://markee.xyz/api/views', { method: 'POST', body: JSON.stringify({ address: id, message: 'shit' }) }))
  assert.deepEqual(await view.json(), { totalViews: 12, messageViews: 4, counted: false })
})
test('moderation overlays cached sale/rent snapshots without mutating financial data or trusting a cached pass', async t => {
  enable(t); storage(t)
  for (const strategy of ['sale', 'rent'] as const) {
    const snapshot = { apiVersion: 1, placement: { kind: 'board', chainId: 8453, address: board }, board, chainId: 8453, strategy, warnings: [], top: id, entries: [{ address: id, message: 'shit', moderated: false, totalFunds: '123', score: '456', views: 12 }], wallet: { eth: '789' } } as any
    const result = await applySnapshotModeration(snapshot)
    assert.equal(result.entries[0].moderated, true)
    assert.equal(result.entries[0].moderation?.state, 'soft-flagged')
    assert.equal(snapshot.entries[0].moderated, false)
    assert.equal(result.wallet, snapshot.wallet)
    assert.equal(result.entries[0].totalFunds, '123')
    for (const artifact of (process.env.MARKEE_PUBLISHED_SDK_MODULES || '').split(',').filter(Boolean)) {
      const { signContent } = await import(pathToFileURL(artifact).href)
      assert.equal(signContent(result).visibility, 'flagged')
      const unavailable = { ...result, entries: result.entries.map(entry => ({ ...entry, moderated: null })) }
      assert.equal(signContent(unavailable).visibility, 'unavailable')
    }
  }
})

test('shared false positives restore cached sale/rent SDK signs without changing financial data', async t => {
  enable(t); const { records } = storage(t)
  const hash = contentHash('shit')
  records.set(sharedOverrideKey(id, hash), { scope: 'all', contentHash: hash })
  for (const strategy of ['sale', 'rent'] as const) {
    const snapshot = { apiVersion: 1, placement: { kind: 'board', chainId: 8453, address: board }, board, chainId: 8453, strategy, warnings: [], top: id, entries: [{ address: id, message: 'shit', moderated: true, totalFunds: '123', score: '456', views: 12 }], wallet: { eth: '789' } } as any
    const result = await applySnapshotModeration(snapshot)
    assert.equal(result.entries[0].moderated, false)
    assert.equal(result.entries[0].moderation?.state, 'visible')
    assert.equal(snapshot.entries[0].moderated, true)
    assert.equal(result.wallet, snapshot.wallet)
    assert.equal(result.entries[0].totalFunds, '123')
    for (const artifact of (process.env.MARKEE_PUBLISHED_SDK_MODULES || '').split(',').filter(Boolean)) {
      const { signContent } = await import(pathToFileURL(artifact).href)
      assert.equal(signContent(result).visibility, 'visible')
      assert.equal(signContent(result).entry.message, 'shit')
    }
  }
})

test('development public-data proxy cannot forward an automatically hidden impression', async t => {
  enable(t); storage(t)
  const previous = { NODE_ENV: process.env.NODE_ENV, MARKEE_SDK_PUBLIC_DATA_PROXY: process.env.MARKEE_SDK_PUBLIC_DATA_PROXY }
  Object.assign(process.env, { NODE_ENV: 'development', MARKEE_SDK_PUBLIC_DATA_PROXY: 'true' })
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value })
  t.mock.method(automaticDeps, 'read', async () => [{ markee: id, board, message: 'shit' }])
  t.mock.method(viewsWriteDeps, 'mget', async () => [12, 4])
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Must not forward hidden views to the public API') })
  const request = new NextRequest('http://localhost/api/sdk/v1/views', { method: 'POST', body: JSON.stringify({ address: id, message: 'shit' }) })
  const response = await sdkPost(request, { params: { path: ['views'] } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { totalViews: 12, messageViews: 4, counted: false })
})
