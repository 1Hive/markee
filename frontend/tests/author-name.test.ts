import assert from 'node:assert/strict'
import test from 'node:test'
import { authorName, impersonatesWallet } from '../lib/moderation/author-name'
import { withholdImpersonatingNames } from '../lib/sdk/snapshot'
import { moderateEmbed } from '../lib/moderation/embed'

const owner = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const other = '0x1111111111111111111111111111111111111111'

test('names that could pass as another wallet are withheld; ordinary names and the owner\'s own address are not', () => {
  for (const name of ['Gossman', 'Gardens team', 'v1.4 launch', 'email me at a@b.co', '0x', '0xabc']) assert.equal(authorName(name, owner), name, name)
  // The owner's own address, full or as signs shorten it, in any case.
  for (const name of [owner, owner.toUpperCase().replace('0X', '0x'), '0xd8dA…6045', '0xd8da...6045', `gm from ${owner}`]) assert.equal(impersonatesWallet(name, owner), false, name)
  // Any ENS name (even the owner's, which this check does not resolve), and anyone else's address.
  for (const name of ['vitalik.eth', 'VITALIK.ETH', 'jesse.base.eth', 'alice.eth fan', other, '0x1111…1111', '0xd8dA…6046', '0xd8dB…6045', `${owner} and ${other}`]) {
    assert.equal(impersonatesWallet(name, owner), true, name)
    assert.equal(authorName(name, owner), '')
  }
  // Zero-width and compatibility characters do not hide an ENS name.
  assert.equal(impersonatesWallet('vit​alik.eth', owner), true)
  assert.equal(impersonatesWallet('vitalik．eth', owner), true)
  // Without a known owner, any address is withheld.
  assert.equal(impersonatesWallet(owner, null), true)
  assert.equal(authorName(undefined, owner), '')
})

test('SDK snapshots withhold impersonating names and flag them, leaving other entries unchanged', () => {
  const entry = (name: string, entryOwner = owner) => ({ address: other, owner: entryOwner, message: 'Hello', name, score: '0', totalFunds: '0', aggregateRate: '0', legacyFloor: '0', moderated: false, views: 0 })
  const snapshot = { entries: [entry('Gossman'), entry('vitalik.eth'), entry('0xd8dA…6045'), entry('0xd8dA…6045', other)] } as any
  const result = withholdImpersonatingNames(snapshot)
  assert.deepEqual(result.entries.map((e: any) => [e.name, e.nameWithheld]), [['Gossman', undefined], ['', true], ['0xd8dA…6045', undefined], ['', true]])
  assert.equal(result.entries[1].message, 'Hello')
  const clean = { entries: [entry('Gossman')] } as any
  assert.equal(withholdImpersonatingNames(clean), clean)
})

test('website embeds withhold impersonating names after moderation, keeping the message', async () => {
  const previous = process.env.FLAG_AUTO_MODERATION
  process.env.FLAG_AUTO_MODERATION = 'false'
  try {
    const payload = { topMarkeeAddress: null, message: '', name: '', flagged: false }
    assert.equal(await moderateEmbed(payload), payload)
    const { embedModerationDeps } = await import('../lib/moderation/embed')
    const restore = embedModerationDeps.flags
    embedModerationDeps.flags = async () => ({ board: [], site: [] })
    try {
      const base = { topMarkeeAddress: other, topMarkeeOwner: owner, message: 'Hello', flagged: false }
      assert.deepEqual(await moderateEmbed({ ...base, name: 'vitalik.eth' }), { ...base, name: '', nameWithheld: true })
      assert.deepEqual(await moderateEmbed({ ...base, name: '0xd8dA…6045' }), { ...base, name: '0xd8dA…6045' })
      assert.deepEqual(await moderateEmbed({ ...base, topMarkeeOwner: undefined, name: '0xd8dA…6045' }), { ...base, topMarkeeOwner: undefined, name: '', nameWithheld: true })
    } finally { embedModerationDeps.flags = restore }
  } finally { previous === undefined ? delete process.env.FLAG_AUTO_MODERATION : process.env.FLAG_AUTO_MODERATION = previous }
})
