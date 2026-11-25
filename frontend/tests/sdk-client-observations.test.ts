import assert from 'node:assert/strict';
import test from 'node:test';
import { clientLabel, clearClientObservationsForTests, observationDeps, observeSdkClient, originHost } from '../lib/sdk/client-observations';

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
