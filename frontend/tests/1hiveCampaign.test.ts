import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CAMPAIGN_1HIVE_CAMPAIGN_START,
  activationTime,
  isCampaignBoard,
  isEligibleBoard,
  hasVerifiedEmbed,
  isExcludedBoard,
  siteLabel,
  utcDay,
  viewAddresses,
  viewsSince,
  type CampaignListingRow,
} from '../lib/campaigns/1hive'

const START = CAMPAIGN_1HIVE_CAMPAIGN_START // v1.4 launch, 2026-11-13T16:59:17Z
const BOARD = '0xAAAA000000000000000000000000000000000001'
const OLD = '0xbbbb000000000000000000000000000000000002'
const SEED = '0x5eed000000000000000000000000000000000003'
const PAID = '0x9a1d000000000000000000000000000000000004'
const EMBED = { verifiedUrls: ['https://example.org'] }
const forRent: CampaignListingRow = { address: BOARD, strategy: 'streaming', ...EMBED }
const forSale: CampaignListingRow = { address: BOARD, strategy: 'fixed', verificationGated: true, ...EMBED }

test('campaign start is the v1.4 launch', () => {
  assert.equal(new Date(START * 1000).toISOString(), '2026-11-13T16:59:17.000Z')
})

test('For Rent activation is its first #1 span', () => {
  assert.equal(activationTime(forRent, undefined), null)
  assert.equal(activationTime(forRent, [{ markee: '0x1', from: 500, to: 600 }, { markee: '0x2', from: 900, to: null }]), 500)
})

test("For Sale activation skips initialize()'s empty placeholder message", () => {
  // Created on day 100 (placeholder becomes #1), first paid message takes #1 on day 200.
  const spans = [{ markee: SEED, from: 100, to: 200 }, { markee: PAID, from: 200, to: null }]
  assert.equal(activationTime(forSale, spans), 200)
})

test('a For Sale board with only its placeholder is not activated', () => {
  assert.equal(activationTime({ ...forSale, topMarkeeAddress: SEED, topMessage: null, topFundsAddedRaw: '0' }, [{ markee: SEED, from: 100, to: null }]), null)
  assert.equal(isEligibleBoard(forSale, null, START, {}), false)
})

test('a For Sale placeholder given a message and funds counts as activated', () => {
  const funded = { ...forSale, topMarkeeAddress: SEED, topMessage: 'hello', topFundsAddedRaw: '1000' }
  assert.equal(activationTime(funded, [{ markee: SEED, from: 100, to: null }]), 100)
})

test('new For Rent and For Sale boards activated at or after the v1.4 launch are eligible', () => {
  assert.equal(isEligibleBoard(forRent, START, START, {}), true)
  assert.equal(isEligibleBoard(forSale, START + 60, START, {}), true)
})

test('boards activated before the launch are not eligible', () => {
  assert.equal(isEligibleBoard(forRent, START - 1, START, {}), false)
})

test('legacy factory boards and migrated boards are never eligible', () => {
  assert.equal(isCampaignBoard({ address: BOARD, strategy: 'fixed' }), false)
  assert.equal(isEligibleBoard({ ...forSale, migratedFrom: OLD }, START + 60, START, {}), false)
  assert.equal(isEligibleBoard({ ...forRent, migratedFrom: OLD }, START + 60, START, {}), false)
})

test('a sign with no verified site or GitHub embed is never eligible', () => {
  const bare = { address: BOARD, strategy: 'streaming' } as CampaignListingRow
  assert.equal(isEligibleBoard(bare, START + 60, START, {}), false)
  assert.equal(isEligibleBoard({ ...bare, linkedFiles: [{ verified: false, repoFullName: 'x/y' }] }, START + 60, START, {}), false)
  assert.equal(hasVerifiedEmbed({ ...bare, linkedFiles: [{ verified: true, repoFullName: 'x/y' }] }), true)
  assert.equal(isEligibleBoard({ ...bare, verifiedUrls: [], linkedFiles: [{ verified: true }] }, START + 60, START, {}), true)
})

test('exclusions match the board address case-insensitively', () => {
  assert.equal(isExcludedBoard(forRent, { [BOARD.toLowerCase()]: 'rejected' }), true)
  assert.equal(isEligibleBoard(forRent, START + 60, START, { [BOARD.toUpperCase().replace('0X', '0x')]: 'view farming' }), false)
  assert.equal(isExcludedBoard(forRent, {}), false)
})

test('views count the board and every message that has been #1, from the activation day on', () => {
  const row: CampaignListingRow = { ...forRent, topMarkeeAddress: '0xC' }
  const addrs = viewAddresses(row, [{ markee: '0xA', from: 1, to: 2 }, { markee: '0xB', from: 2, to: null }])
  assert.deepEqual(new Set(addrs), new Set([BOARD.toLowerCase(), '0xc', '0xa', '0xb']))

  assert.equal(utcDay(START), '2026-11-13')
  assert.equal(viewsSince([{ '2026-11-12': 50, '2026-11-13': 3, '2026-11-14': '4' }, null, { '2026-12-01': 10 }], utcDay(START)), 17)
})

test('site label prefers the verified site, then the verified repo, then the name', () => {
  assert.equal(siteLabel({ address: BOARD, verifiedUrls: ['https://www.example.org/wiki/'] }), 'example.org/wiki')
  assert.equal(siteLabel({ address: BOARD, verifiedUrls: ['example.org/blog'] }), 'example.org/blog')
  assert.equal(siteLabel({ address: BOARD, linkedFiles: [{ verified: false, repoFullName: 'x/y' }, { verified: true, repoFullName: 'acme/repo' }] }), 'github.com/acme/repo')
  assert.equal(siteLabel({ address: BOARD, leaderboardName: 'My Project' }), 'My Project')
})
