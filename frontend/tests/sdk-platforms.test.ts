import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, stringToHex } from 'viem';
import { placement } from '../lib/sdk/validation';
import { givethProjectPrototype, platformKey } from '../lib/sdk/platforms';

const owner = '0x1111111111111111111111111111111111111111' as const;
const nextOwner = '0x2222222222222222222222222222222222222222' as const;
const wallet = '0x3333333333333333333333333333333333333333' as const;
const nextWallet = '0x4444444444444444444444444444444444444444' as const;

test('generic placement is canonical and keeps old placement shapes', () => {
  const generic = placement({ kind: 'platform-community', platformId: 'revnet', chainId: 8453, communityId: '007' });
  assert.equal(generic.kind, 'platform-community');
  if (generic.kind !== 'platform-community') return;
  assert.equal(generic.communityId, '7');
  assert.match(platformKey(generic), /^0x[\da-f]{64}$/);
  assert.notEqual(platformKey(generic), keccak256(stringToHex('7')));
  assert.equal(placement({ kind: 'gardens-community', chainId: 100, community: owner }).kind, 'gardens-community');
  assert.throws(() => placement({ kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '7' }));
  assert.throws(() => placement({ kind: 'platform-community', platformId: 'revnet', chainId: 8453, communityId: '-1' }));
});

test('Giveth prototype reads current owner and Base recipient, and fails closed on outage', async () => {
  let data: { active: boolean; owner: typeof owner | typeof nextOwner; baseRecipient: typeof wallet | typeof nextWallet } | null = { active: true, owner, baseRecipient: wallet };
  const adapter = givethProjectPrototype(async id => { assert.equal(id, '42'); return data; });
  const project = { kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '42' } as const;
  assert.equal(adapter.communityId(project), `0x${(42n).toString(16).padStart(64, '0')}`);
  assert.deepEqual(await adapter.authority(project, owner), { authorized: true, recipient: wallet });
  data = { active: true, owner: nextOwner, baseRecipient: nextWallet };
  assert.deepEqual(await adapter.authority(project, owner), { authorized: false, recipient: nextWallet });
  assert.deepEqual(await adapter.authority(project, nextOwner), { authorized: true, recipient: nextWallet });
  assert.equal(await adapter.recipient(project), nextWallet);
  data = null;
  await assert.rejects(adapter.authority(project, nextOwner), /unavailable/);
});
