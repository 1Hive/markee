import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'

import { boardAdminDenial, boardAdminDeps } from '../lib/boards/admin-auth'
import { boardOwnerDeps, readBoardOwners } from '../lib/moderation/server'
import { POST as verifyUrl } from '../app/api/openinternet/verify-url/route'
import { POST as registerFile } from '../app/api/github/register-markee/route'
import { DELETE as unlinkFile } from '../app/api/github/unlink-markee-file/route'
import { POST as saveModerators } from '../app/api/moderation/moderators/route'
import { siteVerifyMessage } from '../lib/openinternet/verify-site'
import { registerFileMessage, unlinkFileMessage } from '../lib/github/unlink'
import { moderatorsMessage, normalizeModerators } from '../lib/moderation/queue'

process.env.KV_REST_API_URL = 'https://kv.test'
process.env.KV_REST_API_TOKEN = 'test'

const board = '0x1111111111111111111111111111111111111111'
const admin = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const formerAdmin = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const victim = '0x3333333333333333333333333333333333333333'
const now = () => Math.floor(Date.now() / 1000)
const message = (ts: number) => `test:${board}:${ts}`

function adminIs(t: any, wallet: string) {
  t.mock.method(boardAdminDeps, 'readBoardOwners', async () => [[wallet.toLowerCase()]])
  t.mock.method(boardAdminDeps, 'contractSignatureValid', async () => false)
}

// In-memory Upstash REST plus a stub GitHub API, so routes run unmodified.
function fakeBackends(t: any, opts: { push?: boolean; content?: string } = {}) {
  const store = new Map<string, string>()
  const githubCalls: string[] = []
  const encode = (v: string | null, b64: boolean) => v === null ? null : b64 ? Buffer.from(v).toString('base64') : v
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://api.github.com/')) {
      githubCalls.push(url)
      if (url.includes('/contents/')) {
        const content = Buffer.from(opts.content ?? '').toString('base64')
        return Response.json({ content, encoding: 'base64' })
      }
      return Response.json({ full_name: 'dev/repo', name: 'repo', owner: { login: 'dev', avatar_url: '' }, html_url: '', private: false, permissions: { push: opts.push ?? true } })
    }
    if (!url.startsWith('https://kv.test')) throw new Error(`Unexpected fetch ${url}`)
    const b64 = new Headers(init?.headers).get('upstash-encoding') === 'base64'
    const run = ([cmd, ...args]: string[]): unknown => {
      switch (cmd.toUpperCase()) {
        case 'GET': return encode(store.get(args[0]) ?? null, b64)
        case 'MGET': return args.map(k => encode(store.get(k) ?? null, b64))
        case 'SET': store.set(args[0], args[1]); return encode('OK', b64)
        case 'DEL': return args.filter(k => store.delete(k)).length
        case 'INCR': { const n = Number(store.get(args[0]) ?? 0) + 1; store.set(args[0], String(n)); return n }
        case 'EXPIRE': return 1
        default: throw new Error(`Unexpected KV command ${cmd}`)
      }
    }
    const body = JSON.parse(String(init?.body))
    if (url.endsWith('/pipeline') || url.endsWith('/multi-exec')) return Response.json(body.map((c: string[]) => ({ result: run(c) })))
    return Response.json({ result: run(body) })
  })
  return { store, githubCalls }
}

test('a board owner is only its current on-chain admin, never a cached creator', async t => {
  const reads: string[] = []
  t.mock.method(boardOwnerDeps, 'client', () => ({
    multicall: async ({ contracts }: any) => contracts.map((c: any) => {
      reads.push(c.functionName)
      return c.address === board ? { status: 'success', result: admin.address } : { status: 'failure' }
    }),
  }) as any)
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Owners must not come from KV') })
  assert.deepEqual(await readBoardOwners([board, victim]), [[admin.address.toLowerCase()], []])
  assert.deepEqual(reads, ['admin', 'admin'])
})

test('board admin signatures are checked for signer, freshness and current admin', async t => {
  adminIs(t, admin.address)
  const ts = now()
  const proof = async (signer = admin, timestamp = ts) => ({ owner: signer.address, timestamp, signature: await signer.signMessage({ message: message(timestamp) }) })

  assert.equal(await boardAdminDenial(board, await proof(), message, 'act'), null)
  assert.equal((await boardAdminDenial(board, {}, message, 'act'))?.status, 400)
  assert.equal((await boardAdminDenial(board, { ...(await proof()), owner: formerAdmin.address }, message, 'act'))?.status, 401)
  assert.equal((await boardAdminDenial(board, await proof(admin, ts - 600), message, 'act'))?.status, 401)
  assert.equal((await boardAdminDenial(board, await proof(formerAdmin), message, 'act'))?.status, 403)
})

test('a smart-contract admin can authorize through ERC-1271', async t => {
  const multisig = '0x4444444444444444444444444444444444444444'
  t.mock.method(boardAdminDeps, 'readBoardOwners', async () => [[multisig]])
  t.mock.method(boardAdminDeps, 'contractSignatureValid', async (args: any) => args.address.toLowerCase() === multisig)
  assert.equal(await boardAdminDenial(board, { owner: multisig, timestamp: now(), signature: '0x1234' }, message, 'act'), null)
})

