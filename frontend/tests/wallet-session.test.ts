import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { authorizeWallet, ID_TOKEN_HEADER, SESSION_REQUIRED, sessionWallets, walletSessionDeps } from '../lib/auth/wallet-session'
import { moderationWriteDeps } from '../lib/moderation/write-deps'
import { POST as moderationPost } from '../app/api/moderation/route'
import { POST as boardPolicyPost } from '../app/api/boards/moderation/route'
import { boardPolicyDeps } from '../lib/moderation/board-policy'
import { metaWriteDeps } from '../lib/openinternet/meta-deps'
import { reviewMessage } from '../lib/moderation/queue'

const APP_ID = 'test-app'
const KID = 'test-kid'
const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const stranger = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const board = '0x3333333333333333333333333333333333333333'
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const rogue = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
const now = () => Math.floor(Date.now() / 1000)

const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
function token(claims: Record<string, unknown>, { key = privateKey, header = { alg: 'ES256', typ: 'JWT', kid: KID } }: { key?: KeyObject; header?: Record<string, unknown> } = {}) {
  const body = `${segment(header)}.${segment({ iss: 'privy.io', aud: APP_ID, sub: 'did:privy:user', iat: now(), exp: now() + 3600, ...claims })}`
  return `${body}.${sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}
const linked = (...addresses: string[]) => JSON.stringify(addresses.map(address => ({ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'metamask', address })))
const idToken = (address: string, claims: Record<string, unknown> = {}) => token({ linked_accounts: linked(address), ...claims })
const request = (headers: Record<string, string> = {}, url = 'http://localhost/api/test', body?: unknown) =>
  new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })

function mockPrivy(t: test.TestContext, userWallets: Record<string, string[]> = {}) {
  t.mock.method(walletSessionDeps, 'appId', () => APP_ID)
  t.mock.method(walletSessionDeps, 'jwks', async () => [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig' }])
  t.mock.method(walletSessionDeps, 'userWallets', async (_appId: string, sub: string) => userWallets[sub] ?? [])
}

test('no session headers means no session was presented', async t => {
  mockPrivy(t)
  assert.equal(await sessionWallets(request()), null)
  const auth = await authorizeWallet(request(), owner.address, undefined, () => 'unused')
  assert.deepEqual(auth, { ok: false, status: 400, body: { error: 'Missing signature or timestamp' } })
})

test('an identity token with the wallet linked authorizes that wallet only', async t => {
  mockPrivy(t)
  const req = request({ [ID_TOKEN_HEADER]: idToken(owner.address) })
  assert.deepEqual(await authorizeWallet(req, owner.address.toLowerCase(), undefined, () => 'unused'), { ok: true, via: 'session' })
  const other = await authorizeWallet(req, stranger.address, undefined, () => 'unused')
  assert.equal(other.ok, false)
  assert.equal(!other.ok && other.body.code, SESSION_REQUIRED)
  assert.equal(!other.ok && other.status, 401)
})

test('a session for another wallet still accepts that wallet\'s signature', async t => {
  mockPrivy(t)
  const message = 'markee:test'
  const req = request({ [ID_TOKEN_HEADER]: idToken(owner.address) })
  const signature = await stranger.signMessage({ message })
  assert.deepEqual(await authorizeWallet(req, stranger.address, signature, () => message), { ok: true, via: 'signature' })
  const forged = await owner.signMessage({ message })
  assert.equal((await authorizeWallet(req, stranger.address, forged, () => message)).ok, false)
})

test('expired, premature, misaddressed, forged and downgraded tokens are rejected', async t => {
  mockPrivy(t)
  const valid = idToken(owner.address)
  const [h, p, s] = valid.split('.')
  const tampered = `${h}.${segment({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), linked_accounts: linked(stranger.address) })}.${s}`
  const rejected = [
    idToken(owner.address, { exp: now() - 120 }),
    idToken(owner.address, { nbf: now() + 600 }),
    idToken(owner.address, { aud: 'another-app' }),
    idToken(owner.address, { iss: 'evil.io' }),
    idToken(owner.address, { sub: '' }),
    token({ linked_accounts: linked(owner.address) }, { key: rogue }),
    token({ linked_accounts: linked(owner.address) }, { header: { alg: 'ES256', kid: 'unknown' } }),
    `${segment({ alg: 'none', kid: KID })}.${p}.`,
    `${segment({ alg: 'HS256', kid: KID })}.${p}.${s}`,
    tampered,
    'not-a-jwt',
  ]
  for (const candidate of rejected) {
    assert.deepEqual(await sessionWallets(request({ [ID_TOKEN_HEADER]: candidate })), [], candidate)
    const auth = await authorizeWallet(request({ [ID_TOKEN_HEADER]: candidate }), owner.address, undefined, () => 'unused')
    assert.equal(!auth.ok && auth.body.code, SESSION_REQUIRED)
  }
  assert.deepEqual(await sessionWallets(request({ [ID_TOKEN_HEADER]: tampered })), [])
})

test('only linked ethereum wallets count', async t => {
  mockPrivy(t)
  const accounts = JSON.stringify([
    { type: 'email', address: owner.address },
    { type: 'wallet', chain_type: 'solana', address: owner.address },
    { type: 'smart_wallet', address: stranger.address },
  ])
  assert.deepEqual(await sessionWallets(request({ [ID_TOKEN_HEADER]: token({ linked_accounts: accounts }) })), [])
})

test('an access token resolves wallets through the Privy user record', async t => {
  mockPrivy(t, { 'did:privy:user': [owner.address.toLowerCase()] })
  const bearer = { Authorization: `Bearer ${token({})}` }
  assert.deepEqual(await authorizeWallet(request(bearer), owner.address, undefined, () => 'unused'), { ok: true, via: 'session' })
  assert.equal((await authorizeWallet(request({ Authorization: `Bearer ${token({ sub: 'did:privy:other' })}` }), owner.address, undefined, () => 'unused')).ok, false)
  assert.equal((await authorizeWallet(request({ Authorization: `Bearer ${token({ exp: now() - 120 })}` }), owner.address, undefined, () => 'unused')).ok, false)
})

test('signature-only actions ignore the session', async t => {
  mockPrivy(t)
  const auth = await authorizeWallet(request({ [ID_TOKEN_HEADER]: idToken(owner.address) }), owner.address, undefined, () => 'unused', { allowSession: false })
  assert.deepEqual(auth, { ok: false, status: 400, body: { error: 'Missing signature or timestamp' } })
})

test('moderation approves with a session but flag and unflag still need a signature', async t => {
  mockPrivy(t)
  t.mock.method(moderationWriteDeps, 'underRateLimit', async () => true)
  t.mock.method(moderationWriteDeps, 'authorizedScopes', async (address: string) => ({ scopes: new Map(address.toLowerCase() === owner.address.toLowerCase() ? [[board, ['board']]] : []), boardMap: new Map() }))
  const pending = { status: 'pending', reviewedBy: null, reviewedAt: null }
  t.mock.method(moderationWriteDeps, 'readItems', async () => [{ markee: board, board, kind: 'created', message: 'Hi', name: '', author: owner.address, previousMessage: null, blockNumber: '1', at: now(), reviews: { board: pending, site: pending } }])
  t.mock.method(moderationWriteDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  let writes = 0
  const pipeline = { set() { return this }, zrem() { return this }, sadd() { return this }, srem() { return this }, async exec() { writes++; return [] } }
  t.mock.method(moderationWriteDeps, 'pipeline', () => pipeline as unknown as ReturnType<typeof moderationWriteDeps.pipeline>)
  const session = { [ID_TOKEN_HEADER]: idToken(owner.address) }
  const body = (action: string, adminAddress = owner.address) => ({ markeeIds: [board], chainId: 8453, action, adminAddress, timestamp: now() })
  const post = (headers: Record<string, string>, payload: unknown) => moderationPost(request(headers, 'http://localhost/api/moderation', payload))

  assert.equal((await post(session, body('approve'))).status, 200)
  assert.equal(writes, 1)
  assert.equal((await post({}, body('approve'))).status, 400)
  assert.equal((await post(session, body('approve', stranger.address))).status, 401)
  assert.equal((await post({ [ID_TOKEN_HEADER]: idToken(stranger.address) }, body('approve', stranger.address))).status, 403)
  assert.equal((await post(session, body('flag'))).status, 400)
  assert.equal((await post(session, body('unflag'))).status, 400)
  assert.equal(writes, 1)
  const timestamp = now()
  const signature = await owner.signMessage({ message: reviewMessage('flag', 8453, [board], timestamp) })
  assert.equal((await post({}, { ...body('flag'), timestamp, signature })).status, 200)
  assert.equal(writes, 2)
})

test('board policy saves with an owner session and rejects non-owners', async t => {
  mockPrivy(t)
  t.mock.method(boardPolicyDeps, 'get', async () => null)
  t.mock.method(boardPolicyDeps, 'set', async () => {})
  t.mock.method(metaWriteDeps, 'readBoardOwners', async () => [[owner.address.toLowerCase()]])
  const policy = { version: 1, rules: { profanity: true, links: false, addresses: false, ens: true } }
  const post = (headers: Record<string, string>, who: string) => boardPolicyPost(request(headers, 'http://localhost/api/boards/moderation', { board, owner: who, policy, timestamp: now() }))
  assert.equal((await post({ [ID_TOKEN_HEADER]: idToken(owner.address) }, owner.address)).status, 200)
  assert.equal((await post({ [ID_TOKEN_HEADER]: idToken(stranger.address) }, stranger.address)).status, 403)
  assert.equal((await post({ [ID_TOKEN_HEADER]: idToken(stranger.address) }, owner.address)).status, 401)
  assert.equal((await post({ [ID_TOKEN_HEADER]: idToken(owner.address, { exp: now() - 120 }) }, owner.address)).status, 401)
  assert.equal((await post({}, owner.address)).status, 400)
})
