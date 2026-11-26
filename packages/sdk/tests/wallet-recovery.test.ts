import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeClient } from '../src/client';
import type { Address, EIP1193Provider, PreparedAction } from '../src/types';

const account = '0x1111111111111111111111111111111111111111' as Address;
const board = '0x2222222222222222222222222222222222222222' as Address;
const hash = `0x${'a'.repeat(64)}` as const;
const apiUrl = 'https://www.markee.xyz/api/sdk/v1';
const prep = (): PreparedAction => ({ id: 'signed-review', expiresAt: Date.now() + 100_000,
  placement: { kind: 'board', chainId: 8453, address: board }, action: { kind: 'fund', markee: board, amount: '1' },
  transaction: { from: account, to: board, chainId: 8453, data: '0x1234', value: '0x1', gas: '0x10000' },
  review: { title: 'Fund', lines: [], estimatedGasCost: '1', reward: '' } });

function browser(t: test.TestContext) {
  const values = new Map<string, string>();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } } });
  t.after(() => prior ? Object.defineProperty(globalThis, 'window', prior) : Reflect.deleteProperty(globalThis, 'window'));
  return values;
}

test('direct wallet intent survives an ambiguous send and reload without a second payment', async t => {
  const values = browser(t);
  let sends = 0;
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_sendTransaction') { sends++; assert.ok([...values.keys()].some(key => key.includes('wallet-recovery'))); throw Error('RPC disconnected'); }
    throw Error(method);
  } };
  const options = { wallet: { getProvider: async () => provider } };
  await assert.rejects(new MarkeeClient(options).send(prep()), /RPC disconnected/);
  const resumed = new MarkeeClient(options);
  assert.equal(resumed.pendingOperation(prep().placement, account)?.preparation.id, 'signed-review');
  await assert.rejects(resumed.send(prep()), /still pending/);
  assert.equal(sends, 1);
});

test('an ambiguous direct send can attach a wallet hash and confirm without resubmitting', async t => {
  browser(t);
  let sends = 0;
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_sendTransaction') { sends++; throw Error('response lost'); }
    throw Error(method);
  } };
  const options = { wallet: { getProvider: async () => provider }, fetch: async (_url: unknown, init?: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { id: 'signed-review', hash });
    return Response.json({ status: 'confirmed', hash, explorerUrl: 'https://basescan.org/tx/' + hash });
  } };
  await assert.rejects(new MarkeeClient(options).send(prep()), /response lost/);
  const resumed = new MarkeeClient(options);
  const operation = resumed.pendingOperation(prep().placement, account)!;
  assert.ok('phase' in operation && operation.phase === 'submitting');
  assert.equal((await resumed.recoverOperation(operation as Extract<typeof operation, { phase: 'submitting' }>, hash))?.status, 'confirmed');
  assert.equal(resumed.pendingOperation(prep().placement, account), undefined);
  assert.equal(sends, 1);
});

test('explicit rejection clears the intent; unavailable storage stops before the wallet prompt', async t => {
  browser(t);
  let sends = 0;
  let reject = true;
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_sendTransaction') { sends++; if (reject) throw { code: 4001, message: 'Rejected' }; return hash; }
    throw Error(method);
  } };
  const client = new MarkeeClient({ wallet: { getProvider: async () => provider } });
  await assert.rejects(client.send(prep()), { code: 4001 });
  assert.equal(client.pendingOperation(prep().placement, account), undefined);
  reject = false;
  assert.equal(await client.send(prep()), hash);
  assert.equal(sends, 2);
  (globalThis.window as unknown as { localStorage: { setItem(): void } }).localStorage.setItem = () => { throw Error('disabled'); };
  const other = new MarkeeClient({ wallet: { getProvider: async () => provider } });
  await assert.rejects(other.send({ ...prep(), placement: { kind: 'board', chainId: 8453, address: account } }), /storage is unavailable/);
  assert.equal(sends, 2);
});

test('an accepted direct hash survives reload and a confirmed review cannot be sent twice', async t => {
  browser(t);
  let sends = 0;
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_sendTransaction') { sends++; return hash; }
    throw Error(method);
  } };
  const options = { wallet: { getProvider: async () => provider }, fetch: async () => Response.json({ status: 'confirmed', hash, explorerUrl: 'https://basescan.org/tx/' + hash }) };
  await new MarkeeClient(options).send(prep());
  const resumed = new MarkeeClient(options);
  const pending = resumed.pendingOperation(prep().placement, account)!;
  assert.ok('hash' in pending);
  assert.equal((await resumed.verifyOperation(pending))?.status, 'confirmed');
  assert.equal(resumed.pendingOperation(prep().placement, account), undefined);
  await assert.rejects(resumed.send(prep()), /already confirmed/);
  assert.equal(sends, 1);
});

