import assert from 'node:assert/strict'
import test from 'node:test'
import {
  notifyEmailMessage,
  notifyFreqMessage,
  moderatorsMessage,
  normalizeModerators,
  EMAIL_FREQUENCIES,
  type EmailFrequency,
  type ModeratorEntry,
} from '../lib/moderation/queue'

// Pure key-derivation helpers (mirrors lib/moderation/server.ts -- kept here to avoid server-only)
const notifyStateKey = (wallet: string) => `moderation:notify:${wallet.toLowerCase()}`
const verifyTokenKey = (token: string) => `moderation:verify:${token}`

const CHAIN = 8453
const BOARD = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb'
const WALLET = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc'

// ── notifyFreqMessage ─────────────────────────────────────────────────────────

test('notifyFreqMessage produces a stable string for every valid frequency', () => {
  const ts = 1000000
  for (const freq of EMAIL_FREQUENCIES) {
    const msg = notifyFreqMessage(CHAIN, WALLET, freq, ts)
    assert.equal(typeof msg, 'string')
    assert.ok(msg.includes(freq), `message should include frequency "${freq}"`)
    assert.ok(msg.includes(WALLET.toLowerCase()), 'message should include lowercased wallet address')
    assert.ok(msg.includes(String(ts)), 'message should include timestamp')
  }
})

test('notifyFreqMessage lowercases the wallet address', () => {
  const upper = notifyFreqMessage(CHAIN, WALLET.toUpperCase(), 'every', 1)
  const lower = notifyFreqMessage(CHAIN, WALLET.toLowerCase(), 'every', 1)
  assert.equal(upper, lower)
})

test('notifyFreqMessage includes chain ID', () => {
  const msg8453 = notifyFreqMessage(8453, WALLET, 'daily', 1)
  const msg1    = notifyFreqMessage(1,    WALLET, 'daily', 1)
  assert.notEqual(msg8453, msg1)
  assert.ok(msg8453.includes('8453'))
})

test('different timestamps produce different notifyFreqMessages', () => {
  const a = notifyFreqMessage(CHAIN, WALLET, 'off', 100)
  const b = notifyFreqMessage(CHAIN, WALLET, 'off', 200)
  assert.notEqual(a, b)
})

// ── notifyEmailMessage ────────────────────────────────────────────────────────

test('notifyEmailMessage lowercases wallet and email', () => {
  const upper = notifyEmailMessage(CHAIN, WALLET.toUpperCase(), 'User@Example.COM', 1)
  const lower = notifyEmailMessage(CHAIN, WALLET.toLowerCase(), 'user@example.com', 1)
  assert.equal(upper, lower)
})

test('notifyEmailMessage is unique per email address', () => {
  const a = notifyEmailMessage(CHAIN, WALLET, 'alice@example.com', 1)
  const b = notifyEmailMessage(CHAIN, WALLET, 'bob@example.com', 1)
  assert.notEqual(a, b)
})

test('notifyEmailMessage is unique per wallet', () => {
  const a = notifyEmailMessage(CHAIN, '0xaaaa', 'x@x.com', 1)
  const b = notifyEmailMessage(CHAIN, '0xbbbb', 'x@x.com', 1)
  assert.notEqual(a, b)
})

// ── moderatorsMessage ─────────────────────────────────────────────────────────

test('moderatorsMessage is order-independent (caller must normalize first)', () => {
  const norm1 = normalizeModerators(['0xBBBB', '0xAAAA'])
  const norm2 = normalizeModerators(['0xAAAA', '0xBBBB'])
  const msg1 = moderatorsMessage(CHAIN, BOARD, norm1, 1)
  const msg2 = moderatorsMessage(CHAIN, BOARD, norm2, 1)
  assert.equal(msg1, msg2)
})

test('moderatorsMessage includes email when present', () => {
  const with_email = moderatorsMessage(CHAIN, BOARD, [{ wallet: '0xaaaa', email: 'foo@bar.com' }], 1)
  const no_email   = moderatorsMessage(CHAIN, BOARD, [{ wallet: '0xaaaa' }], 1)
  assert.notEqual(with_email, no_email)
  assert.ok(with_email.includes('foo@bar.com'))
})

test('empty moderators list produces valid message', () => {
  const msg = moderatorsMessage(CHAIN, BOARD, [], 1)
  assert.equal(typeof msg, 'string')
  assert.ok(msg.length > 0)
})

// ── normalizeModerators ───────────────────────────────────────────────────────

test('normalizeModerators returns ModeratorEntry array', () => {
  const result = normalizeModerators(['0xaaaa'])
  assert.ok(Array.isArray(result))
  assert.ok(typeof result[0] === 'object' && 'wallet' in result[0])
})

test('normalizeModerators deduplicates case-insensitively by wallet', () => {
  const result = normalizeModerators(['0xAaAa', '0xaaaa', '0xAAAA'])
  assert.equal(result.length, 1)
  assert.equal(result[0].wallet, '0xaaaa')
})

test('normalizeModerators sorts deterministically by wallet', () => {
  const a = normalizeModerators(['0xcccc', '0xaaaa', '0xbbbb'])
  const b = normalizeModerators(['0xbbbb', '0xcccc', '0xaaaa'])
  assert.deepEqual(a, b)
})

test('normalizeModerators trims whitespace from wallet', () => {
  const result = normalizeModerators(['  0xaaaa  '])
  assert.equal(result[0].wallet, '0xaaaa')
})

test('normalizeModerators accepts object entries with email', () => {
  const entry: ModeratorEntry = { wallet: '0xaaaa', email: 'Test@Example.COM' }
  const result = normalizeModerators([entry])
  assert.equal(result[0].wallet, '0xaaaa')
  assert.equal(result[0].email, 'test@example.com')
})

test('normalizeModerators accepts mixed strings and objects', () => {
  const result = normalizeModerators(['0xaaaa', { wallet: '0xbbbb', email: 'b@b.com' }])
  assert.equal(result.length, 2)
  assert.equal(result[0].wallet, '0xaaaa')
  assert.equal(result[0].email, undefined)
  assert.equal(result[1].wallet, '0xbbbb')
  assert.equal(result[1].email, 'b@b.com')
})

// ── notifyStateKey / verifyTokenKey ──────────────────────────────────────────

test('notifyStateKey lowercases wallet', () => {
  const upper = notifyStateKey(WALLET.toUpperCase())
  const lower = notifyStateKey(WALLET.toLowerCase())
  assert.equal(upper, lower)
  assert.ok(upper.startsWith('moderation:notify:'))
})

test('verifyTokenKey produces a distinct prefix from notifyStateKey', () => {
  const notify = notifyStateKey(WALLET)
  const verify = verifyTokenKey('abc123')
  assert.notEqual(notify.split(':')[1], verify.split(':')[1])
})

// ── EMAIL_FREQUENCIES completeness ───────────────────────────────────────────

test('EMAIL_FREQUENCIES contains every valid value', () => {
  const expected: EmailFrequency[] = ['every', 'daily', 'off']
  assert.deepEqual([...EMAIL_FREQUENCIES].sort(), [...expected].sort())
})
