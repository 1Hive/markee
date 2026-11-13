import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { publicIP } from '../lib/net/public-address'
import { fetchPublic, publicFetchDeps, PublicFetchError, type PinnedRequest } from '../lib/net/public-fetch'
import { checkIntegrationHealth, healthDeps, healthEndpoint, normalizeHealth } from '../lib/openinternet/health'
import { reactionsDeps } from '../lib/reactions-deps'
import { reactionMessage } from '../lib/reactions'
import { GET as getReactions, POST as postReaction, DELETE as deleteReaction } from '../app/api/reactions/route'
import { safeReturnPath } from '../lib/github/return-path'
import { emailThrottleDeps } from '../lib/moderation/email-throttle'
import { POST as notifyPost } from '../app/api/moderation/notify/route'
import { notifyEmailMessage } from '../lib/moderation/queue'
import { clientErrorDeps, clientErrorForwarding, sanitizePathname, sanitizeReportText } from '../lib/server/client-errors'
import { everFundedDeps } from '../lib/streaming/ever-funded-deps'
import { GET as everFunded } from '../app/api/streaming/ever-funded/route'
import { readRateLimited } from '../lib/rate-limit'

const user = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const other = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const markee = '0x3333333333333333333333333333333333333333'
const board = '0x4444444444444444444444444444444444444444'
const now = () => Math.floor(Date.now() / 1000)
const json = (url: string, method: string, body: unknown) => new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.114.9' } })

test('only globally routable addresses count as public, including embedded IPv4 forms', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) assert.equal(publicIP(ip), true, ip)
  for (const ip of [
    '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe',
    'fc00::1', 'fd00::1', 'fe80::1', 'fec0::1', 'ff02::1', '2001:db8::1', '2001::1', '2002:7f00:1::1', '2002:a9fe:a9fe::1', '3fff::1',
    '::127.0.0.1', 'fe80::1%eth0', 'localhost', 'not-an-ip',
  ]) assert.equal(publicIP(ip), false, ip)
})

function pinnedServer(t: any, dns: Record<string, string[]>, responses: Record<string, { status: number; headers?: Record<string, string>; body?: string }>) {
  const sent: PinnedRequest[] = []
  t.mock.method(publicFetchDeps, 'lookup', async (host: string) => {
    const records = dns[host]
    if (!records) throw new Error('ENOTFOUND')
    return records.map(address => ({ address, family: address.includes(':') ? 6 : 4 }))
  })
  t.mock.method(publicFetchDeps, 'send', async (req: PinnedRequest) => {
    sent.push(req)
    const res = responses[req.url.href] ?? { status: 404 }
    return { status: res.status, headers: res.headers ?? {}, body: Buffer.from(res.body ?? '') }
  })
  return sent
}

