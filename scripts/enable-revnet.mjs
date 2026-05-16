#!/usr/bin/env node
// scripts/enable-revnet.mjs
//
// Generates a Safe Transaction Builder batch JSON to activate RevNet v6
// across all Coop-admin v1.1 Leaderboard contracts.
//
// Steps per leaderboard (Safe executes in order):
//   1. setRevNetTerminal(TERMINAL)
//   2. setRevNetProjectId(PROJECT_ID)
//   3. setPercentToBeneficiary(6200)  — 62% beneficiary, 38% RevNet
//   4. setRevNetEnabled(true)         — always last
//
// Usage:
//   node scripts/enable-revnet.mjs
//   OUTPUT=/path/to/out.json node scripts/enable-revnet.mjs
//
// Output: /tmp/enable-revnet-batch.json  (or $OUTPUT)
//
// Import steps:
//   1. app.safe.global → select Coop multisig (0xAf44...)
//   2. New Transaction → Transaction Builder
//   3. Drag & drop the JSON file (or paste contents)
//   4. Review all transactions, then Submit

import { writeFileSync } from 'fs'

// ─── RevNet v6 config ──────────────────────────────────────────────────────────

const TERMINAL = '0x2dB6d704058E552DeFE415753465df8dF0361846'
const PROJECT_ID = '152'
const PERCENT_TO_BENEFICIARY = '6200' // 62% — 38% goes to RevNet
const COOP_MULTISIG = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB'
const OUTPUT = process.env.OUTPUT ?? '/tmp/enable-revnet-batch.json'

// ─── Leaderboards ─────────────────────────────────────────────────────────────
//
// Batch 1: Coop multisig (0xAf44...) — Coop/Gardens/Clawchemy/SF Migration
// Batch 2: Paul's wallet (0x809c...) — all 13 GitHub leaderboards
//
// NOT included:
//  - OI new factory leaderboards (Honeyswap, NORD, Gitcoin, Mati's, OwnerSyncSafe, Hello!)
//    use the v1.0 Leaderboard implementation which has no setRevNetTerminal/setRevNetEnabled
//    and already runs on RevNet v5 (terminal 0x2dB6d..., projectId 119). Migration to v1.1
//    required before they can join RevNet v6.
//  - v1.0 Superfluid leaderboards (94 leaderboards, TopDawgStrategy) — same limitation.

const COOP_LEADERBOARDS = [
  { name: 'Markee Cooperative',  address: '0xC981e99bfB1349904C56bdafC429cE04E5AD9Ce4' },
  { name: 'Gardens',             address: '0x660a5805384a68dE57709bd89124B73B8C03371C' },
  { name: 'Clawchemy',           address: '0x824f948Bb0afd7a9bc360DF134fA353fD3cE7CE5' },
  { name: 'Superfluid Migration', address: '0xb6CCc63d3FdC2D22e3147c01AB6A006f32Dd7580' },
]

const PAUL_WALLET = '0x809C9f8dd8CA93A41c3adca4972Fa234C28F7714'

// All leaderboards where Paul's wallet (0x809c9f8...) is admin
const PAUL_LEADERBOARDS = [
  // OI v1.1 leaderboards
  { name: 'OI / Honeyswap',                                address: '0x9Eb8939fbc11A546617bc4C55e9AFa4D4d847d80' },
  { name: 'OI / Gitcoin',                                  address: '0x56f0e84de401198d485bbe30fe13651b0f03b165' },
  { name: 'OI / Matias',                                   address: '0xf47cbd51123d4e74128d144c65be092c16134bea' },
  // GitHub v1.1 leaderboards
  { name: 'pglavin2/honeyswap-interface — README.md',      address: '0xb974D9DF9b6302Ff99b9cc18B1a14fF363aaeE21' },
  { name: '1Hive/markee — SKILL.md',                      address: '0x670986ce867674B280B19B0e406C840113224Fb6' },
  { name: '1Hive/gardens-v2 — README.md',                 address: '0x2335bfa938b60C73F0a1d62C6ecc747e8C516d2c' },
  { name: 'web3devz/VeriNet — README.md',                 address: '0xd5E62EAc5e144A0CB09774aE9285D50E88667dae' },
  { name: 'bitpixi2/deviantclaw',                          address: '0x6061c7E557CCCE69Ba804AebA43A9cd7aa157078' },
  { name: 'JimmyNagles/agent-verification-network (#1)',   address: '0x254A9CED62b214Ee1998C7C7934eE25a57E3Fbf9' },
  { name: 'web3devz/agentcred',                            address: '0x61bac5DdCA2519C94B1aC9eb3e9E563B4375729B' },
  { name: 'Timidan/synth-x',                              address: '0x253E91dCc7bD56E3695348C3BB0BC9fEBF6f01b5' },
  { name: 'nativ3ai/hermes-geopolitical-market-sim',       address: '0x57F50086e359D24Cc65bcc5614E30123Ef39EC76' },
  { name: 'JimmyNagles/agent-verification-network (#2)',   address: '0x7858dA9eAe7C811c71c2EEAa9948C5ef570C43A2' },
  { name: 'web3devz/Soulbyte',                            address: '0x3718f5B053e8427dF99c486cB5A6E60066345223' },
  { name: 'web3sim/PolicyPay',                            address: '0x284e7C8d31f0235230e549D475591ad91B0c12B9' },
  { name: 'web3sim/HelixChain',                           address: '0x6459b0b0a3F8C19cb28464B248DfF6A8Cc8cA210' },
]

