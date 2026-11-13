import assert from 'node:assert/strict'
import test from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { boardModerationPolicy, boardPolicyDeps, boardPolicyKey } from '../lib/moderation/board-policy'
import { versionedModerationPolicy } from '../lib/moderation/severity'
import { metaWriteDeps } from '../lib/openinternet/meta-deps'
import { POST, GET, boardPolicyMessage } from '../app/api/boards/moderation/route'

const board = '0x1111111111111111111111111111111111111111'
const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const policy = { version: 1, rules: { profanity: true, links: false, addresses: false, ens: true } }

test('versioned policy rejects unsupported versions and unknown rules', () => {
  assert.equal(versionedModerationPolicy(policy), 'custom:1001')
  assert.throws(() => versionedModerationPolicy({ version: 2, rules: {} }))
  assert.throws(() => versionedModerationPolicy({ version: 1, rules: { unknown: true } }))
  assert.equal(versionedModerationPolicy(undefined, 'strict'), 'strict')
})

test('only a board owner can save a versioned policy; saved policy overrides old requests', async t => {
  const values = new Map<string, { policy: unknown; updatedAt: number }>()
  t.mock.method(boardPolicyDeps, 'get', async (key: string) => values.get(key) ?? null)
  t.mock.method(boardPolicyDeps, 'set', async (key: string, value: { policy: unknown; updatedAt: number }) => { values.set(key, value) })
  t.mock.method(metaWriteDeps, 'readBoardOwners', async () => [[owner.address.toLowerCase()]])
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await owner.signMessage({ message: boardPolicyMessage(board, policy, timestamp) })
  const request = (overrides: Record<string, unknown> = {}) => new Request('http://localhost/api/boards/moderation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, owner: owner.address, policy, timestamp, signature, ...overrides }),
  })
  assert.equal((await POST(request({ owner: '0x2222222222222222222222222222222222222222' }))).status, 403)
  assert.equal((await POST(request({ policy: { version: 1, rules: { links: true } } }))).status, 401)
  assert.equal((await POST(request())).status, 200)
  assert.equal((await POST(request())).status, 409)
  assert.equal(await boardModerationPolicy(board, undefined, 'relaxed'), 'custom:1001')
  assert.deepEqual(values.get(boardPolicyKey(board))?.policy, policy)
  const fetched = await GET(new Request(`http://localhost/api/boards/moderation?board=${board}`))
  assert.equal((await fetched.json()).managed, true)
})
