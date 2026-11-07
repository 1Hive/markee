import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeClient, moderationParams } from '../src/client';
import { parseEth, escapeHtml } from '../src/amount';
import type { Address, EIP1193Provider, PreparedAction } from '../src/types';

const account: Address = '0x1111111111111111111111111111111111111111';
const other: Address = '0x2222222222222222222222222222222222222222';
const hash = `0x${'a'.repeat(64)}` as const;
const preparation = (): PreparedAction => ({ id: 'signed-by-server', expiresAt: Date.now() + 100000,
  placement: { kind: 'board', chainId: 8453, address: other }, action: { kind: 'wrap', amount: '1' },
  transaction: { chainId: 8453, from: account, to: other, value: '0x1', gas: '0x10000', data: '0x1234' },
  review: { title: 'Wrap', lines: [], estimatedGasCost: '1', reward: 'No reward' } });

test('financial inputs preserve precision and reject scientific notation / excess decimals', () => {
  assert.equal(parseEth('1.000000000000000001'), '1000000000000000001');
  assert.equal(parseEth('0.000000000000000001'), '1');
  for (const value of ['1e-6', '-1', '0', '0.0000000000000000001', 'Infinity', '0x100']) assert.throws(() => parseEth(value));
});
test('message rendering escapes markup and quotes', () => {
  assert.equal(escapeHtml('<img onerror="alert(1)"/>'), '&lt;img onerror=&quot;alert(1)&quot;/&gt;');
});
test('expired reviews and account changes never reach eth_sendTransaction', async () => {
  const calls: string[] = [];
  const provider: EIP1193Provider = { async request({ method }) { calls.push(method); return method === 'eth_accounts' ? [other] : '0x2105'; } };
  const client = new MarkeeClient({ apiUrl: 'http://localhost:3000/api/sdk/v1', wallet: { getProvider: async () => provider } });
  await assert.rejects(client.send({ ...preparation(), expiresAt: 0 }), /expired/);
  assert.equal(calls.length, 0);
  await assert.rejects(client.send(preparation()), /account changed/);
  assert.ok(!calls.includes('eth_sendTransaction'));
});
test('chain-switch cancellation never sends a transaction', async () => {
  const calls: string[] = [];
  const provider: EIP1193Provider = { async request({ method }) {
    calls.push(method);
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x1';
    throw new Error('User rejected');
  } };
  const client = new MarkeeClient({ apiUrl: 'http://localhost:3000/api/sdk/v1', wallet: { getProvider: async () => provider } });
  await assert.rejects(client.send(preparation()), /rejected/);
  assert.ok(!calls.includes('eth_sendTransaction'));
});

test('plain-object cancellation emits readable errors, leaves no pending payment and allows retry', async () => {
  let rejected = true;
  const error = { code: 4001, message: 'User rejected the request.' };
  const events: { type: string; message?: string }[] = [];
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (rejected) throw error;
    return hash;
  } };
  const client = new MarkeeClient({ wallet: { getProvider: async () => provider }, onEvent: event => events.push(event) });
  const p = preparation();
  await assert.rejects(client.send(p), value => value === error);
  assert.match(events[0].message!, /^Wallet request cancelled\./);
  assert.equal(client.pending(p.placement, account), undefined);
  assert.equal(events.some(event => event.type === 'submitted'), false);
  rejected = false;
  assert.equal(await client.send(p), hash);
});
test('host wallet is reused and pending transaction blocks duplicate payment until verified', async () => {
  const calls: string[] = [];
  const provider: EIP1193Provider = { async request({ method }) { calls.push(method); return method === 'eth_accounts' ? [account] : method === 'eth_chainId' ? '0x2105' : hash; } };
  let confirmed = false;
  const client = new MarkeeClient({ apiUrl: 'http://localhost:3000/api/sdk/v1', wallet: { getProvider: async () => provider }, fetch: async () => Response.json({ status: confirmed ? 'confirmed' : 'pending', hash, explorerUrl: 'https://basescan.org/tx/' + hash }) });
  const p = preparation();
  assert.equal(await client.send(p), hash);
  assert.equal(calls.filter(c => c === 'eth_sendTransaction').length, 1);
  assert.ok(!calls.includes('eth_requestAccounts'));
  await assert.rejects(client.send(p), /still pending/);
  const pending = client.pending(p.placement, account)!;
  assert.equal((await client.verify(pending)).status, 'pending');
  assert.ok(client.pending(p.placement, account));
  confirmed = true;
  await client.verify(pending);
  assert.equal(client.pending(p.placement, account), undefined);
});
test('API errors retain status and never send cookies', async () => {
  const client = new MarkeeClient({ apiUrl: 'https://markee.example/api/sdk/v1', fetch: async (_url, options) => {
    assert.equal(options?.credentials, 'omit');
    return Response.json({ error: 'Rate limited', code: 'RATE_LIMITED' }, { status: 429 });
  } });
  await assert.rejects(client.snapshot(preparation().placement), { status: 429, code: 'RATE_LIMITED' });
});

