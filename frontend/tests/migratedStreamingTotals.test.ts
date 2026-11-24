// A migrated For Rent board's totals include its legacy original's streams (lib/streaming/subgraph.ts).
import assert from 'node:assert/strict'
import test from 'node:test'
import { withLegacyTotals, type BoardTotals } from '../lib/streaming/subgraph'

const SUCCESSOR = '0xD66357ac579fD51eBD7B88Eb7339E5549E4dE2c7'
const LEGACY = '0x0FDa48f1F0fC975d1Ed7eEb044936aBDe0239664'
const totals = (entries: [string, BoardTotals][]) => new Map(entries.map(([a, t]) => [a.toLowerCase(), t]))

test("a successor counts what its legacy board raised and is still receiving", () => {
  const t = totals([[LEGACY, { raised: 270n, raisedRate: 3n }], [SUCCESSOR, { raised: 10n, raisedRate: 1n }]])
  assert.deepEqual(withLegacyTotals(t, SUCCESSOR, LEGACY), { raised: 280n, raisedRate: 4n })
  // Addresses in any case.
  assert.deepEqual(withLegacyTotals(t, SUCCESSOR.toLowerCase(), LEGACY.toUpperCase().replace('0X', '0x')), { raised: 280n, raisedRate: 4n })
})

test('a successor with no streams of its own yet still shows the legacy totals', () => {
  assert.deepEqual(withLegacyTotals(totals([[LEGACY, { raised: 270n, raisedRate: 0n }]]), SUCCESSOR, LEGACY), { raised: 270n, raisedRate: 0n })
})

test('a board that was never migrated, or whose original never streamed, is just its own', () => {
  const t = totals([[SUCCESSOR, { raised: 10n, raisedRate: 1n }]])
  assert.deepEqual(withLegacyTotals(t, SUCCESSOR, null), { raised: 10n, raisedRate: 1n })
  assert.deepEqual(withLegacyTotals(t, SUCCESSOR, LEGACY), { raised: 10n, raisedRate: 1n })
  assert.deepEqual(withLegacyTotals(new Map(), SUCCESSOR, LEGACY), { raised: 0n, raisedRate: 0n })
})
