import assert from 'node:assert/strict';
import test from 'node:test';
import { fundingPresets, MONTH } from '../src/presentation';
import type { Entry, Snapshot } from '../src/types';

const a = '0x1111111111111111111111111111111111111111';
const b = '0x2222222222222222222222222222222222222222';
const amount = 10n ** 18n;
const entry = (address: typeof a | typeof b, score: bigint): Entry => ({ address, owner: a, message: '', name: '', score: String(score), totalFunds: String(score), aggregateRate: String(score), legacyFloor: '0', moderated: false, views: 0 });
const board = (strategy: 'rent' | 'sale', entries: Entry[]): Snapshot => ({ strategy, entries, minimum: '1000000000000000', top: b, wallet: null } as Snapshot);

test('sale WIN suggests only the additional payment and preserves wei precision', () => {
  const own = entry(a, amount + 5n), leader = entry(b, 3n * amount + 7n);
  const presets = fundingPresets(board('sale', [own, leader]), own);
  assert.equal(BigInt(own.totalFunds) + presets.boost, BigInt(leader.totalFunds) + 10n ** 15n);
  assert.equal(presets.double, false);
  assert.equal(presets.minimum, 1n); // Existing messages accept any positive addition.
  assert.equal(fundingPresets(board('sale', [own, leader])).minimum, 10n ** 15n);
  const winner = fundingPresets(board('sale', [own, leader]), leader);
  assert.equal(winner.boost, BigInt(leader.totalFunds));
  assert.equal(winner.double, true);
});

test('rental WIN replaces the current wallet rate without counting a legacy floor as live funds', () => {
  const own = entry(a, 900000000000n), leader = entry(b, 1000000000000n);
  own.aggregateRate = '200000000000'; own.legacyFloor = own.score;
  const snapshot = board('rent', [own, leader]);
  snapshot.wallet = { backedMarkee: a, flowRate: '100000000000' } as Snapshot['wallet'];
  const presets = fundingPresets(snapshot, own);
  const others = BigInt(own.aggregateRate) - BigInt(snapshot.wallet!.flowRate);
  assert.ok(others + presets.boost / MONTH > BigInt(leader.score));
  assert.equal(presets.boost, (BigInt(leader.score) - others) * MONTH + 10n ** 15n);
});

test('rental MIN rounds up and 2x doubles the wallet contribution, not other backers', () => {
  const own = entry(a, 1000000000000n), other = entry(b, 100000000n);
  const snapshot = board('rent', [own, other]);
  snapshot.minimum = '1000000000000001'; snapshot.top = a;
  snapshot.wallet = { backedMarkee: a, flowRate: '10000000000' } as Snapshot['wallet'];
  const presets = fundingPresets(snapshot, own);
  assert.equal(presets.minimum, 2n * 10n ** 15n);
  assert.equal(presets.boost, 2n * BigInt(snapshot.wallet!.flowRate) * MONTH);
  assert.equal(presets.double, true);
});
