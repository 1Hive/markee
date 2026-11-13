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
import {
  assignNotifyEmail,
  claimNotifyEmail,
  releaseNotifyEmail,
  normalizeNotifyEmail,
  notifyEmailIndexKey,
  UNVERIFIED_CLAIM_TTL,
  type EmailIndexStore,
} from '../lib/moderation/emailIndex'

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

// ── Unique notification emails ───────────────────────────────────────────────

function memoryEmailIndex() {
  const index = new Map<string, { wallet: string; ttl: number | null }>()
  const emails = new Map<string, string>()
  const store: EmailIndexStore = {
    claim: async (key, wallet, ttl) => {
      const cur = index.get(key)
      if (cur && cur.wallet !== wallet) return cur.wallet
      index.set(key, { wallet, ttl })
      return wallet
    },
    releaseIfHeld: async (key, wallet) => { if (index.get(key)?.wallet === wallet) index.delete(key) },
    currentEmail: async wallet => emails.get(wallet) ?? null,
  }
  const tick = () => new Promise(resolve => setImmediate(resolve))
  const save = async (wallet: string, email: string) => {
    const previous = emails.get(wallet)
    const claim = await assignNotifyEmail(store, email, wallet, {
      writeState: async () => { await tick(); emails.set(wallet, normalizeNotifyEmail(email)) },
      restoreState: async () => { await tick(); if (previous) emails.set(wallet, previous); else emails.delete(wallet) },
    })
    if (claim.ok) await releaseNotifyEmail(store, previous, wallet, email)
    return claim
  }
  const remove = async (wallet: string) => {
    const previous = emails.get(wallet)
    emails.delete(wallet)
    await releaseNotifyEmail(store, previous, wallet)
  }
  return { index, emails, store, save, remove }
}

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

test('concurrent saves of the same email leave exactly one holder', async () => {
  for (let round = 0; round < 50; round++) {
    const m = memoryEmailIndex()
    const results = await Promise.all([m.save(ALICE, 'race@example.com'), m.save(BOB, 'race@example.com')])
    const winners = results.filter(r => r.ok).length
    const holders = [ALICE, BOB].filter(w => m.emails.get(w) === 'race@example.com')
    assert.equal(winners, 1)
    assert.deepEqual(holders, [m.index.get(notifyEmailIndexKey('race@example.com'))?.wallet])
  }
})

test('a second wallet cannot save an email another wallet holds', async () => {
  const m = memoryEmailIndex()
  assert.deepEqual(await m.save(ALICE, 'shared@example.com'), { ok: true })
  assert.deepEqual(await m.save(BOB, 'shared@example.com'), { ok: false, holder: ALICE })
  assert.equal(m.emails.get(BOB), undefined)
  assert.equal(m.index.get(notifyEmailIndexKey('shared@example.com'))?.wallet, ALICE)
})

test('re-saving your own email succeeds', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'me@example.com')
  assert.deepEqual(await m.save(ALICE, 'me@example.com'), { ok: true })
  assert.deepEqual(await m.save(ALICE, ' ME@Example.com '), { ok: true })
  assert.equal(m.index.get(notifyEmailIndexKey('me@example.com'))?.wallet, ALICE)
})

test('uniqueness ignores case and surrounding whitespace', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'Mixed@Example.COM')
  assert.equal(notifyEmailIndexKey('  mixed@example.com '), notifyEmailIndexKey('MIXED@EXAMPLE.COM'))
  assert.deepEqual(await m.save(BOB, ' mixed@example.com'), { ok: false, holder: ALICE })
})

test('changing an email releases the old one for other wallets', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'old@example.com')
  await m.save(ALICE, 'new@example.com')
  assert.equal(m.index.has(notifyEmailIndexKey('old@example.com')), false)
  assert.deepEqual(await m.save(BOB, 'old@example.com'), { ok: true })
  assert.deepEqual(await m.save(BOB, 'new@example.com'), { ok: false, holder: ALICE })
})

test('removing an email releases it', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'gone@example.com')
  await m.remove(ALICE)
  assert.deepEqual(await m.save(BOB, 'gone@example.com'), { ok: true })
})

test('a stale index entry whose holder moved on is taken over', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'stale@example.com')
  m.emails.set(ALICE, 'elsewhere@example.com')
  assert.deepEqual(await m.save(BOB, 'stale@example.com'), { ok: true })
  assert.equal(m.index.get(notifyEmailIndexKey('stale@example.com'))?.wallet, BOB)
})

test('unverified claims expire, verified claims persist', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'pending@example.com')
  assert.equal(m.index.get(notifyEmailIndexKey('pending@example.com'))?.ttl, UNVERIFIED_CLAIM_TTL)
  await claimNotifyEmail(m.store, 'pending@example.com', ALICE, { verified: true })
  assert.equal(m.index.get(notifyEmailIndexKey('pending@example.com'))?.ttl, null)
})

test('claims compare wallets case-insensitively', async () => {
  const m = memoryEmailIndex()
  await m.save(ALICE, 'case@example.com')
  assert.deepEqual(await claimNotifyEmail(m.store, 'case@example.com', ALICE.toUpperCase().replace('0X', '0x'), { verified: true }), { ok: true })
})
