import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAbiParameters, decodeFunctionData, parseAbi } from 'viem';
import { parseAction, placement, assertTextLength } from '../lib/sdk/validation';
import { signEnvelope, verifyEnvelope } from '../lib/sdk/transactions';
import { lifiStatus } from '../lib/sdk/bridge';
import { buildMarkeeOpenStreamOperations, getMarkeeStreamAmounts, getMarkeeAutoFunding } from '../lib/sdk/gardens/streaming';
import { consumeMarkeeChallenge, saveMarkeeChallenge, clearMarkeeChallengesForTests } from '../lib/sdk/gardens/challenge-store';
import { executeAdmin, operationStatus } from '../lib/sdk/operations';
import { NextRequest } from 'next/server';
import { GET, POST, OPTIONS } from '../app/api/sdk/v1/[...path]/route';
import { publicDataProxyEnabled, readPresentationData, recordPublicView } from '../lib/sdk/presentation-data';

const a = '0x1111111111111111111111111111111111111111' as const;
const b = '0x2222222222222222222222222222222222222222' as const;
const c = '0x3333333333333333333333333333333333333333' as const;

test('API input validation rejects unsupported chains, arbitrary actions and UTF-8 overflow', () => {
  assert.throws(() => placement({ kind: 'board', chainId: 1, address: a }));
  assert.throws(() => parseAction({ kind: 'send', to: a, value: '100' }));
  assert.throws(() => parseAction({ kind: 'fund', markee: a, amount: '1e18' }));
  assert.throws(() => assertTextLength('🪧🪧', 7));
  assert.doesNotThrow(() => assertTextLength('🪧🪧', 8));
});
test('signed preparations bind recipient, amount, sender and calldata', () => {
  const original = { placement: { kind: 'board' as const, address: a, chainId: 8453 }, action: { kind: 'wrap' as const, amount: '1' },
    transaction: { from: a, to: b, chainId: 8453, value: '0x1' as const, data: '0x1234' as const, gas: '0x1000' as const },
    board: a, token: c, issuedAt: Date.now(), expiresAt: Date.now() + 10000 };
  const signed = signEnvelope(original);
  assert.deepEqual(verifyEnvelope(signed), original);
  const [payload, signature] = signed.split('.');
  const altered = JSON.parse(Buffer.from(payload, 'base64url').toString()); altered.transaction.to = c;
  assert.throws(() => verifyEnvelope(`${Buffer.from(JSON.stringify(altered)).toString('base64url')}.${signature}`), /changed/);
  assert.throws(() => verifyEnvelope(signEnvelope({ ...original, issuedAt: Date.now() - 8 * 86400_000 })), /expired/);
});
test('rental switch deletes the old stream, then creates the new tagged stream and connects its refund pool', () => {
  const ops = buildMarkeeOpenStreamOperations({ approvalAmount: 100n, backer: a, board: b, buffer: 100n, cfaAgreement: c,
    ethx: a, gdaAgreement: b, existingMarkee: b, existingRatePerSecond: 1n, markee: c, pool: a, ratePerSecond: 2n, wrapValue: 1n });
  assert.deepEqual(ops.map(op => op.operationType), [301, 1, 301, 201, 201, 201]);
  assert.deepEqual(decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], ops[1].data), [b, 100n]);
  const [deleteData] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], ops[3].data);
  assert.equal(decodeFunctionData({ abi: parseAbi(['function deleteFlow(address,address,address,bytes) returns(bytes)']), data: deleteData }).functionName, 'deleteFlow');
  const [, userData] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], ops[4].data);
  assert.deepEqual(decodeAbiParameters([{ type: 'address' }], userData), [c]);
});
test('rental minimum rounding and both buffer obligations are covered before streaming', () => {
  const minimum = 10n ** 15n;
  const { ratePerSecond } = getMarkeeStreamAmounts(minimum, 0n, minimum);
  assert.ok(ratePerSecond * 2628000n >= minimum);
  const funding = getMarkeeAutoFunding({ ethxAvailableBalance: 0n, nativeBalance: 10n ** 18n, ratePerSecond });
  assert.ok(funding.prefund > ratePerSecond * 14400n);
  assert.equal(funding.depositTopUp, ratePerSecond * 14400n);
  assert.ok(funding.wrapValue < 10n ** 18n - 10n ** 15n);
});
test('authorization nonce can be consumed exactly once', async () => {
  clearMarkeeChallengesForTests();
  await saveMarkeeChallenge({ namespace: 'sdk-test', nonce: '123', ttlSeconds: 60, value: { amount: 123n } });
  const results = await Promise.all([1, 2].map(() => consumeMarkeeChallenge<{ amount: bigint }>({ namespace: 'sdk-test', nonce: '123' })));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean)!.amount, 123n);
});
test('replaying an admin request returns its saved result without executing a second time', async () => {
  let calls = 0;
  const body = { nonce: '135', signature: '0x123456' };
  const request = new Request('http://localhost/admin');
  const handler = async () => { calls++; return Response.json({ transactionHash: `0x${'a'.repeat(64)}`, authorized: true }); };
  const first = await (await executeAdmin('test', request, body, handler)).json();
  const second = await (await executeAdmin('test', request, body, handler)).json();
  assert.equal(calls, 1); assert.equal(first.id, second.id);
  assert.equal((await operationStatus(first.id)).status, 'complete');
});
test('bridge refunds and partial delivery never show as a completed treasury claim', () => {
  assert.equal(lifiStatus('DONE', 'COMPLETED'), 'success');
  assert.equal(lifiStatus('DONE', 'REFUNDED'), 'refund');
  assert.equal(lifiStatus('DONE', 'PARTIAL'), 'partial_success');
  assert.equal(lifiStatus('NOT_FOUND'), 'not_found');
  assert.equal(lifiStatus('FAILED'), 'unknown');
});
test('HTTP boundary returns CORS errors and rejects oversized bodies before RPC work', async () => {
  const preflight = OPTIONS(new NextRequest('http://localhost/api/sdk/v1/snapshot', { headers: { Origin: 'https://consumer.example' } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  const invalid = await GET(new NextRequest('http://localhost/api/sdk/v1/snapshot?placement=%7B%7D'), { params: { path: ['snapshot'] } });
  assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('Cache-Control'), 'no-store');
  const large = await POST(new NextRequest('http://localhost/api/sdk/v1/prepare', { method: 'POST', body: JSON.stringify({ message: 'a'.repeat(50000) }) }), { params: { path: ['prepare'] } });
  assert.equal(large.status, 413);
  const tampered = await POST(new NextRequest('http://localhost/api/sdk/v1/verify', { method: 'POST', body: JSON.stringify({ id: 'invalid.signature', hash: `0x${'a'.repeat(64)}` }) }), { params: { path: ['verify'] } });
  assert.equal(tampered.status, 400);
});
test('production authorization and operation journals fail closed without durable storage', async () => {
  const names = ['NODE_ENV', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'MARKEE_AUTH_REDIS_REST_URL', 'MARKEE_AUTH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = '';
    Object.assign(process.env, { NODE_ENV: 'production' });
    await assert.rejects(saveMarkeeChallenge({ namespace: 'production-test', nonce: '789', ttlSeconds: 30, value: {} }), /unavailable/);
    await assert.rejects(operationStatus('b'.repeat(64)), /unavailable/);
  } finally { for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
});

async function withPublicDataProxy(run: () => Promise<void>) {
  const previous = { NODE_ENV: process.env.NODE_ENV, MARKEE_SDK_PUBLIC_DATA_PROXY: process.env.MARKEE_SDK_PUBLIC_DATA_PROXY };
  Object.assign(process.env, { NODE_ENV: 'development', MARKEE_SDK_PUBLIC_DATA_PROXY: 'true' });
  try { await run(); }
  finally { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

test('local public data proxy loads real API shapes and preserves moderation and missing metadata', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.equal(new URL(url).origin, 'https://www.markee.xyz');
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    return Response.json(url.includes('/moderation') ? { flagged: [`8453:${a}`] } :
      url.includes('/views?') ? { [a]: { totalViews: 42 } } : {});
  });
  await withPublicDataProxy(async () => {
    assert.deepEqual(await readPresentationData(b, [a]), { flags: [`8453:${a}`], views: [42], metadata: {} });
    assert.equal(calls.length, 3);
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.equal(publicDataProxyEnabled(), false, 'production cannot replace its database with the development proxy');
  });
});

test('local public data proxy rejects failed, missing or malformed data instead of clearing moderation', async t => {
  let mode = 'unavailable';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/moderation')) return mode === 'unavailable' ? Response.json({}, { status: 503 }) :
      Response.json(mode === 'malformed-moderation' ? { flagged: null } : { flagged: [] });
    return Response.json(url.includes('/views?') && mode !== 'missing-views' ? { [a]: { totalViews: -1 } } : {});
  });
  await withPublicDataProxy(async () => {
    for (mode of ['unavailable', 'malformed-moderation', 'missing-views', 'negative-views']) {
      await assert.rejects(readPresentationData(b, [a]), error => (error as { code: string }).code === 'DATA_UNAVAILABLE');
    }
  });
});

test('local view forwarding preserves the payload and validates the upstream result', async t => {
  let valid = true;
  const body = { address: a, message: 'A real displayed message', url: 'https://consumer.example' };
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://www.markee.xyz/api/views'); assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body as string), body);
    return Response.json(valid ? { totalViews: 42, messageViews: 12, counted: false } : { totalViews: 0 });
  });
  assert.deepEqual(await recordPublicView(body), { totalViews: 42, messageViews: 12, counted: false });
  valid = false;
  await assert.rejects(recordPublicView(body), /invalid view counts/);
});
