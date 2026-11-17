import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlacementInput } from '../src/placement-input';
import { signHtml } from '../src/sign';
import type { Snapshot } from '../src/types';

const board = '0x1111111111111111111111111111111111111111' as const;
const identity = { platformId: 'revnet', chainId: 8453, communityId: '42' };
const placement = { kind: 'board' as const, chainId: 8453, address: board };

test('multiBoard is an additive shorthand and conflicts are rejected', () => {
  assert.deepEqual(resolvePlacementInput({ multiBoard: identity }), { kind: 'platform-community', ...identity });
  assert.deepEqual(resolvePlacementInput({ placement }), placement);
  assert.throws(() => resolvePlacementInput({} as never), /exactly one/);
  assert.throws(() => resolvePlacementInput({ placement, multiBoard: identity } as never), /exactly one/);
  assert.throws(() => resolvePlacementInput({ multiBoard: { ...identity, platformId: 'Bad ID' } }), /Invalid/);
  assert.throws(() => resolvePlacementInput({ multiBoard: { ...identity, communityId: '' } }), /Invalid/);
});

const snapshot = (status: 'not_integrated' | 'pending_admin' | 'disabled'): Snapshot => ({
  placement: { kind: 'platform-community', ...identity }, board: status === 'pending_admin' ? board : null,
  name: 'Community Markee', community: { integration: { status, leaderboardAddress: status === 'pending_admin' ? board : null, vaultAddress: null },
    markeeChainId: 8453, revenue: { claimableAmount: '0', symbol: 'ETH' },
    platform: { id: 'revnet', communityId: '42', destinationChainId: 8453, recipient: null, enabled: status !== 'disabled' } },
}) as Snapshot;

test('inactive and pending community signs never show a previous board message', () => {
  assert.match(signHtml(snapshot('not_integrated'), true), /Explore Markee for this community/);
  assert.match(signHtml(snapshot('pending_admin'), true), /accept board ownership/);
  assert.match(signHtml(snapshot('disabled'), true), /not enabled/);
  assert.doesNotMatch(signHtml(snapshot('disabled'), true), /data-markee-open/);
  assert.match(signHtml(null, true, true), /temporarily unavailable/);
});
