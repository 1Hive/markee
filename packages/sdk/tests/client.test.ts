import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeClient } from '../src/client';
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