test('only the board admin can verify a site for it', async t => {
  adminIs(t, admin.address)
  const { store } = fakeBackends(t)
  const url = 'https://site.example/'
  const request = (body: Record<string, unknown>) => new NextRequest('http://localhost/api/openinternet/verify-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: board, url, ...body }),
  })
  const signed = async (signer: typeof admin, signedUrl = url) => {
    const timestamp = now()
    return { owner: signer.address, timestamp, signature: await signer.signMessage({ message: siteVerifyMessage(8453, board, signedUrl, timestamp) }) }
  }

  const unsigned = await verifyUrl(request({}))
  assert.equal(unsigned.status, 400)
  assert.equal((await unsigned.json()).verified, false)
  assert.equal((await verifyUrl(request(await signed(formerAdmin)))).status, 403)
  assert.equal((await verifyUrl(request(await signed(admin, 'https://other.example/')))).status, 401)
  assert.equal([...store.keys()].some(k => k.startsWith('oi:meta:')), false)
})

test('only the board admin can link a new repo file, and an unverified link never takes over traffic', async t => {
  adminIs(t, admin.address)
  const { store } = fakeBackends(t, { content: 'no markers here' })
  store.set('github:session:s1', JSON.stringify({ githubUserId: '7' }))
  store.set('github:user:7', JSON.stringify({ accessToken: 'tok', login: 'dev' }))
  const request = (body: Record<string, unknown>) => new NextRequest('http://localhost/api/github/register-markee', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'github_uid=s1' },
    body: JSON.stringify({ leaderboardAddress: board, repoFullName: 'dev/repo', filePath: 'README.md', ...body }),
  })
  const signed = async (signer: typeof admin) => {
    const timestamp = now()
    return { owner: signer.address, timestamp, signature: await signer.signMessage({ message: registerFileMessage(8453, board, 'dev/repo', 'README.md', timestamp) }) }
  }

  assert.equal((await registerFile(request({}))).status, 400)
  assert.equal((await registerFile(request(await signed(formerAdmin)))).status, 403)
  assert.equal(store.has(`github:markee:${board}`), false)

  const linked = await registerFile(request(await signed(admin)))
  assert.equal(linked.status, 200)
  assert.equal((await linked.json()).verified, false)
  assert.equal(JSON.parse(store.get(`github:markee:${board}`)!).length, 1)
  assert.equal(store.has(`github:contract:${board}`), false)

  assert.equal((await registerFile(request({}))).status, 200, 'refreshing an already linked file only needs push access')
})

test('the board admin can unlink a verified repo file, nobody else can', async t => {
  adminIs(t, admin.address)
  const { store } = fakeBackends(t)
  const file = { repoFullName: 'dev/repo', repoOwner: 'dev', repoName: 'repo', repoAvatarUrl: '', repoHtmlUrl: '', filePath: 'README.md', verified: true, linkedByUid: '7', linkedAt: '' }
  store.set(`github:markee:${board}`, JSON.stringify([file]))
  store.set(`github:contract:${board}`, JSON.stringify({ owner: 'dev', repo: 'repo', githubUserId: '7' }))
  const url = `http://localhost/api/github/unlink-markee-file?${new URLSearchParams({ address: board, repo: file.repoFullName, file: file.filePath })}`
  const signed = async (signer: typeof admin) => {
    const timestamp = now()
    return { owner: signer.address, timestamp, signature: await signer.signMessage({ message: unlinkFileMessage(8453, board, file.repoFullName, file.filePath, timestamp) }) }
  }
  const request = (body: unknown) => new NextRequest(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  assert.equal((await unlinkFile(request(await signed(formerAdmin)))).status, 403)
  assert.equal(JSON.parse(store.get(`github:markee:${board}`)!).length, 1)
  const res = await unlinkFile(request(await signed(admin)))
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).linkedFiles, [])
  assert.equal(store.has(`github:contract:${board}`), false)
})

test("saving moderators never writes another wallet's notification email", async t => {
  t.mock.method(boardOwnerDeps, 'client', () => ({
    multicall: async ({ contracts }: any) => contracts.map(() => ({ status: 'success', result: admin.address })),
  }) as any)
  const { store } = fakeBackends(t)
  const notifyKey = `moderation:notify:${victim}`
  const victimState = JSON.stringify({ email: 'victim@example.com', verified: true, frequency: 'every', setAt: 1 })
  store.set(notifyKey, victimState)
  const moderators = [{ wallet: victim, email: 'someone@example.com' }]
  const timestamp = now()
  const signature = await admin.signMessage({ message: moderatorsMessage(8453, board, normalizeModerators(moderators), timestamp) })

  const res = await saveModerators(new NextRequest('http://localhost/api/moderation/moderators', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, moderators, owner: admin.address, signature, timestamp }),
  }))
  assert.equal(res.status, 200)
  assert.equal(store.get(notifyKey), victimState)
  assert.equal([...store.keys()].some(k => k.startsWith('moderation:verify:')), false)
  assert.deepEqual(JSON.parse(store.get(`moderation:moderators:${board}`)!).moderators, [{ wallet: victim }])
})