test('site registration sends placement and URL once without wallet or credentials', async () => {
  let calls = 0;
  const placement = { kind: 'board' as const, chainId: 8453, address: other };
  const client = new MarkeeClient({ siteUrl: 'https://app.example', fetch: async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith('/sites/verify'));
    assert.equal(init?.credentials, 'omit');
    assert.deepEqual(JSON.parse(String(init?.body)), { placement, siteUrl: 'https://app.example' });
    return Response.json({ verified: true, url: 'https://app.example/' });
  } });
  client.registerSite(placement);
  client.registerSite(placement);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
});

test('configured moderation severity reaches draft, published snapshot, preparation, and view requests', async () => {
  const requests: { url: string; body: any }[] = [];
  const client = new MarkeeClient({ moderation: { severity: 'strict' }, wallet: { getProvider: async () => ({ request: async () => [account] }) }, fetch: async (url, init) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ state: 'pass' });
  } });
  await client.checkMessage('hello');
  await client.snapshot(preparation().placement);
  await client.prepare(preparation().placement, { kind: 'edit-message', markee: other, message: 'hello' });
  await client.recordView(other, 'hello');
  assert.equal(requests[0].body.severity, 'strict');
  assert.equal(new URL(requests[1].url).searchParams.get('severity'), 'strict');
  assert.equal(requests[2].body.severity, 'strict');
  assert.equal(requests[3].body.severity, 'strict');
});

test('configured moderation rules reach draft, published snapshot, preparation, and view requests', async () => {
  const requests: { url: string; body: any }[] = [];
  const client = new MarkeeClient({ moderation: { rules: { profanity: false, ens: true } }, wallet: { getProvider: async () => ({ request: async () => [account] }) }, fetch: async (url, init) => {
    requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ state: 'pass' });
  } });
  await client.checkMessage('hello');
  await client.snapshot(preparation().placement);
  await client.prepare(preparation().placement, { kind: 'edit-message', markee: other, message: 'hello' });
  await client.recordView(other, 'hello');
  // Unset rules follow Standard: links and addresses off; profanity explicitly off, ENS on.
  assert.equal(requests[0].body.rules, 'ens');
  assert.equal(requests[0].body.severity, undefined, 'no severity unless configured');
  assert.equal(new URL(requests[1].url).searchParams.get('rules'), 'ens');
  assert.equal(requests[2].body.rules, 'ens');
  assert.equal(requests[3].body.rules, 'ens');
});

test('moderation rules default unset rules from the severity preset, and are omitted when none are set', () => {
  assert.deepEqual(moderationParams({ severity: 'strict', rules: { links: false } }), { severity: 'strict', rules: 'profanity,addresses,ens' });
  assert.deepEqual(moderationParams({ severity: 'relaxed', rules: { addresses: true } }), { severity: 'relaxed', rules: 'addresses' });
  assert.deepEqual(moderationParams({ rules: { profanity: false, links: false, addresses: false, ens: false } }), { rules: '' });
  assert.deepEqual(moderationParams({ severity: 'strict', rules: {} }), { severity: 'strict' });
  assert.deepEqual(moderationParams(undefined), {});
});

test('a configured moderation policy never treats an unsupported check endpoint as passing', async () => {
  const client = new MarkeeClient({ moderation: { severity: 'strict' }, fetch: async () => Response.json({ error: 'Not found' }, { status: 404 }) });
  await assert.rejects(client.checkMessage('hello'), { status: 404 });
});
