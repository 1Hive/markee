import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emailFreqMessage,
  notifyEmailMessage,
  moderatorsMessage,
  normalizeModerators,
  EMAIL_FREQUENCIES,
  type EmailFrequency,
} from '../lib/moderation/queue'

// Pure key-derivation helpers (mirrors lib/moderation/server.ts -- kept here to avoid server-only)
const emailFreqKey = (board: string) => `moderation:email-freq:${board.toLowerCase()}`
const notifyKey    = (wallet: string) => `moderation:notify:email:${wallet.toLowerCase()}`

const CHAIN = 8453
const BOARD = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb'
const WALLET = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc'

// ── emailFreqMessage ──────────────────────────────────────────────────────────

test('emailFreqMessage produces a stable string for every valid frequency', () => {
  const ts = 1000000
  for (const freq of EMAIL_FREQUENCIES) {
    const msg = emailFreqMessage(CHAIN, BOARD, freq, ts)
    assert.equal(typeof msg, 'string')
    assert.ok(msg.includes(freq), `message should include frequency "${freq}"`)
    assert.ok(msg.includes(BOARD.toLowerCase()), 'message should include lowercased board address')
    assert.ok(msg.includes(String(ts)), 'message should include timestamp')
  }
})

test('emailFreqMessage lowercases the board address', () => {
  const upper = emailFreqMessage(CHAIN, BOARD.toUpperCase(), 'every', 1)
  const lower = emailFreqMessage(CHAIN, BOARD.toLowerCase(), 'every', 1)
  assert.equal(upper, lower)
})

test('emailFreqMessage includes chain ID', () => {
  const msg8453  = emailFreqMessage(8453, BOARD, 'daily', 1)
  const msg1     = emailFreqMessage(1,    BOARD, 'daily', 1)
  assert.notEqual(msg8453, msg1)
  assert.ok(msg8453.includes('8453'))
})

test('different timestamps produce different emailFreqMessages', () => {
  const a = emailFreqMessage(CHAIN, BOARD, 'off', 100)
  const b = emailFreqMessage(CHAIN, BOARD, 'off', 200)
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

test('empty moderators list produces valid message', () => {
  const msg = moderatorsMessage(CHAIN, BOARD, [], 1)
  assert.equal(typeof msg, 'string')
  assert.ok(msg.length > 0)
})

// ── normalizeModerators ───────────────────────────────────────────────────────

test('normalizeModerators deduplicates case-insensitively', () => {
  const result = normalizeModerators(['0xAaAa', '0xaaaa', '0xAAAA'])
  assert.equal(result.length, 1)
  assert.equal(result[0], '0xaaaa')
})

test('normalizeModerators sorts deterministically', () => {
  const a = normalizeModerators(['0xcccc', '0xaaaa', '0xbbbb'])
  const b = normalizeModerators(['0xbbbb', '0xcccc', '0xaaaa'])
  assert.deepEqual(a, b)
})

test('normalizeModerators trims whitespace', () => {
  const result = normalizeModerators(['  0xaaaa  '])
  assert.equal(result[0], '0xaaaa')
})

// ── emailFreqKey / notifyKey ─────────────────────────────────────────────────

test('emailFreqKey lowercases board', () => {
  const upper = emailFreqKey(BOARD.toUpperCase())
  const lower = emailFreqKey(BOARD.toLowerCase())
  assert.equal(upper, lower)
  assert.ok(upper.startsWith('moderation:email-freq:'))
})

test('notifyKey lowercases wallet', () => {
  const upper = notifyKey(WALLET.toUpperCase())
  const lower = notifyKey(WALLET.toLowerCase())
  assert.equal(upper, lower)
  assert.ok(upper.startsWith('moderation:notify:email:'))
})

test('emailFreqKey and notifyKey produce distinct key prefixes', () => {
  const freq   = emailFreqKey(BOARD)
  const notify = notifyKey(WALLET)
  assert.notEqual(freq.split(':')[1], notify.split(':')[1])
})

// ── EMAIL_FREQUENCIES completeness ───────────────────────────────────────────

test('EMAIL_FREQUENCIES contains every valid value', () => {
  const expected: EmailFrequency[] = ['every', 'daily', 'off']
  assert.deepEqual([...EMAIL_FREQUENCIES].sort(), [...expected].sort())
})
