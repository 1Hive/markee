import assert from 'node:assert/strict';
import test from 'node:test';
import { zeroAddress } from 'viem';
import { communityMinimumMonthlyRate } from '../lib/sdk/gardens/preview-minimum';

const router = '0x1111111111111111111111111111111111111111' as const;
const factory = '0x2222222222222222222222222222222222222222' as const;
test('an inactive community exposes the actual factory default in monthly wei', async () => {
  const calls: { address: string; functionName: string }[] = [];
  const client = { readContract: async (args: { address: string; functionName: string }) => {
    calls.push(args);
    return args.functionName === 'streamingLeaderboardFactory' ? factory : 1000000000000001n;
  } };
  assert.equal(await communityMinimumMonthlyRate(client as never, router), 1000000000000001n);
  assert.deepEqual(calls.map(({ address, functionName }) => [address, functionName]), [
    [router, 'streamingLeaderboardFactory'], [factory, 'defaultMinimumMonthlyRate'],
  ]);
});
test('active boards retain their own minimum, including a configured zero, without extra RPC', async () => {
  const client = { readContract: async () => { throw new Error('must not read factory'); } };
  assert.equal(await communityMinimumMonthlyRate(client as never, router, 23n), 23n);
  assert.equal(await communityMinimumMonthlyRate(client as never, router, 0n), 0n);
});
test('missing or unavailable defaults retain v1 unavailable display data without inventing a price', async () => {
  const unavailable = { readContract: async () => { throw new Error('RPC unavailable'); } };
  assert.equal(await communityMinimumMonthlyRate(unavailable as never, null), 0n);
  assert.equal(await communityMinimumMonthlyRate(unavailable as never, router), 0n);
  const unconfigured = { readContract: async () => zeroAddress };
  assert.equal(await communityMinimumMonthlyRate(unconfigured as never, router), 0n);
  let count = 0;
  const factoryUnavailable = { readContract: async () => { if (++count === 1) return factory; throw new Error('RPC unavailable'); } };
  assert.equal(await communityMinimumMonthlyRate(factoryUnavailable as never, router), 0n);
});
