import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { POST as sdkPost } from '../app/api/sdk/v1/[...path]/route'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import { NextRequest } from 'next/server'
import { viewsWriteDeps } from '../lib/views/write-deps'
import { metaWriteDeps } from '../lib/openinternet/meta-deps'
import { POST as updateMeta } from '../app/api/openinternet/meta/route'
import { POST } from '../app/api/views/route'
import { isTrustedHost, normalizeHost } from '../lib/views/host'
import { metaFields, metaUpdateMessage } from '../lib/openinternet/meta'

test('registered boards reject unrelated Vercel and loopback-lookalike hosts', async t => {
  const id = '0x3333333333333333333333333333333333333333'
  let dedupeReads = 0
  t.mock.method(viewsWriteDeps, 'get', async (key: string) => {
    if (key.startsWith('oi:meta:')) return { verifiedUrls: ['https://registered.vercel.app'] }
    dedupeReads++
    return true // already counted; legitimate request reaches rate limiter
  })
  t.mock.method(viewsWriteDeps, 'underRateLimit', async () => true)
  t.mock.method(viewsWriteDeps, 'mget', async () => [3, 2])
  t.mock.method(viewsWriteDeps, 'set', async () => 'OK')
  for (const origin of ['https://attacker.vercel.app', 'https://markee-attacker.vercel.app', 'https://127.attacker.example']) {
    assert.equal(isTrustedHost(normalizeHost(origin)), false)
    const res = await POST(new NextRequest('https://markee.xyz/api/views', { method: 'POST', headers: { origin }, body: JSON.stringify({ address: id, message: 'hello' }) }))
    assert.equal((await res.json()).counted, false)
  }
  assert.equal(dedupeReads, 0)
  await POST(new NextRequest('https://markee.xyz/api/views', { method: 'POST', headers: { origin: 'https://registered.vercel.app' }, body: JSON.stringify({ address: id, message: 'hello' }) }))
  assert.equal(dedupeReads, 1)
  for (const host of ['markee.xyz', 'staging.markee.xyz', 'localhost', '127.0.0.1', '[::1]', null]) assert.equal(isTrustedHost(host), true)
})

test('metadata v2 clears explicit blanks, preserves omissions, and binds field boundaries', async () => {
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
  const ts = 1234
  const message = (update: Parameters<typeof metaUpdateMessage>[2], version: 1 | 2 = 2) => metaUpdateMessage(8453, account.address, update, ts, version)
  assert.deepEqual({ logoUrl: 'old', siteUrl: 'old', ...metaFields({ logoUrl: '' }, 2) }, { logoUrl: '', siteUrl: 'old' })
  assert.deepEqual(metaFields({ logoUrl: '', siteUrl: '' }, 2), { logoUrl: '', siteUrl: '' })
  assert.deepEqual(metaFields({ logoUrl: '', siteUrl: '' }, 1), {})
  const sig = await account.signMessage({ message: message({ siteUrl: 'site' }) })
  assert.equal(await verifyMessage({ address: account.address, message: message({ siteUrl: 'site', logoUrl: '' }), signature: sig }), false)
  assert.notEqual(message({ logoUrl: 'a|b', siteUrl: 'c' }), message({ logoUrl: 'a', siteUrl: 'b|c' }))
  const legacy = await account.signMessage({ message: message({ siteUrl: 'site' }, 1) })
  assert.equal(await verifyMessage({ address: account.address, message: message({ siteUrl: 'site', logoUrl: '' }), signature: legacy }), false)
  assert.equal(await verifyMessage({ address: account.address, message: message({ siteUrl: 'site' }, 1), signature: legacy }), true)
})

test('metadata route preserves safe v1 and verifies v2 clearing authorization before writes', async t => {
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
  const timestamp = Math.floor(Date.now() / 1000)
  const board = account.address.toLowerCase()
  const existing = { logoUrl: 'old-logo', siteUrl: 'old-site', status: 'verified', verifiedUrls: ['https://example.com'] }
  const writes: Record<string, unknown>[] = []
  t.mock.method(metaWriteDeps, 'readBoardOwners', async () => [[board]])
  t.mock.method(metaWriteDeps, 'get', async () => existing)
  t.mock.method(metaWriteDeps, 'set', async (_key: string, value: Record<string, unknown>) => { writes.push(value); return 'OK' })
  t.mock.method(metaWriteDeps, 'del', async () => 1)
  const request = (body: object) => new Request('https://markee.xyz/api/openinternet/meta', { method: 'POST', body: JSON.stringify(body) })
  const legacyUpdate = { siteUrl: 'new-site' }
  const signature = await account.signMessage({ message: metaUpdateMessage(8453, board, legacyUpdate, timestamp, 1) })
  const base = { leaderboardAddress: board, owner: account.address, timestamp }
  assert.equal((await updateMeta(request({ ...base, ...legacyUpdate, signature }))).status, 200)
  assert.deepEqual(writes[0], { ...existing, siteUrl: 'new-site' })
  assert.equal((await updateMeta(request({ ...base, ...legacyUpdate, signature, logoUrl: '' }))).status, 200)
  assert.equal(writes[1].logoUrl, 'old-logo')
  assert.equal((await updateMeta(request({ ...base, ...legacyUpdate, signature, logoUrl: '', signatureVersion: 2 }))).status, 401)
  assert.equal((await updateMeta(request({ ...base, ...legacyUpdate, signature, logoUrl: 'a|b' }))).status, 400)
  assert.equal(writes.length, 2)
  const clear = { logoUrl: '', siteUrl: '' }
  const clearSignature = await account.signMessage({ message: metaUpdateMessage(8453, board, clear, timestamp) })
  assert.equal((await updateMeta(request({ ...base, ...clear, signature: clearSignature, signatureVersion: 2 }))).status, 200)
  assert.deepEqual(writes[2], { ...existing, ...clear })
})

test('published SDK view requests remain compatible with the changed API', async t => {
  const modulePath = process.env.MARKEE_PUBLISHED_SDK_MODULE
  if (!modulePath) { t.skip('Set MARKEE_PUBLISHED_SDK_MODULE to the installed published dist/index.js'); return }
  const { MarkeeClient } = await import(pathToFileURL(modulePath).href)
  t.mock.method(viewsWriteDeps, 'get', async (key: string) => key.startsWith('oi:meta:') ? { verifiedUrls: ['https://registered.vercel.app'] } : true)
  t.mock.method(viewsWriteDeps, 'underRateLimit', async () => true)
  t.mock.method(viewsWriteDeps, 'mget', async () => [3, 2])
  t.mock.method(viewsWriteDeps, 'set', async () => 'OK')
  for (const origin of ['https://registered.vercel.app', 'https://unregistered.vercel.app']) {
    const client = new MarkeeClient({ fetch: async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      headers.set('origin', origin)
      return sdkPost(new NextRequest(url, { method: init.method, body: init.body, headers, signal: init.signal ?? undefined }), { params: { path: ['views'] } })
    } })
    const result = await client.recordView('0x3333333333333333333333333333333333333333', 'hello', origin)
    assert.deepEqual(result, { totalViews: 3, messageViews: 2, counted: false })
  }
})
