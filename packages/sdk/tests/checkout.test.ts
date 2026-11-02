import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeClient } from '../src/client.js';
import { openHostedCheckout, savedCheckout } from '../src/checkout.js';
const placement = { kind: 'board', chainId: 8453, address: '0x1111111111111111111111111111111111111111' } as const;
const action = { kind: 'create', message: 'Hello', name: '', amount: '1000' } as const;
const session = { id: 'a'.repeat(48), readToken: 'b'.repeat(64), writeToken: 'c'.repeat(64), expiresAt: Date.now() + 100000 };
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => storage.get(k) || null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) }, configurable: true });
let destination = ''; let opens = 0; let closed = false;
const popup = { opener: {}, location: { replace: (u: string) => { destination = u; } }, get closed() { return closed; }, close: () => { closed = true; } };
Object.defineProperty(globalThis, 'window', { value: { open: () => { opens++; return popup; }, location: { origin: 'https://sample.example', assign: (u: string) => { destination = u; } } }, configurable: true });
const receipt = { status: 'confirmed', hash: `0x${'ab'.repeat(32)}`, explorerUrl: 'https://basescan.org/tx/example', tokensReceived: '50' };
test('popup opens during gesture; only server-verified receipt succeeds; tokens stay out of query', async () => {
  storage.clear(); closed = false; const requests: string[] = [];
  const client = new MarkeeClient({ fetch: async (url, init) => {
    assert.equal(opens, 1); requests.push(String(url)); assert.equal(init?.credentials, 'omit');
    if (String(url).endsWith('checkout/create')) return Response.json(session);
    assert.equal(JSON.parse(String(init?.body)).token, session.readToken);
    return Response.json({ id: session.id, status: 'confirmed', result: receipt });
  } });
  assert.deepEqual(await openHostedCheckout(client, placement, action), receipt);
  const target = new URL(destination);
  assert.equal(target.pathname, `/checkout/${session.id}`); assert.equal(target.search, '');
  assert.equal(new URLSearchParams(target.hash.slice(1)).get('token'), session.writeToken);
  assert.equal(savedCheckout(client, placement), null); assert.equal(requests.length, 2); assert.equal(closed, true);
});
test('closing a funded but unpaid popup retains its session; resume does not create another checkout', async () => {
  storage.clear(); closed = true; let creates = 0;
  const client = new MarkeeClient({ fetch: async url => {
    if (String(url).endsWith('checkout/create')) { creates++; return Response.json(session); }
    return Response.json({ id: session.id, status: 'created' });
  } });
  await assert.rejects(openHostedCheckout(client, placement, action), /funding alone/);
  assert.equal(savedCheckout(client, placement)?.id, session.id);
  await assert.rejects(openHostedCheckout(client, placement, action), /funding alone/);
  assert.equal(creates, 1);
});
test('popup-blocked navigation preserves session for mobile return', async () => {
  storage.clear();
  window.open = (() => null) as typeof window.open;
  const client = new MarkeeClient({ fetch: async () => Response.json(session) });
  await assert.rejects(openHostedCheckout(client, placement, action), /Continuing payment/);
  assert.equal(savedCheckout(client, placement)?.id, session.id);
  assert.match(destination, /\/checkout\//);
});

test('Markee supplies the session origin and explicit redirect never opens a tab', async () => {
  storage.clear(); let opened = false;
  window.open = (() => { opened = true; return null; }) as typeof window.open;
  const client = new MarkeeClient({ checkoutWindow: 'redirect', fetch: async () => Response.json({ ...session, checkoutOrigin: 'https://www.markee.xyz' }) });
  await assert.rejects(openHostedCheckout(client, placement, action), /Continuing payment/);
  assert.equal(opened, false);
  assert.equal(new URL(destination).origin, 'https://www.markee.xyz');
  assert.equal(new URL(destination).search, '');
  assert.equal(savedCheckout(client, placement)?.checkoutOrigin, 'https://www.markee.xyz');
});
