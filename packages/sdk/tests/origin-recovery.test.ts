import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_MARKEE_API_URL, MarkeeClient } from '../src/client.js';
import { openHostedCheckout, savedCheckout } from '../src/checkout.js';
import { FORMER_API_URL, PRODUCTION_API_URL } from '../src/storage-origins.js';

const account = '0x1111111111111111111111111111111111111111' as const;
const placement = { kind: 'board', chainId: 8453, address: account } as const;
const hash = `0x${'a'.repeat(64)}`;
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
const pendingKey = `markee:sdk:v1:pending:${FORMER_API_URL}`;
const checkoutKey = `markee:checkout:v1:${FORMER_API_URL}:${JSON.stringify(placement)}`;
const record = { hash, preparation: { id: 'staging-preparation', placement, transaction: { from: account } } };
const session = { id: 'a'.repeat(48), readToken: 'b'.repeat(64), writeToken: 'c'.repeat(64), expiresAt: Date.now() + 100000 };

test('new requests use production; explicit overrides remain isolated and no fallback occurs', async () => {
  storage.clear(); storage.set(pendingKey, JSON.stringify([record]));
  assert.equal(DEFAULT_MARKEE_API_URL, PRODUCTION_API_URL);
  const urls: string[] = [];
  const client = new MarkeeClient({ fetch: async url => { urls.push(String(url)); return Response.json({ error: 'Unavailable' }, { status: 503 }); } });
  await assert.rejects(client.snapshot(placement));
  assert.equal(urls.length, 1);
  assert.equal(urls[0].split("?")[0], `${PRODUCTION_API_URL}/snapshot`);
  const custom = new MarkeeClient({ apiUrl: 'https://custom.example/api/sdk/v1/' });
  assert.equal(custom.apiUrl, 'https://custom.example/api/sdk/v1');
  assert.equal(custom.pending(placement, account), undefined);
});

test('staging transaction recovery stays on its original API and clears only after terminal verification', async () => {
  storage.clear(); storage.set(pendingKey, JSON.stringify([record]));
  let confirmed = false;
  const client = new MarkeeClient({ fetch: async url => {
    assert.equal(String(url), `${FORMER_API_URL}/verify`);
    return Response.json({ status: confirmed ? 'confirmed' : 'pending', hash });
  } });
  const pending = client.pending(placement, account)!;
  assert.ok(pending);
  await client.verify(pending);
  assert.ok(client.pending(placement, account));
  confirmed = true;
  await client.reconcile(pending, hash as `0x${string}`);
  assert.equal(client.pending(placement, account), undefined);
  assert.deepEqual(JSON.parse(storage.get(pendingKey)!), []);
});

test('staging authorization verification preserves its signature and stores a recoverable receipt', async () => {
  storage.clear();
  storage.set(`${pendingKey}:admin`, JSON.stringify({ kind: 'activate', nonce: 'nonce', signature: '0xab', account, community: account, chainId: 8453 }));
  const client = new MarkeeClient({ fetch: async (url, init) => {
    assert.equal(String(url), `${FORMER_API_URL}/community/activate`);
    assert.deepEqual(JSON.parse(String(init?.body)), { action: 'verify', nonce: 'nonce', signature: '0xab' });
    return Response.json({ status: 'complete', result: { transactionHash: hash } });
  } });
  await client.resumeAuthorization();
  assert.equal(client.pendingAuthorization(), null);
  assert.equal(new MarkeeClient().communityReceipt({ kind: 'gardens-community', chainId: 8453, community: account })?.transactionHash, hash);
});

test('legacy hosted checkout uses staging status and destination without creating a checkout', async () => {
  storage.clear(); storage.set(checkoutKey, JSON.stringify(session));
  let destination = ''; let requests = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    open: () => ({ opener: {}, location: { replace: (url: string) => { destination = url; } }, closed: true, close() {} }),
    location: { origin: 'https://sample.example' },
  } });
  const client = new MarkeeClient({ fetch: async url => {
    requests++; assert.equal(String(url), `${FORMER_API_URL}/checkout/status`);
    return Response.json({ status: 'created' });
  } });
  await assert.rejects(openHostedCheckout(client, placement, { kind: 'create', message: 'Hello', name: '', amount: '1' }), /funding alone/);
  assert.equal(new URL(destination).origin, 'https://staging.markee.xyz');
  assert.equal(requests, 2);
  assert.equal(savedCheckout(client, placement)?.id, session.id);
});

test('missing legacy checkout fails closed and retains its recovery tokens', async () => {
  storage.clear(); storage.set(checkoutKey, JSON.stringify(session));
  const client = new MarkeeClient({ fetch: async url => {
    assert.equal(String(url), `${FORMER_API_URL}/checkout/status`);
    return Response.json({ error: 'Not found' }, { status: 404 });
  } });
  await assert.rejects(openHostedCheckout(client, placement, { kind: 'create', message: 'Hello', name: '', amount: '1' }), { code: 'CHECKOUT_RECOVERY_REQUIRED' });
  assert.equal(savedCheckout(client, placement)?.readToken, session.readToken);
});
