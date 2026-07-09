#!/usr/bin/env node
// scripts/update-v13-factories-revnet.mjs
//
// Generates a Safe Transaction Builder batch JSON to update all three v1.3
// LeaderboardFactory contracts to the new JB terminal and project ID.
//
// Each factory gets 2 transactions (order matters — set terminal before projectId):
//   1. setRevNetTerminal(NEW_TERMINAL)
//   2. setRevNetProjectId(NEW_PROJECT_ID)
//
// Usage:
//   node scripts/update-v13-factories-revnet.mjs
//   OUTPUT=/path/to/out.json node scripts/update-v13-factories-revnet.mjs
//
// Output: /tmp/update-v13-factories-revnet.json  (or $OUTPUT)
//
// Import steps:
//   1. app.safe.global → select Coop multisig (0xAf44...)
//   2. New Transaction → Transaction Builder
//   3. Drag & drop the JSON file (or paste contents)
//   4. Review all 6 transactions, then Submit

import { writeFileSync } from 'fs'

// ─── Config ───────────────────────────────────────────────────────────────────

const NEW_TERMINAL   = '0x130f5Dd2bD8805443Cf41755253D778a75a67f53'
const NEW_PROJECT_ID = '7'
const COOP_MULTISIG  = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB'
const OUTPUT         = process.env.OUTPUT ?? '/tmp/update-v13-factories-revnet.json'

// ─── Factories ────────────────────────────────────────────────────────────────

const FACTORIES = [
  { name: 'Open Internet', address: '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c' },
  { name: 'GitHub',        address: '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2' },
  { name: 'Superfluid',    address: '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' },
]

// ─── ABI fragments ────────────────────────────────────────────────────────────

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

// ─── Build batch ──────────────────────────────────────────────────────────────

const transactions = []

for (const factory of FACTORIES) {
  transactions.push({
    to: factory.address, value: '0', data: null,
    contractMethod: SET_REV_NET_TERMINAL,
    contractInputsValues: { _newTerminal: NEW_TERMINAL },
  })
  transactions.push({
    to: factory.address, value: '0', data: null,
    contractMethod: SET_REV_NET_PROJECT_ID,
    contractInputsValues: { _newProjectId: NEW_PROJECT_ID },
  })
}

const batch = {
  version: '1.0',
  chainId: '8453',
  createdAt: Date.now(),
  meta: {
    name: `Update v1.3 factories — terminal + projectId (${FACTORIES.length} factories, ${transactions.length} txs)`,
    description: [
      `Updates all three v1.3 LeaderboardFactory contracts to the new JB terminal and project ID.`,
      `Terminal: ${NEW_TERMINAL}  |  Project ID: ${NEW_PROJECT_ID}.`,
      `Order per factory: setRevNetTerminal → setRevNetProjectId.`,
    ].join(' '),
    txBuilderVersion: '1.16.5',
    createdFromSafeAddress: COOP_MULTISIG,
    createdFromOwnerAddress: '',
    checksum: '',
  },
  transactions,
}

writeFileSync(OUTPUT, JSON.stringify(batch, null, 2))

console.log(`✓ ${transactions.length} transactions across ${FACTORIES.length} factories → ${OUTPUT}`)
console.log()
console.log('Import at app.safe.global → select Coop multisig → New Transaction → Transaction Builder:')
for (const f of FACTORIES) {
  console.log(`  ${f.name.padEnd(14)} ${f.address}`)
  console.log(`    setRevNetTerminal(${NEW_TERMINAL})`)
  console.log(`    setRevNetProjectId(${NEW_PROJECT_ID})`)
}