// ─── ABI fragments (used by Safe Transaction Builder for encoding) ─────────────

const SET_REV_NET_TERMINAL = {
  inputs: [{ internalType: 'address', name: '_newTerminal', type: 'address' }],
  name: 'setRevNetTerminal',
  payable: false,
}

const SET_REV_NET_PROJECT_ID = {
  inputs: [{ internalType: 'uint256', name: '_newProjectId', type: 'uint256' }],
  name: 'setRevNetProjectId',
  payable: false,
}

const SET_PERCENT_TO_BENEFICIARY = {
  inputs: [{ internalType: 'uint256', name: '_newPercent', type: 'uint256' }],
  name: 'setPercentToBeneficiary',
  payable: false,
}

const SET_REV_NET_ENABLED = {
  inputs: [{ internalType: 'bool', name: '_enabled', type: 'bool' }],
  name: 'setRevNetEnabled',
  payable: false,
}

// ─── Build batch helper ───────────────────────────────────────────────────────

function buildBatch(leaderboards, signerAddress, batchName) {
  const transactions = []
  for (const lb of leaderboards) {
    transactions.push({
      to: lb.address, value: '0', data: null,
      contractMethod: SET_REV_NET_TERMINAL,
      contractInputsValues: { _newTerminal: TERMINAL },
    })
    transactions.push({
      to: lb.address, value: '0', data: null,
      contractMethod: SET_REV_NET_PROJECT_ID,
      contractInputsValues: { _newProjectId: PROJECT_ID },
    })
    transactions.push({
      to: lb.address, value: '0', data: null,
      contractMethod: SET_PERCENT_TO_BENEFICIARY,
      contractInputsValues: { _newPercent: PERCENT_TO_BENEFICIARY },
    })
    // setRevNetEnabled always last — enabling with stale values misroutes payments
    transactions.push({
      to: lb.address, value: '0', data: null,
      contractMethod: SET_REV_NET_ENABLED,
      contractInputsValues: { _enabled: 'true' },
    })
  }
  return {
    version: '1.0',
    chainId: '8453',
    createdAt: Date.now(),
    meta: {
      name: batchName,
      description: [
        `Activates RevNet v6 fee routing on ${leaderboards.length} v1.1 Leaderboards.`,
        `Terminal: ${TERMINAL}  |  Project ID: ${PROJECT_ID}  |  percentToBeneficiary: ${PERCENT_TO_BENEFICIARY} (62%).`,
        `Order per leaderboard: setRevNetTerminal → setRevNetProjectId → setPercentToBeneficiary → setRevNetEnabled(true).`,
      ].join(' '),
      txBuilderVersion: '1.16.5',
      createdFromSafeAddress: signerAddress,
      createdFromOwnerAddress: '',
      checksum: '',
    },
    transactions,
  }
}

// ─── Generate both batches ────────────────────────────────────────────────────

const COOP_OUTPUT = process.env.COOP_OUTPUT ?? '/tmp/enable-revnet-coop.json'
const PAUL_OUTPUT = process.env.PAUL_OUTPUT ?? '/tmp/enable-revnet-paul.json'

const coopBatch = buildBatch(COOP_LEADERBOARDS, COOP_MULTISIG, `Enable RevNet v6 — Coop multisig (${COOP_LEADERBOARDS.length} leaderboards)`)
const paulBatch = buildBatch(PAUL_LEADERBOARDS, PAUL_WALLET, `Enable RevNet v6 — Paul's wallet (${PAUL_LEADERBOARDS.length} leaderboards)`)

writeFileSync(COOP_OUTPUT, JSON.stringify(coopBatch, null, 2))
writeFileSync(PAUL_OUTPUT, JSON.stringify(paulBatch, null, 2))

console.log(`✓ Coop batch:  ${coopBatch.transactions.length} txs for ${COOP_LEADERBOARDS.length} leaderboards → ${COOP_OUTPUT}`)
console.log(`✓ Paul batch:  ${paulBatch.transactions.length} txs for ${PAUL_LEADERBOARDS.length} leaderboards → ${PAUL_OUTPUT}`)
console.log()
console.log('Coop multisig — import COOP file at app.safe.global → Transaction Builder:')
for (const lb of COOP_LEADERBOARDS) console.log(`  ${lb.name.padEnd(26)} ${lb.address}`)
console.log()
console.log('Your wallet 0x809c9f8... — import PAUL file:')
for (const lb of PAUL_LEADERBOARDS) console.log(`  ${lb.name.slice(0, 50).padEnd(52)} ${lb.address}`)
