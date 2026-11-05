import assert from 'node:assert/strict'
import test from 'node:test'
import { MarkeeClient } from '../src/client'
import { MarkeeModal } from '../src/modal'
const id = '0x1111111111111111111111111111111111111111' as const
const placement = { kind: 'board' as const, chainId: 8453, address: id }
const warning = { enabled: true, state: 'soft-flagged', contentHash: 'a'.repeat(64), engine: 'test', policyVersion: 'test', reason: 'Matched profanity filter' }
test('SDK checkMessage uses the hosted endpoint and treats an older missing endpoint as disabled', async () => {
  let url = '', body: unknown
  const client = new MarkeeClient({ fetch: async (input, init) => { url = String(input); body = JSON.parse(String(init?.body)); return Response.json(warning) } })
  assert.deepEqual(await client.checkMessage('text'), warning)
  assert.match(url, /\/moderation\/check$/)
  assert.deepEqual(body, { kind: 'draft', message: 'text' })
  const old = new MarkeeClient({ fetch: async () => Response.json({ error: 'Unknown SDK endpoint.' }, { status: 404 }) })
  assert.equal((await old.checkMessage('text')).enabled, false)
})
test('create and edit warnings stop before preparing or connecting; explicit continuation resumes the exact action', async () => {
  for (const kind of ['create', 'edit-message'] as const) {
    const action = kind === 'create' ? { kind, message: 'text', name: '' } : { kind, message: 'text', markee: id }
    let preparations = 0
    const modal = Object.create(MarkeeModal.prototype) as any
    Object.assign(modal, { account: id, options: { placement }, client: { checkMessage: async () => warning, prepare: async (_p: unknown, received: unknown) => { preparations++; assert.deepEqual(received, action); return { action } } } })
    await modal.prepare(action)
    assert.equal(preparations, 0)
    assert.deepEqual(modal.pendingMessage.action, action)
    await modal.prepare(action, true)
    assert.equal(preparations, 1)
    assert.deepEqual(modal.review.action, action)
  }
})
test('checker outage prompts a warning rather than inventing a pass; non-message actions are unaffected', async () => {
  const modal = Object.create(MarkeeModal.prototype) as any
  let calls = 0
  Object.assign(modal, { account: id, options: { placement }, client: { checkMessage: async () => { throw Error('offline') }, prepare: async () => { calls++; return {} } } })
  await modal.prepare({ kind: 'create', message: 'draft', name: '' })
  assert.equal(modal.messageCheck.state, 'unavailable'); assert.equal(calls, 0)
  await modal.prepare({ kind: 'edit-name', markee: id, name: 'not checked' })
  assert.equal(calls, 1)
})
test('automatic flags and unknown moderation do not disclose message text', () => {
  const modal = Object.create(MarkeeModal.prototype) as any
  assert.doesNotMatch(modal.entryMessageHtml({ message: 'unsafe original', moderated: true, moderation: { state: 'soft-flagged' } }), /unsafe original/)
  assert.match(modal.entryMessageHtml({ message: 'unsafe original', moderated: true, moderation: { state: 'soft-flagged' } }), /automatic moderation/)
  assert.match(modal.entryMessageHtml({ message: 'unsafe original', moderated: true, moderation: { state: 'soft-flagged', reason: 'This message requests wallet secrets.' } }), /requests wallet secrets/)
  assert.ok(!modal.entryMessageHtml({ message: 'unsafe original', moderated: true, moderation: { state: 'soft-flagged', reason: '<script>alert(1)</script>' } }).includes('<script>'))
  assert.doesNotMatch(modal.entryMessageHtml({ message: 'unsafe original', moderated: null }), /unsafe original/)
})
test('a delayed draft response cannot replace the verdict for newer text', async t => {
  const callbacks: Array<() => void> = []
  t.mock.method(globalThis, 'setTimeout', ((callback: () => void) => { callbacks.push(callback); return 1 }) as any)
  t.mock.method(globalThis, 'clearTimeout', (() => {}) as any)
  const input = { value: 'old unsafe text' }, box = { textContent: '' }
  let finishOld!: (value: unknown) => void
  const modal = Object.create(MarkeeModal.prototype) as any
  Object.assign(modal, { messageEpoch: 0, closed: false, root: { querySelector: (selector: string) => selector.includes('name=') ? input : box }, client: { checkMessage: (message: string) => message.startsWith('old') ? new Promise(resolve => { finishOld = resolve }) : Promise.resolve({ ...warning, state: 'pass' }) } })
  modal.scheduleMessageCheck(); callbacks.shift()!()
  input.value = 'new safe text'; modal.scheduleMessageCheck(); callbacks.shift()!()
  await Promise.resolve(); await Promise.resolve()
  finishOld(warning); await Promise.resolve(); await Promise.resolve()
  assert.equal(modal.checkedMessage, 'new safe text')
  assert.equal(modal.messageCheck.state, 'pass')
  assert.equal(box.textContent, '')
})
