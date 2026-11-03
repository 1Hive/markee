import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { moderationWriteDeps as deps } from '../lib/moderation/write-deps'
import { POST } from '../app/api/moderation/route'
import { ADMIN_ADDRESSES } from '../lib/moderation/config'
import type { ModerationItem } from '../lib/moderation/queue'
import { reviewMessage } from '../lib/moderation/queue'
const admin = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const attacker = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const id = '0x3333333333333333333333333333333333333333'
const timestamp = Math.floor(Date.now() / 1000)
const request = (body: object) => new NextRequest('http://localhost/api/moderation', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const base = { markeeIds: [id], chainId: 8453, action: 'approve', adminAddress: admin.address, timestamp }
test('approval rejects unsigned, impersonated, expired, altered and malformed requests before storage', async t => {
  let touched = false
  t.mock.method(deps, 'pipeline', () => { touched = true; throw new Error('must not write') })
  const signature = await admin.signMessage({ message: reviewMessage('approve', 8453, [id], timestamp) })
  for (const [body, status] of [
    [base, 400],
    [{ ...base, signature: await attacker.signMessage({ message: reviewMessage('approve', 8453, [id], timestamp) }) }, 401],
    [{ ...base, signature, timestamp: timestamp - 1000 }, 401],
    [{ ...base, signature, timestamp: 'invalid' }, 401],
    [{ ...base, signature, markeeIds: [attacker.address] }, 401],
    [{ ...base, signature, action: 'flag' }, 401],
  ] as const) assert.equal((await POST(request(body))).status, status)
  assert.equal(touched, false)
})
test('signed approval checks moderator permissions and preserves other scopes', async t => {
  ADMIN_ADDRESSES.push(admin.address)
  t.after(() => { ADMIN_ADDRESSES.pop() })
  t.mock.method(deps, 'authorizedScopes', async (address: string) => ({ scopes: new Map(address === admin.address ? [[id, ['site']]] : []), boardMap: new Map() }))
  t.mock.method(deps, 'underRateLimit', async () => true)
  const pending = { status: 'pending', reviewedBy: null, reviewedAt: null }
  const item = { markee: id, board: id, kind: 'created', message: 'Hello', name: '', author: admin.address, previousMessage: null, blockNumber: '1', at: timestamp, reviews: { board: pending, site: pending } }
  t.mock.method(deps, 'readItems', async () => [item])
  t.mock.method(deps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  let saved: ModerationItem | undefined
  let writes = 0
  const pipeline = { set(_key: string, value: unknown) { saved = value as ModerationItem; return this }, zrem() { return this }, async exec() { writes++; return [] } }
  t.mock.method(deps, 'pipeline', () => pipeline as unknown as ReturnType<typeof deps.pipeline>)
  const signature = await admin.signMessage({ message: reviewMessage('approve', 8453, [id], timestamp) })
  assert.equal((await POST(request({ ...base, signature }))).status, 200)
  assert.equal(writes, 1)
  assert.equal(saved?.reviews.site.reviewedBy, admin.address.toLowerCase())
  assert.equal(saved?.reviews.board.status, 'pending')
  const flagged = { ...item, reviews: { ...item.reviews, site: { status: 'flagged', reviewedBy: admin.address, reviewedAt: timestamp } } }
  t.mock.method(deps, 'readItems', async () => [flagged])
  saved = undefined
  assert.equal((await POST(request({ ...base, signature }))).status, 200)
  assert.equal(saved, undefined, 'approval must not overwrite an existing flag')
  const unauthorized = { ...base, adminAddress: attacker.address, signature: await attacker.signMessage({ message: reviewMessage('approve', 8453, [id], timestamp) }) }
  assert.equal((await POST(request(unauthorized))).status, 403)
  assert.equal(writes, 2)
})
