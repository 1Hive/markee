import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRules } from '../lib/moderation/rules'

const wallet = '0x123456789012345678901234567890123456abcd'
const cases: [string, string][] = [
  ['Check your token approvals at app-un1swap.org', 'DOMAIN_LOOKALIKE'],
  ['Claim your airdrop, connect wallet at bit.ly/xyz', 'CLAIM_SOLICITATION'],
  [`Send 0.1 ETH to ${wallet} and get 2x back`, 'PROMISED_RETURN'],
  ['Send 0.1 ETH to 0x1234...abcd and get 2x back', 'PAYMENT_SOLICITATION'],
  ['Support desk: DM your seed phrase to recover funds', 'SECRET_REQUEST'],
  ['Send ETH to giveaway-claim.eth and get 2x back', 'PAYMENT_SOLICITATION'],
  ['Paste your private key to verify ownership', 'SECRET_REQUEST'],
  ['Share your recovery phrase with support', 'SECRET_REQUEST'],
  ['Send ETH to 🐸.eth', 'PAYMENT_SOLICITATION'],
  ['Pay alice.eth for access', 'PAYMENT_SOLICITATION'],
  ['Send 1 ETH and receive double back', 'PROMISED_RETURN'],
  ['Claim your tokens at rewards.example.com', 'CLAIM_SOLICITATION'],
  ['Redeem your bonus then connect your wallet', 'CLAIM_SOLICITATION'],
  ['Visit https://BIT.LY/xyz', 'SHORTENED_LINK'],
  ['Visit https://bit%2ely/xyz', 'SHORTENED_LINK'],
  ['Read tinyurl.com/xyz', 'SHORTENED_LINK'],
  ['Read https://bit.ly./xyz', 'SHORTENED_LINK'],
  ['Visit https://uniswap.org.attacker.com', 'DOMAIN_LOOKALIKE'],
  ['Visit https://uniswap.org@attacker.example', 'DOMAIN_LOOKALIKE'],
  ['Visit https://metamаsk.io', 'DOMAIN_LOOKALIKE'], // Cyrillic а
  ['Visit app-metаmask.io', 'DOMAIN_LOOKALIKE'],
  ['Claim your air\u200bdrop and con\u200bnect wallet', 'CLAIM_SOLICITATION'],
  ['Ｓｅｎｄ ＥＴＨ ｔｏ giveaway-claim.eth', 'PAYMENT_SOLICITATION'],
]
for (const [message, code] of cases) test(`rules detect ${code}: ${message}`, () => {
  const result = checkRules(message)
  assert.ok(result.some(r => r.code === code), JSON.stringify(result))
  assert.ok(result.every(r => r.reason.length > 10))
})

for (const message of [
  'gm from alice.eth', 'gm from 🐸.eth', 'Support open source builders on Base',
  'Funding round for public goods is live this week', 'Claim your refund through the deposit manager',
  'Connect your wallet to support public goods', 'Never share your seed phrase',
  "Do not send your private key to anyone", "Don't paste your recovery phrase",
  'We will never ask you to enter your seed phrase',
  'Read https://app.uniswap.org or docs.metamask.io', 'Read https://www.markee.xyz',
  'Read https://example.org', 'Read notbit.ly or bit.ly.example.org',
  `My wallet is ${wallet}`, `Transaction: 0x${'a'.repeat(64)}`,
  '2x funding for public goods', 'Seed phrase safety guide',
  'Airdrop information at https://example.org',
]) test(`rules preserve benign content: ${message}`, () => assert.deepEqual(checkRules(message), []))

test('negation in one sentence cannot excuse an instruction in another; repeated checks are deterministic', () => {
  const message = 'Never share your seed phrase. Now paste your private key.'
  const first = checkRules(message)
  assert.ok(first.some(r => r.code === 'SECRET_REQUEST'))
  assert.deepEqual(checkRules(message), first)
})