test('atomic EIP-5792 batch survives reload and confirms only after API verification', async t => {
  browser(t);
  const methods: string[] = [];
  const events: string[] = [];
  let status = 100;
  const provider: EIP1193Provider = { async request({ method, params }) {
    methods.push(method);
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'wallet_getCapabilities') return { '0x2105': { atomic: { status: 'supported' } } };
    if (method === 'wallet_sendCalls') {
      const call = (params as [{ atomicRequired: boolean; calls: { to: Address; data: string; value: string }[] }])[0];
      assert.equal(call.atomicRequired, true);
      assert.deepEqual(call.calls, [{ to: board, data: '0x1234', value: '0x1' }]);
      return { id: '0x1234' };
    }
    if (method === 'wallet_getCallsStatus') return { id: '0x1234', chainId: '0x2105', status, atomic: true, receipts: status === 200 ? [{ transactionHash: hash, status: '0x1' }] : undefined };
    throw Error(method);
  } };
  const options = { wallet: { getProvider: async () => provider }, onEvent: (event: { type: string }) => events.push(event.type),
    fetch: async (_url: unknown, init?: RequestInit) => {
      assert.deepEqual(JSON.parse(String(init?.body)), { id: 'signed-review', hash, mode: 'batch' });
      return Response.json({ status: 'confirmed', hash, explorerUrl: 'https://basescan.org/tx/' + hash });
    } };
  const client = new MarkeeClient(options);
  const submitted = await client.submit(prep());
  assert.ok('batchId' in submitted);
  const resumed = new MarkeeClient(options);
  const pending = resumed.pendingOperation(prep().placement, account)!;
  assert.ok('batchId' in pending);
  assert.equal(await resumed.verifyOperation(pending), null);
  await assert.rejects(resumed.submit(prep()), /already have been accepted/);
  status = 200;
  assert.equal((await resumed.verifyOperation(pending))?.status, 'confirmed');
  assert.equal(resumed.pendingOperation(prep().placement, account), undefined);
  await assert.rejects(resumed.submit(prep()), /already confirmed/);
  assert.deepEqual(events, ['confirmed']);
  assert.equal(methods.includes('eth_sendTransaction'), false);
});

test('unknown batch status and malformed recovery data block retries', async t => {
  const values = browser(t);
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'wallet_getCapabilities') return { atomic: { status: 'supported' } };
    if (method === 'wallet_sendCalls') return { id: '0x1234' };
    if (method === 'wallet_getCallsStatus') return { status: 600, atomic: false, receipts: [] };
    throw Error(method);
  } };
  const client = new MarkeeClient({ wallet: { getProvider: async () => provider } });
  const operation = await client.submit(prep());
  await assert.rejects(client.verifyOperation(operation), /already have been accepted/);
  await assert.rejects(client.submit(prep()), /already have been accepted/);
  values.set(`markee:sdk:v2:wallet-recovery:${apiUrl}`, '{bad');
  assert.throws(() => new MarkeeClient().pendingOperation(prep().placement, account), /already have been accepted/);
});

test('an unreadable legacy v1 payment record blocks new wallet requests', async t => {
  const values = browser(t);
  values.set(`markee:sdk:v1:pending:${apiUrl}`, '{bad');
  const client = new MarkeeClient();
  assert.throws(() => client.pendingOperation(prep().placement, account), /already have been accepted/);
  await assert.rejects(client.submit(prep()), /already have been accepted/);
});

test('a traced on-chain batch revert releases recovery; unsupported batching falls back once', async t => {
  browser(t);
  let batchStatus = 500;
  let unsupported = false;
  let directSends = 0;
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'wallet_getCapabilities') return { atomic: { status: 'supported' } };
    if (method === 'wallet_sendCalls') { if (unsupported) throw { code: -32601 }; return { id: '0x1234' }; }
    if (method === 'wallet_getCallsStatus') return { id: '0x1234', chainId: '0x2105', status: batchStatus, atomic: true,
      receipts: [{ transactionHash: hash, status: batchStatus === 500 ? '0x0' : '0x1' }] };
    if (method === 'eth_sendTransaction') { directSends++; return hash; }
    throw Error(method);
  } };
  const client = new MarkeeClient({ wallet: { getProvider: async () => provider }, fetch: async () => Response.json({ status: 'reverted', hash, explorerUrl: 'https://basescan.org/tx/' + hash }) });
  const batch = await client.submit(prep());
  assert.equal((await client.verifyOperation(batch))?.status, 'reverted');
  assert.equal(client.pendingOperation(prep().placement, account), undefined);
  unsupported = true; batchStatus = 100;
  const direct = await client.submit(prep());
  assert.ok('hash' in direct);
  assert.equal(directSends, 1);
});

test('atomic-ready or absent wallet capabilities keep the direct transaction path', async t => {
  browser(t);
  let capability: unknown = { atomic: { status: 'ready' } };
  let batches = 0, direct = 0;
  const provider: EIP1193Provider = { async request({ method }) {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'wallet_getCapabilities') return capability;
    if (method === 'wallet_sendCalls') { batches++; return { id: '0x1234' }; }
    if (method === 'eth_sendTransaction') { direct++; return hash; }
    throw Error(method);
  } };
  const client = new MarkeeClient({ wallet: { getProvider: async () => provider }, fetch: async () => Response.json({ status: 'reverted', hash, explorerUrl: 'https://basescan.org/tx/' + hash }) });
  const first = await client.submit(prep());
  assert.ok('hash' in first);
  await client.verifyOperation(first);
  capability = {};
  const second = await client.submit(prep());
  assert.ok('hash' in second);
  assert.equal(batches, 0);
  assert.equal(direct, 2);
});
