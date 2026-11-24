import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOR_RENT_BOARDS_BEFORE_V14,
  FOR_SALE_V13_BOARDS_BEFORE_V14,
  hasVerifiedEmbed,
  isActivated,
  isCampaignBoard,
  isEligibleBoard,
  isExcludedBoard,
  siteLabel,
  viewAddresses,
  type CampaignListingRow,
  type CampaignTopSpan,
} from '../lib/campaigns/1hive'

const BOARD = '0xAAAA000000000000000000000000000000000001'
const OLD = '0xbbbb000000000000000000000000000000000002'
const SEED = '0x5eed000000000000000000000000000000000003'
const PAID = '0x9a1d000000000000000000000000000000000004'
const EMBED = { verifiedUrls: ['https://example.org'] }
const forRent: CampaignListingRow = { address: BOARD, strategy: 'streaming', ...EMBED }
const forSale: CampaignListingRow = { address: BOARD, strategy: 'fixed', verificationGated: true, ...EMBED }
// For Rent boards created since the v1.4 launch (lowercase), as the route reads them from the factory.
const NEW_FOR_RENT = new Set([BOARD.toLowerCase()])
const NONE = new Set<string>()
const rentSpans: CampaignTopSpan[] = [{ markee: '0x1', from: 500, to: 600 }, { markee: '0x2', from: 900, to: null }]
const saleSpans: CampaignTopSpan[] = [{ markee: SEED, from: 100, to: 200 }, { markee: PAID, from: 200, to: null }]

test('80 For Rent and 18 v1.3 For Sale boards existed at the v1.4 launch', () => {
  assert.equal(FOR_RENT_BOARDS_BEFORE_V14, 80)
  assert.equal(FOR_SALE_V13_BOARDS_BEFORE_V14, 18)
})

test('a live funded #1 counts as activated before the history scan records it', () => {
  assert.equal(isActivated({ ...forRent, topMessage: 'gm', topFundsAddedRaw: '380517503' }, undefined), true)
  assert.equal(isActivated({ ...forSale, topMessage: 'gm', topFundsAddedRaw: '1000' }, []), true)
  // No message, or nothing funding it, is not enough on its own.
  assert.equal(isActivated({ ...forRent, topMessage: '', topFundsAddedRaw: '380517503' }, undefined), false)
  assert.equal(isActivated({ ...forRent, topMessage: 'gm', topFundsAddedRaw: '0' }, undefined), false)
})

test('For Rent is activated by its first #1 span', () => {
  assert.equal(isActivated(forRent, undefined), false)
  assert.equal(isActivated(forRent, []), false)
  assert.equal(isActivated(forRent, rentSpans), true)
})

test("For Sale activation ignores initialize()'s empty placeholder message", () => {
  assert.equal(isActivated(forSale, saleSpans), true)
  assert.equal(isActivated(forSale, [{ markee: SEED, from: 100, to: null }]), false)
})

test('a For Sale placeholder given a message and funds counts as activated', () => {
  const funded = { ...forSale, topMarkeeAddress: SEED, topMessage: 'gm', topFundsAddedRaw: '1000' }
  assert.equal(isActivated(funded, [{ markee: SEED, from: 100, to: null }]), true)
  assert.equal(isActivated({ ...funded, topFundsAddedRaw: '0' }, [{ markee: SEED, from: 100, to: null }]), false)
})

test('every v1.4 For Sale board and For Rent boards created since the launch are campaign boards', () => {
  assert.equal(isCampaignBoard(forSale, NONE), true)
  assert.equal(isCampaignBoard(forRent, NEW_FOR_RENT), true)
  // A For Rent board created before the launch never counts, however recently it was activated.
  assert.equal(isCampaignBoard(forRent, NONE), false)
})

test('legacy factory boards and copies of pre-launch boards are never campaign boards', () => {
  assert.equal(isCampaignBoard({ address: BOARD, strategy: 'fixed' }, NEW_FOR_RENT), false)
  assert.equal(isCampaignBoard({ ...forSale, migratedFrom: OLD }, NEW_FOR_RENT), false)
  // A For Rent copy sits past index 80 in the factory, but its original is what counts.
  assert.equal(isCampaignBoard({ ...forRent, migratedFrom: OLD }, NEW_FOR_RENT), false)
})

