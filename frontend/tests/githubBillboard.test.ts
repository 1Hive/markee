import assert from 'node:assert/strict'
import test from 'node:test'
import { billboardFor, billboardSignature, fixedFooter, formatEthCeil, streamingFooter } from '../lib/github/markeeSync'
import { currentBoardsForLegacy, encodedRepoPath, legacyAddressesFor } from '../lib/github/linkedFiles'

const eth = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n

test('prices round up to a clean figure instead of printing float noise', () => {
  assert.equal(formatEthCeil(2_500_000_000_000_003n), '0.0026')
  assert.equal(formatEthCeil(eth(0.0025)), '0.0025')
})

test('a fixed board asks for at least its minimum price', () => {
  assert.equal(fixedFooter(eth(0.002), 0n, true), '0.003 ETH to change')
  assert.equal(fixedFooter(eth(0.002), eth(0.01), true), '0.01 ETH to change')
  assert.equal(fixedFooter(0n, eth(0.05), false), 'Add your message for 0.05 ETH')
  assert.equal(fixedFooter(0n, 0n, false), 'Add your message for 0.001 ETH')
})

test('a streaming board advertises a monthly rate, not a one-off price', () => {
  assert.match(streamingFooter(380_517_503n, 0n, true), /^Stream over [\d.]+ ETH\/mo to change$/)
  assert.equal(streamingFooter(0n, eth(0.002), false), 'Stream from 0.002 ETH/mo to add yours')
})

test('encodedRepoPath rejects names that would reshape the API path', () => {
  assert.equal(encodedRepoPath('owner/repo'), 'owner/repo')
  assert.equal(encodedRepoPath('own er/re?po'), 'own%20er/re%3Fpo')
  assert.equal(encodedRepoPath('owner/repo/../../user'), null)
  assert.equal(encodedRepoPath('owner'), null)
  assert.equal(encodedRepoPath('/repo'), null)
})

test('a legacy alias maps to its current board and is never treated as one', () => {
  // nativ3ai/hermes: 0xf26a… is the board's beneficiary wallet, listed as a legacy delimiter alias.
  const hermes = '0x1e95812f4ce5178339d55d17727e7355a4ced67b'
  const beneficiary = '0xF26A8E70Ac16626400556bD21C1dE5Ef46E415a6'
  assert.ok(legacyAddressesFor(hermes).includes(beneficiary.toLowerCase()), 'delimiters under the alias still match')
  assert.deepEqual(currentBoardsForLegacy(beneficiary), [hermes])
  assert.deepEqual(currentBoardsForLegacy(hermes), [], 'a current board is not an alias')
})

test('a moderated top message never reaches the README, and hiding it changes the sync signature', () => {
  const board = '0x' + 'a'.repeat(40)
  const shown = { message: 'buy my token', footer: '0.002 ETH to change' }
  const hidden = { message: '', footer: '0.002 ETH to change', hidden: true }
  const text = billboardFor(board, hidden, 'https://example.test')
  assert.ok(!text.includes('buy my token'))
  assert.ok(text.includes('hidden by moderation'))
  assert.ok(text.includes('0.002 ETH to change'))
  assert.notEqual(billboardSignature(shown), billboardSignature(hidden))
  assert.notEqual(billboardSignature({ message: '', footer: shown.footer }), billboardSignature(hidden))
})