test('public fetch refuses private targets on every hop and pins the vetted address', async t => {
  const sent = pinnedServer(t, {
    'site.example': ['93.184.216.34'],
    'www.site.example': ['93.184.216.35'],
    'internal.example': ['10.0.0.5'],
    'mixed.example': ['93.184.216.34', '127.0.0.1'],
    'v6.example': ['fd00::1'],
  }, {
    'https://site.example/redirect-internal': { status: 302, headers: { location: 'https://internal.example/' } },
    'https://site.example/redirect-metadata': { status: 301, headers: { location: 'https://169.254.169.254/latest' } },
    'https://site.example/redirect-http': { status: 302, headers: { location: 'http://www.site.example/' } },
    'https://site.example/redirect-www': { status: 301, headers: { location: 'https://www.site.example/ok' } },
    'https://www.site.example/ok': { status: 200, body: 'ok' },
    'https://site.example/loop': { status: 302, headers: { location: '/loop' } },
  })
  const code = async (url: string) => {
    try { await fetchPublic(url); return 'ok' } catch (e) { return e instanceof PublicFetchError ? e.code : 'other' }
  }
  assert.equal(await code('https://internal.example/'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://mixed.example/'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://v6.example/'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://[::1]/'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://[::ffff:7f00:1]/'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://0.0.0.0/'), 'PRIVATE_ADDRESS')
  assert.equal(await code('http://site.example/'), 'INVALID_URL')
  assert.equal(await code('file:///etc/passwd'), 'INVALID_URL')
  assert.equal(await code('https://user:pass@site.example/'), 'INVALID_URL')
  assert.equal(await code('https://site.example/redirect-internal'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://site.example/redirect-metadata'), 'PRIVATE_ADDRESS')
  assert.equal(await code('https://site.example/redirect-http'), 'INVALID_URL')
  assert.equal(await code('https://site.example/loop'), 'TOO_MANY_REDIRECTS')
  assert.equal(sent.some(r => r.address === '10.0.0.5' || r.address === '169.254.169.254'), false)

  sent.length = 0
  const res = await fetchPublic('https://site.example/redirect-www')
  assert.equal(res.body.toString(), 'ok')
  assert.deepEqual(sent.map(r => [r.url.href, r.address]), [['https://site.example/redirect-www', '93.184.216.34'], ['https://www.site.example/ok', '93.184.216.35']])
})

test('health endpoint is rebuilt from the origin alone', () => {
  assert.equal(healthEndpoint('https://gitcoin.co')?.href, 'https://gitcoin.co/api/markee/health')
  assert.equal(healthEndpoint('https://site.example/any/path?x=1#')?.href, 'https://site.example/api/markee/health')
  assert.equal(healthEndpoint('https://site.example/?')?.href, 'https://site.example/api/markee/health')
  for (const bad of [null, '', 'http://site.example', 'https://169.254.169.254', 'https://[::1]', 'https://localhost', 'https://site.example:8443', 'https://a:b@site.example', 'javascript:alert(1)', `https://${'a'.repeat(2050)}.example`]) {
    assert.equal(healthEndpoint(bad), null, String(bad).slice(0, 40))
  }
})

test('health responses keep only the known fields with bounded values', () => {
  const health = normalizeHealth({
    overall: 'ok', message: 'x'.repeat(1_000), secret: 'leak', timestamp: 5,
    checks: {
      leaderboard: { status: 'ok', message: 'fine', extra: 'leak' },
      moderation: { status: 'bogus', message: 7, detail: { kv: 'down', nested: { a: 1 }, n: 2 } },
      injected: { status: 'ok', message: 'leak' },
    },
  }, 'vercel')
  assert.deepEqual(Object.keys(health).sort(), ['checks', 'message', 'overall', 'platform', 'timestamp'])
  assert.equal(health.message?.length, 300)
  assert.deepEqual(health.checks, {
    leaderboard: { status: 'ok', message: 'fine' },
    moderation: { status: 'unknown', message: '', detail: { kv: 'down', n: 2 } },
  })
  assert.deepEqual(normalizeHealth('not an object', 'unknown'), { overall: 'unknown', platform: 'unknown' })
})

test('health check is rate limited, cached per origin and never relays private targets', async t => {
  const store = new Map<string, unknown>()
  let limited = false
  t.mock.method(healthDeps, 'get', async (k: string) => store.get(k) ?? null)
  t.mock.method(healthDeps, 'set', async (k: string, v: unknown) => { store.set(k, v) })
  t.mock.method(healthDeps, 'rateLimited', async () => limited)
  pinnedServer(t, { 'site.example': ['93.184.216.34'], 'internal.example': ['192.168.0.10'] }, {
    'https://site.example/api/markee/health': { status: 200, headers: { 'x-vercel-id': 'iad1' }, body: JSON.stringify({ overall: 'ok', checks: { moderation: { status: 'ok', message: 'ok' } }, token: 'secret' }) },
  })
  const req = new Request('https://www.markee.xyz/api/openinternet/check-health')

  const ok = await checkIntegrationHealth(req, 'https://site.example/whatever?#')
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.body, { overall: 'ok', platform: 'vercel', checks: { moderation: { status: 'ok', message: 'ok' } } })

  const internal = await checkIntegrationHealth(req, 'https://internal.example')
  assert.deepEqual(internal.body, { overall: 'error', message: 'Integration site must resolve to public addresses' })

  limited = true
  assert.equal((await checkIntegrationHealth(req, 'https://site.example')).status, 200)
  assert.equal((await checkIntegrationHealth(req, 'https://fresh.example')).status, 429)
  assert.equal((await checkIntegrationHealth(req, 'http://site.example')).status, 400)
})

function reactionStore(t: any) {
  const hashes = new Map<string, Record<string, unknown>>()
  const index = new Set<string>()
  t.mock.method(reactionsDeps, 'holdsEnoughMarkee', async () => true)
  t.mock.method(reactionsDeps, 'underRateLimit', async () => true)
  t.mock.method(reactionsDeps, 'cooldown', async () => true)
  t.mock.method(reactionsDeps, 'hgetall', async (k: string) => hashes.get(k) ?? null)
  t.mock.method(reactionsDeps, 'hset', async (k: string, f: string, v: string) => { hashes.set(k, { ...hashes.get(k), [f]: JSON.parse(v) }); return 1 })
  t.mock.method(reactionsDeps, 'hdel', async (k: string, f: string) => { const h = { ...hashes.get(k) }; delete h[f]; hashes.set(k, h); return 1 })
  t.mock.method(reactionsDeps, 'sadd', async (_k: string, m: string) => { index.add(m); return 1 })
  t.mock.method(reactionsDeps, 'smembers', async () => [...index])
  return { hashes, index }
}

test('reactions require a fresh signature from the reacting wallet', async t => {
  const { hashes } = reactionStore(t)
  const url = 'http://localhost/api/reactions'
  const timestamp = now()
  const signature = await user.signMessage({ message: reactionMessage('react', markee, '🚀', timestamp) })
  const body = { markeeAddress: markee, userAddress: user.address, emoji: '🚀', chainId: 8453, timestamp, signature }

  for (const [bad, status] of [
    [{ ...body, signature: undefined }, 401],
    [{ ...body, userAddress: other.address }, 401],
    [{ ...body, signature: await other.signMessage({ message: reactionMessage('react', markee, '🚀', timestamp) }), userAddress: user.address }, 401],
    [{ ...body, timestamp: timestamp - 1_000 }, 401],
    [{ ...body, emoji: '🎉' }, 401],
    [{ ...body, emoji: 'free airdrop at evil.example' }, 400],
    [{ ...body, emoji: 'x'.repeat(100_000) }, 400],
    [{ ...body, markeeAddress: 'not-an-address' }, 400],
    [{ ...body, chainId: 999 }, 400],
  ] as const) assert.equal((await postReaction(json(url, 'POST', bad))).status, status, JSON.stringify(bad).slice(0, 80))
  assert.equal(hashes.size, 0)

  assert.equal((await postReaction(json(url, 'POST', body))).status, 200)
  const listed = await (await getReactions(new NextRequest(url))).json()
  assert.equal(listed.reactions.length, 1)
  assert.equal(listed.reactions[0].emoji, '🚀')

  const removeSig = await other.signMessage({ message: reactionMessage('remove', markee, '', timestamp) })
  assert.equal((await deleteReaction(json(url, 'DELETE', { markeeAddress: markee, userAddress: user.address, timestamp, signature: removeSig }))).status, 401)
  assert.equal((await deleteReaction(new NextRequest(`${url}?markeeAddress=${markee}&userAddress=${user.address}`, { method: 'DELETE' }))).status, 400)
  assert.equal((await (await getReactions(new NextRequest(url))).json()).reactions.length, 1)

  const ownRemove = await user.signMessage({ message: reactionMessage('remove', markee, '', timestamp) })
  assert.equal((await deleteReaction(json(url, 'DELETE', { markeeAddress: markee, userAddress: user.address, timestamp, signature: ownRemove }))).status, 200)
  assert.equal((await (await getReactions(new NextRequest(url))).json()).reactions.length, 0)
})

test('reaction reads tolerate stored strings, parsed objects and malformed rows', async t => {
  const { hashes, index } = reactionStore(t)
  const good = { id: 'a', markeeAddress: markee, userAddress: user.address, emoji: '👍', timestamp: 1, chainId: 8453 }
  hashes.set(`reactions:v2:${markee}`, {
    a: good,
    b: JSON.stringify({ ...good, userAddress: other.address, emoji: '🎉' }),
    c: '{not json',
    d: { ...good, emoji: 'free airdrop' },
    e: 42,
  })
  index.add(markee)
  index.add('garbage')
  const res = await getReactions(new NextRequest('http://localhost/api/reactions'))
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).reactions.map((r: any) => r.emoji).sort(), ['🎉', '👍'])
  const one = await getReactions(new NextRequest(`http://localhost/api/reactions?markeeAddress=${markee}`))
  assert.equal((await one.json()).reactions.length, 2)
  assert.equal((await getReactions(new NextRequest('http://localhost/api/reactions?markeeAddress=nope'))).status, 400)
})

test('sign-in only returns to same-site paths', () => {
  const origin = 'https://www.markee.xyz'
  assert.equal(safeReturnPath('/markee/0xabc?embed=1#files', origin), '/markee/0xabc?embed=1#files')
  assert.equal(safeReturnPath('/account', origin), '/account')
  for (const bad of ['@evil.example/phish', '.evil.example/x', '//evil.example', '/\\evil.example', '\\\\evil.example', 'https://evil.example', 'modal', '', '/\tevil', '/a\nb', 'javascript:alert(1)', null, 42]) {
    assert.equal(safeReturnPath(bad, origin), '', String(bad))
  }
})

test('verification email requests are limited per wallet and per recipient before anything is stored', async t => {
  const blocked = new Set<string>()
  t.mock.method(emailThrottleDeps, 'underRateLimit', async (scope: string) => !blocked.has(scope))
  const timestamp = now()
  const email = 'victim@example.com'
  const signature = await user.signMessage({ message: notifyEmailMessage(8453, user.address.toLowerCase(), email, timestamp) })
  const send = () => notifyPost(json('http://localhost/api/moderation/notify', 'POST', { wallet: user.address, email, signature, timestamp }))

  for (const scope of ['verify-email-ip', 'verify-email-wallet', 'verify-email-recipient']) {
    blocked.clear()
    blocked.add(scope)
    const res = await send()
    assert.equal(res.status, 429, scope)
    assert.match((await res.json()).error, /Too many verification emails/)
  }

  blocked.clear()
  blocked.add('verify-email-recipient')
  const forged = await other.signMessage({ message: notifyEmailMessage(8453, user.address.toLowerCase(), email, timestamp) })
  assert.equal((await notifyPost(json('http://localhost/api/moderation/notify', 'POST', { wallet: user.address, email, signature: forged, timestamp }))).status, 401)
})

test('client error text reaches ops without pings or links, once per repeat and under a global cap', async t => {
  assert.equal(sanitizeReportText('@everyone @here <@123> <@&456> <#789> boom', 200), '[mention] [mention] [mention] [mention] [mention] boom')
  assert.equal(sanitizeReportText('visit https://evil.example/x and www.evil.example or discord.gg/abc', 200), 'visit [link] and [link] or [link]')
  assert.equal(sanitizeReportText('a'.repeat(5_000), 1_000)?.length, 1_000)
  assert.equal(sanitizeReportText(42, 10), undefined)
  assert.equal(sanitizePathname('/markee/0xabc?x=1'), '/markee/0xabc?x=1')
  assert.equal(sanitizePathname('https://evil.example'), '[invalid path]')
  assert.equal(sanitizePathname('//evil.example'), '[invalid path]')

  const seen = new Set<string>()
  let forwarded = 0
  t.mock.method(clientErrorDeps, 'firstSeen', async (key: string) => !seen.has(key) && !!seen.add(key))
  t.mock.method(clientErrorDeps, 'underRateLimit', async () => ++forwarded <= 2)
  assert.equal(await clientErrorForwarding('Error', 'one', undefined), 'forward')
  assert.equal(await clientErrorForwarding('Error', 'one', undefined), 'duplicate')
  assert.equal(await clientErrorForwarding('Error', 'two', 'd1'), 'forward')
  assert.equal(await clientErrorForwarding('Error', 'three', 'd1'), 'over-limit')
})

test('ever-funded scans only boards the streaming factory recognizes', async t => {
  let scanned = 0
  let limited = false
  t.mock.method(everFundedDeps, 'get', async () => null)
  t.mock.method(everFundedDeps, 'set', async () => 'OK')
  t.mock.method(everFundedDeps, 'rateLimited', async () => limited)
  t.mock.method(everFundedDeps, 'isStreamingBoard', async (b: string) => b === board)
  t.mock.method(everFundedDeps, 'backingHistory', async () => { scanned++; return { [user.address.toLowerCase()]: [markee] } })
  const get = (b: string) => everFunded(new NextRequest(`http://localhost/api/streaming/ever-funded?board=${b}`))

  assert.equal((await get(markee)).status, 404)
  assert.equal(scanned, 0)
  const ok = await get(board)
  assert.deepEqual(await ok.json(), { markees: [markee] })
  assert.equal(scanned, 1)
  limited = true
  assert.equal((await get(board)).status, 429)
  assert.equal(scanned, 1)
})

test('read rate limits key on the client address and let reads through when the counter is down', async () => {
  const req = new Request('http://localhost', { headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } })
  let seenIp = ''
  assert.equal(await readRateLimited(req, 'scope', 5, 60, async (_s, ip) => { seenIp = ip; return false }), true)
  assert.equal(seenIp, '198.51.100.7')
  assert.equal(await readRateLimited(req, 'scope', 5, 60, async () => true), false)
  assert.equal(await readRateLimited(req, 'scope', 5, 60, async () => { throw new Error('kv down') }), false)
})