test('a migrated copy of a board created after the launch is a campaign board', () => {
  const newOriginal = new Set([OLD.toLowerCase()])
  assert.equal(isCampaignBoard({ ...forSale, migratedFrom: OLD }, newOriginal), true)
  assert.equal(isCampaignBoard({ ...forRent, migratedFrom: OLD.toUpperCase().replace('0X', '0x') }, newOriginal), true)
  // Even a copy on a non-For-Sale v1.4 factory, as long as its original is new.
  assert.equal(isCampaignBoard({ address: BOARD, strategy: 'fixed', migratedFrom: OLD }, newOriginal), true)
  assert.equal(isEligibleBoard({ ...forSale, migratedFrom: OLD }, saleSpans, newOriginal, {}), true)
})

test('an exclusion or disqualification made under the original address still applies', () => {
  const newOriginal = new Set([OLD.toLowerCase()])
  assert.equal(isEligibleBoard({ ...forSale, migratedFrom: OLD }, saleSpans, newOriginal, { [OLD]: 'rejected' }), false)
})

test('an activated new board with a verified embed is eligible, with no start date', () => {
  assert.equal(isEligibleBoard(forRent, rentSpans, NEW_FOR_RENT, {}), true)
  assert.equal(isEligibleBoard(forSale, saleSpans, NEW_FOR_RENT, {}), true)
  // Activation time doesn't matter, only that it happened.
  assert.equal(isEligibleBoard(forSale, [{ markee: SEED, from: 1, to: 2 }, { markee: PAID, from: 2, to: null }], NONE, {}), true)
  assert.equal(isEligibleBoard(forSale, [{ markee: SEED, from: 100, to: null }], NONE, {}), false)
})

test('a sign with no verified site or GitHub embed is never eligible', () => {
  const bare = { address: BOARD, strategy: 'streaming' } as CampaignListingRow
  assert.equal(isEligibleBoard(bare, rentSpans, NEW_FOR_RENT, {}), false)
  assert.equal(isEligibleBoard({ ...bare, linkedFiles: [{ verified: false, repoFullName: 'x/y' }] }, rentSpans, NEW_FOR_RENT, {}), false)
  assert.equal(hasVerifiedEmbed({ ...bare, linkedFiles: [{ verified: true, repoFullName: 'x/y' }] }), true)
  assert.equal(isEligibleBoard({ ...bare, verifiedUrls: [], linkedFiles: [{ verified: true }] }, rentSpans, NEW_FOR_RENT, {}), true)
})

test('a disqualified board is never eligible', () => {
  assert.equal(isEligibleBoard({ ...forRent, disqualified: true }, rentSpans, NEW_FOR_RENT, {}), false)
})

test('exclusions match the board address case-insensitively', () => {
  assert.equal(isExcludedBoard(forRent, { [BOARD.toLowerCase()]: 'rejected' }), true)
  assert.equal(isEligibleBoard(forRent, rentSpans, NEW_FOR_RENT, { [BOARD.toUpperCase().replace('0X', '0x')]: 'view farming' }), false)
  assert.equal(isExcludedBoard(forRent, {}), false)
})

test('views count the board and every message that has been #1, placeholder included', () => {
  const row: CampaignListingRow = { ...forSale, topMarkeeAddress: '0xC' }
  const addrs = viewAddresses(row, [{ markee: SEED, from: 1, to: 2 }, { markee: '0xB', from: 2, to: null }])
  assert.deepEqual(new Set(addrs), new Set([BOARD.toLowerCase(), '0xc', SEED.toLowerCase(), '0xb']))
})

test('site label prefers the verified site, then the verified repo, then the name', () => {
  assert.equal(siteLabel({ address: BOARD, verifiedUrls: ['https://www.example.org/wiki/'] }), 'example.org/wiki')
  assert.equal(siteLabel({ address: BOARD, verifiedUrls: ['example.org/blog'] }), 'example.org/blog')
  assert.equal(siteLabel({ address: BOARD, linkedFiles: [{ verified: false, repoFullName: 'x/y' }, { verified: true, repoFullName: 'acme/repo' }] }), 'github.com/acme/repo')
  assert.equal(siteLabel({ address: BOARD, leaderboardName: 'My Project' }), 'My Project')
})
