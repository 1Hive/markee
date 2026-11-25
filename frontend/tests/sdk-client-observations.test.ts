import assert from 'node:assert/strict';
import test from 'node:test';
import { clientLabel, clearClientObservationsForTests, observationDeps, observeSdkClient, originHost, sdkVersionsForVerifiedUrls, unmarkedApiCallsForVerifiedUrls } from '../lib/sdk/client-observations';

const board = '0x1111111111111111111111111111111111111111';

test('SDK attribution accepts only a bounded version marker and a bare origin', () => {
  assert.equal(clientLabel('markee-sdk@0.1.0-beta.17'), 'markee-sdk@0.1.0-beta.17');
  assert.equal(clientLabel(null), 'unattributed');
  assert.equal(clientLabel('custom-client'), 'unattributed');
  assert.equal(clientLabel('markee-sdk@0.1.0\nspoof'), 'unattributed');
  assert.equal(originHost('https://Example.org'), 'example.org');
  assert.equal(originHost('https://example.org/private-path'), 'unknown-origin');
  assert.equal(originHost(null), 'unknown-origin');
});

test('board observations deduplicate, store no wallet or path, and never block snapshots', async t => {
  clearClientObservationsForTests();
  let now = 1_000_000;
  const writes: Array<[string, string, number]> = [];
  t.mock.method(observationDeps, 'now', () => now);
  t.mock.method(observationDeps, 'write', async (key: string, field: string, timestamp: number) => { writes.push([key, field, timestamp]); return 1; });
  await observeSdkClient(board, 'markee-sdk@0.1.0-beta.17', 'https://example.org');
  await observeSdkClient(board, 'markee-sdk@0.1.0-beta.17', 'https://example.org');
  assert.deepEqual(writes, [[`sdk:client-observations:v1:8453:${board}`, 'markee-sdk@0.1.0-beta.17|example.org', now]]);
  now += 30 * 60_000;
  await observeSdkClient(board, null, 'https://example.org');
  assert.equal(writes[1][1], 'unattributed|example.org');
  await observeSdkClient(null, null, null);
  assert.equal(writes.length, 2);
});

test('integration evidence reports only marked SDK versions for verified hosts', () => {
  const evidence = sdkVersionsForVerifiedUrls({
    'unattributed|example.org': 2000,
    'markee-sdk@0.1.0-beta.17|www.example.org': 3000,
    'markee-sdk@0.1.0-beta.16|example.org': 1000,
    'markee-sdk@0.1.0-beta.17|unverified.org': 4000,
    'custom-client|example.org': 5000,
  }, ['https://example.org/message']);
  assert.deepEqual(evidence, { 'example.org': { version: '0.1.0-beta.17', lastSeen: 3000 } });
  assert.deepEqual(sdkVersionsForVerifiedUrls({ 'unattributed|example.org': 2000 }, ['https://example.org']), {});
});

test('unmarked SDK API calls are reported only for verified hosts without claiming package usage', () => {
  const fields = {
    'unattributed|www.example.org': 3000,
    'unattributed|example.org': 2000,
    'unattributed|unverified.org': 4000,
    'markee-sdk@0.1.0-beta.17|example.org': 5000,
    'unattributed|unknown-origin': 6000,
  };
  assert.deepEqual(unmarkedApiCallsForVerifiedUrls(fields, ['https://example.org/message']), {
    'example.org': { lastSeen: 3000 },
  });
  assert.deepEqual(unmarkedApiCallsForVerifiedUrls(fields, []), {});
});
