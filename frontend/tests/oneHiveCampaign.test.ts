import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activationTime,
  isEligibleBoard,
  isExcludedBoard,
  siteLabel,
  utcDay,
  viewAddresses,
  viewsSince,
  type CampaignListingRow,
} from '../lib/campaigns/oneHive'

const START = 1_794_949_200 // 2026-11-17T21:00:00Z
const BOARD = '0xAAAA000000000000000000000000000000000001'
const OLD = '0xbbbb000000000000000000000000000000000002'
const forRent: CampaignListingRow = { address: BOARD, strategy: 'streaming' }
const forSale: CampaignListingRow = { address: BOARD, strategy: 'fixed', verificationGated: true }

test('activation is the first #1 span across original and current histories', () => {
  assert.equal(activationTime([undefined, []]), null)
  assert.equal(activationTime([[{ markee: '0x1', from: 500, to: 600 }], [{ markee: '0x2', from: 900, to: null }]]), 500)
})

test('new For Rent and For Sale boards activated at or after the start are eligible', () => {
  assert.equal(isEligibleBoard(forRent, START, START, {}), true)
  assert.equal(isEligibleBoard(forSale, START + 60, START, {}), true)
})

test('boards activated before the start, or not yet activated, are not eligible', () => {
  assert.equal(isEligibleBoard(forRent, START - 1, START, {}), false)
  assert.equal(isEligibleBoard(forRent, null, START, {}), false)
})

test('legacy factory boards are not eligible even if activated after the start', () => {
  assert.equal(isEligibleBoard({ address: BOARD, strategy: 'fixed' }, START + 60, START, {}), false)
})

test('exclusions match the current or original address, case-insensitively', () => {
  const migrated: CampaignListingRow = { address: BOARD, migratedFrom: OLD, strategy: 'streaming' }
  assert.equal(isExcludedBoard(forRent, { [BOARD.toLowerCase()]: 'rejected' }), true)
  assert.equal(isExcludedBoard(migrated, { [OLD.toUpperCase().replace('0X', '0x')]: 'view farming' }), true)
  assert.equal(isEligibleBoard(migrated, START + 60, START, { [OLD]: 'view farming' }), false)
  assert.equal(isExcludedBoard(forRent, {}), false)
})

test('views count the board and every message that has been #1, from the activation day on', () => {
  const row: CampaignListingRow = { address: BOARD, migratedFrom: OLD, strategy: 'streaming', topMarkeeAddress: '0xC' }
  const addrs = viewAddresses(row, [[{ markee: '0xA', from: 1, to: 2 }], [{ markee: '0xB', from: 2, to: null }]])
  assert.deepEqual(new Set(addrs), new Set([BOARD.toLowerCase(), OLD, '0xc', '0xa', '0xb']))

  const from = utcDay(START)
  assert.equal(from, '2026-11-17')
  assert.equal(viewsSince([{ '2026-11-16': 50, '2026-11-17': 3, '2026-11-18': '4' }, null, { '2026-12-01': 10 }], from), 17)
})

test('site label prefers the verified site, then the verified repo, then the name', () => {
  assert.equal(siteLabel({ address: BOARD, verifiedUrls: ['https://www.example.org/wiki/'] }), 'example.org/wiki')
  assert.equal(siteLabel({ address: BOARD, linkedFiles: [{ verified: false, repoFullName: 'x/y' }, { verified: true, repoFullName: 'acme/repo' }] }), 'github.com/acme/repo')
  assert.equal(siteLabel({ address: BOARD, leaderboardName: 'My Project' }), 'My Project')
})
