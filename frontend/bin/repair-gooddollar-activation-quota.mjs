// One-time repair approved by Corantin on 2026-11-25. No signing or broadcasting.
// Default: read-only audit. --apply requires the exact three-failure snapshot.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi, zeroAddress } from 'viem';

const DAY = 20782; // 2026-11-25 UTC; never reset a later day's allowance.
const COUNCIL = '0x705a58f9c33d0a5be425b87dc34b157c508fe467';
const COMMUNITY = '0x215b9ed0182d200563921f46ecbcb86111e9ad6b';
const OWNERS = [COUNCIL, '0x809c9f8dd8ca93a41c3adca4972fa234c28f7714', '0x453872325f7507762375fd5a4ab877c10c1b2f8c'];
const PREFIX = `markee:sdk:authorization:activation:{opt-in}:${DAY}:`;
const MARKER = 'markee:sdk:authorization:repair:{opt-in}:2026-11-25:gooddollar';

export function validateRepair(counters, pending, day) {
  assert.equal(day, DAY, 'Repair is restricted to 2026-11-25 UTC');
  assert.ok(pending.every(({ count }) => count === 0), 'An activation is pending');
  assert.ok(counters.every(({ key, count }) => key.startsWith(PREFIX) && Number.isSafeInteger(count) && count > 0), 'Unexpected counter');
  const subjects = counters.map(row => ({ ...row, subject: row.key.slice(PREFIX.length) }));
  const group = prefix => subjects.filter(row => row.subject.startsWith(prefix));
  const total = rows => rows.reduce((sum, row) => sum + row.count, 0);
  assert.deepEqual(group('global').map(({ subject, count }) => ({ subject, count })), [{ subject: 'global', count: 3 }]);
  assert.deepEqual(group('council:').map(({ subject, count }) => ({ subject, count })), [{ subject: `council:${COUNCIL}`, count: 3 }], 'Another council used the allowance');
  const authors = group('authorizer:');
  assert.equal(total(authors), 3);
  assert.ok(authors.every(row => OWNERS.includes(row.subject.slice('authorizer:'.length))), 'Unexpected authorizer');
  assert.equal(total(group('ip:')), 3);
  assert.equal(subjects.length, 2 + authors.length + group('ip:').length, 'Unexpected quota subject');
  return counters;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.MARKEE_AUTH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.MARKEE_AUTH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.ok(url && token, 'Activation storage is unavailable');
  const cmd = async command => {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    assert.ok(response.ok && !result.error, 'Activation storage request failed');
    return result.result;
  };
  if (await cmd(['GET', MARKER])) {
    console.log('[activation-quota-repair] already completed; no changes');
    return;
  }
  async function scan(pattern) {
    let cursor = '0'; const keys = []; let pages = 0;
    do {
      const result = await cmd(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
      cursor = String(result[0]); keys.push(...result[1]);
      assert.ok(++pages <= 100 && keys.length <= 200, 'Unexpectedly large counter set');
    } while (cursor !== '0');
    const unique = [...new Set(keys)].sort();
    const values = unique.length ? await cmd(['MGET', ...unique]) : [];
    return unique.map((key, i) => ({ key, count: Number(values[i]) }));
  }
  const counters = await scan(`${PREFIX}*`);
  const pending = await scan(PREFIX.replace(':activation:', ':activation-pending:') + '*');
  const globalPendingKey = `${PREFIX.replace(':activation:', ':activation-pending:')}global`;
  if (!pending.some(row => row.key === globalPendingKey)) pending.push({ key: globalPendingKey, count: 0 });
  console.log('[activation-quota-audit]', JSON.stringify({ day: DAY, counters: counters.map(({ key, count }) => ({ subject: key.includes(':ip:') ? `ip:${createHash('sha256').update(key).digest('hex').slice(0, 12)}` : key.slice(PREFIX.length), count })), pendingTotal: pending.reduce((sum, row) => sum + row.count, 0) }));
  if (!apply) return;
  validateRepair(counters, pending, Math.floor(Date.now() / 86400000));
  assert.equal(await cmd(['EXISTS', 'sdk:v1:keeper-lock']), 0, 'Keeper is processing a transaction');
  const client = createPublicClient({ transport: http('https://mainnet.base.org') });
  const key = keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [42220n, COMMUNITY]));
  const integration = await client.readContract({ address: '0xa9d9b3a9CE7edA7000A4baD8Af0863F716eA9d30', abi: parseAbi(['function communityIntegration(bytes32) view returns ((uint256 communityChainId,address registryCommunity,address vault,address factory,address leaderboard,address seedMarkee) integration)']), functionName: 'communityIntegration', args: [key] });
  assert.equal(integration.leaderboard, zeroAddress, 'Community already has a deployed board');
  // Compare every observed counter atomically, and preserve a private repair
  // record. Do not touch authorization nonces, operation journals or receipts.
  const snapshot = [...counters, ...pending];
  const changed = await cmd(['EVAL',
    "if redis.call('EXISTS', KEYS[#KEYS]) == 1 then return 0 end; for i = 1, #KEYS - 1 do if tonumber(redis.call('GET', KEYS[i]) or '0') ~= tonumber(ARGV[i]) then return -1 end end; for i = 1, #KEYS - 1 do redis.call('DEL', KEYS[i]) end; redis.call('SET', KEYS[#KEYS], ARGV[#KEYS], 'EX', 604800); return 1",
    snapshot.length + 1, ...snapshot.map(row => row.key), MARKER,
    ...snapshot.map(row => String(row.count)), JSON.stringify({ repairedAt: new Date().toISOString(), community: COMMUNITY, snapshot }),
  ]);
  assert.equal(changed, 1, 'Counters changed during inspection; nothing reset');
  const remaining = await cmd(['MGET', ...snapshot.map(row => row.key)]);
  assert.ok(remaining.every(value => value === null || Number(value) === 0), 'Counter verification failed');
  console.log('[activation-quota-repair] verified: three failed GoodDollar attempts cleared; deployed=0, pending=0');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error('[activation-quota-repair]', error.message);
  process.exitCode = 1;
});
