import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutDeps, checkoutRequest, createCheckout, checkoutOrigin, hostedCheckoutOrigin, type CheckoutRecord } from '../lib/sdk/checkout';
import { conversionDeps, conversionTransaction, type ConversionStep } from '../lib/sdk/conversion';
import type { PreparedAction, TransactionResult } from '../../packages/sdk/src/types';
const board = '0x1111111111111111111111111111111111111111' as const;
const account = '0x2222222222222222222222222222222222222222' as const;
const other = '0x3333333333333333333333333333333333333333' as const;
const hash = `0x${'ab'.repeat(32)}` as const;
const placement = { kind: 'board', chainId: 8453, address: board } as const;
const action = { kind: 'create', amount: '1000', message: 'A real message', name: 'Test' } as const;
const records = new Map<string, CheckoutRecord>();
const receipts = new Map<string, string>();
const preparation: PreparedAction = { id: 'signed', expiresAt: Date.now() + 300000, placement, action, transaction: { from: account, to: board, chainId: 8453, data: '0x1234', value: '0x3e8', gas: '0x10000' }, review: { title: 'Pay', lines: [], estimatedGasCost: '1', reward: 'MARKEE' } };
let result: TransactionResult = { status: 'pending', hash, explorerUrl: `https://basescan.org/tx/${hash}` };
let transaction = { nonce: 7, from: account, to: board, input: '0x1234', value: 1000n };
checkoutDeps.get = async id => structuredClone(records.get(id) || null);
checkoutDeps.create = async s => { records.set(s.id, structuredClone(s)); };
checkoutDeps.cas = async (s, next) => { if (records.get(s.id)?.revision !== s.revision) return false; records.set(s.id, structuredClone(next)); return true; };
checkoutDeps.reserveReceipt = async (h, id) => { if (receipts.has(h)) return receipts.get(h) === id; receipts.set(h, id); return true; };
checkoutDeps.board = async () => ({ strategy: 'sale', name: 'Board', minimum: 1n, maxMessageBytes: 200, maxNameBytes: 40, revnetEnabled: true, token: board }) as unknown as Awaited<ReturnType<typeof checkoutDeps.board>>;
checkoutDeps.prepare = async () => preparation;
checkoutDeps.balance = async () => 10000000000000000n;
checkoutDeps.nonce = async () => 7;
checkoutDeps.transaction = async () => transaction as unknown as Awaited<ReturnType<typeof checkoutDeps.transaction>>;
checkoutDeps.verify = async () => result;
const create = () => createCheckout({ placement, action }, 'https://sample.example');
const errorCode = (code: string) => (e: unknown) => !!e && typeof e === 'object' && 'code' in e && e.code === code;

test('checkout validates origin, rejects rent and only accepts payable actions', async () => {
  assert.equal(checkoutOrigin('http://localhost:5178'), 'http://localhost:5178');
  for (const origin of ['javascript:alert(1)', 'https://sample.example/path', 'http://example.com', 'https://user:pass@example.com']) assert.throws(() => checkoutOrigin(origin));
  await assert.rejects(createCheckout({ placement, action: { kind: 'stop' } }, 'https://sample.example'), errorCode('UNSUPPORTED_CHECKOUT'));
  const boardFn = checkoutDeps.board;
  checkoutDeps.board = async () => ({ ...await boardFn(8453, board), strategy: 'rent' });
  await assert.rejects(create(), errorCode('UNSUPPORTED_CHECKOUT'));
  checkoutDeps.board = boardFn;
});
test('read token cannot authorize payment; funding does not count as payment; wallet stays bound', async () => {
  const s = await create();
  const req = { id: s.id, token: s.writeToken };
  await assert.rejects(checkoutRequest('prepare', { ...req, token: s.readToken, account }), errorCode('CHECKOUT_NOT_FOUND'));
  await checkoutRequest('balance', { ...req, account });
  assert.equal(records.get(s.id)?.status, 'created');
  assert.equal(records.get(s.id)?.result, undefined);
  await assert.rejects(checkoutRequest('balance', { ...req, account: other }), errorCode('WALLET_CHANGED'));
  await assert.rejects(checkoutRequest('verify', { ...req, hash }), errorCode('INVALID_CHECKOUT_STATE'));
});
test('one arm wins; unknown submission cannot prepare again; only verified receipt confirms rewards', async () => {
  const s = await create(); const req = { id: s.id, token: s.writeToken };
  await checkoutRequest('prepare', { ...req, account });
  const arms = await Promise.allSettled([checkoutRequest('arm', { ...req, preparationId: preparation.id }), checkoutRequest('arm', { ...req, preparationId: preparation.id })]);
  assert.equal(arms.filter(r => r.status === 'fulfilled').length, 1);
  await assert.rejects(checkoutRequest('prepare', { ...req, account }), errorCode('PAYMENT_IN_PROGRESS'));
  transaction = { ...transaction, nonce: 8 };
  await assert.rejects(checkoutRequest('verify', { ...req, hash }), errorCode('TRANSACTION_MISMATCH'));
  transaction = { ...transaction, nonce: 7, value: 999n };
  await assert.rejects(checkoutRequest('verify', { ...req, hash }), errorCode('TRANSACTION_MISMATCH'));
  transaction = { ...transaction, value: 1000n };
  await checkoutRequest('verify', { ...req, hash });
  assert.equal(records.get(s.id)?.status, 'submitted');
  await assert.rejects(checkoutRequest('rejected', req), errorCode('INVALID_CHECKOUT_STATE'));
  // Expiration must not discard a payment already in flight.
  records.get(s.id)!.expiresAt = Date.now() - 1;
  result = { ...result, status: 'confirmed', tokensReceived: '123' };
  await checkoutRequest('status', { id: s.id, token: s.readToken });
  const state = await checkoutRequest('status', { id: s.id, token: s.readToken }) as { status: string; result: TransactionResult };
  assert.equal(state.status, 'confirmed'); assert.equal(state.result.tokensReceived, '123');
  const second = await create(); const secondReq = { id: second.id, token: second.writeToken };
  await checkoutRequest('prepare', { ...secondReq, account });
  await checkoutRequest('arm', { ...secondReq, preparationId: preparation.id });
  await assert.rejects(checkoutRequest('verify', { ...secondReq, hash }), errorCode('TRANSACTION_REUSED'));
});
test('explicit rejection allows a fresh preparation; expired checkout cannot fund', async () => {
  const s = await create(); const req = { id: s.id, token: s.writeToken };
  await checkoutRequest('prepare', { ...req, account });
  await checkoutRequest('arm', { ...req, preparationId: preparation.id });
  await checkoutRequest('rejected', req);
  assert.equal(records.get(s.id)?.status, 'created');
  await checkoutRequest('prepare', { ...req, account });
  records.get(s.id)!.expiresAt = Date.now() - 1;
  await assert.rejects(checkoutRequest('balance', { ...req, account }), errorCode('CHECKOUT_EXPIRED'));
});

test('funding intent persists across reloads; retries require acknowledgement and cannot pay', async () => {
  const s = await create(); const req = { id: s.id, token: s.writeToken };
  await checkoutRequest('balance', { ...req, account });
  await checkoutRequest('funding-start', { ...req, provider: 'stripe' });
  assert.equal(records.get(s.id)?.funding, 'stripe');
  assert.equal(records.get(s.id)?.status, 'created');
  await assert.rejects(checkoutRequest('funding-start', { ...req, provider: 'moonpay' }), errorCode('FUNDING_PENDING'));
  await assert.rejects(checkoutRequest('funding-reset', req), errorCode('FUNDING_PENDING'));
  await checkoutRequest('funding-reset', { ...req, confirmNoPendingPurchase: true });
  await checkoutRequest('funding-start', { ...req, provider: 'moonpay' });
  assert.equal(records.get(s.id)?.funding, 'moonpay');
});

test('conversion arming is atomic, blocks funding/payment, and reuses an approved quote', async () => {
  const previous = { ...conversionDeps }; const previousQuote = checkoutDeps.conversionQuote;
  const previousStep = checkoutDeps.conversionStep; const previousBalance = checkoutDeps.balance;
  try {
    checkoutDeps.balance = async () => 0n;
    conversionDeps.block = async () => 100n;
    conversionDeps.ethBalance = async () => 0n;
    const q = { eth: '100000000001000', usdcMaximum: '3000000', usdcBalance: '10000000', fee: 500, expiresAt: Date.now() + 180000 };
    checkoutDeps.conversionQuote = async () => q;
    checkoutDeps.conversionStep = async (address, quote, id) => ({ id, kind: 'approval', status: 'ready', quote, transaction: conversionTransaction(address, quote, true) });
    const s = await create(); const req = { id: s.id, token: s.writeToken };
    await checkoutRequest('balance', { ...req, account });
    const step = await checkoutRequest('conversion-prepare', req) as ConversionStep;
    const arms = await Promise.allSettled([checkoutRequest('conversion-arm', { ...req, stepId: step.id }), checkoutRequest('conversion-arm', { ...req, stepId: step.id })]);
    assert.equal(arms.filter(r => r.status === 'fulfilled').length, 1);
    for (const operation of ['prepare', 'funding-start', 'conversion-prepare']) await assert.rejects(checkoutRequest(operation, { ...req, account, provider: 'stripe' }), errorCode('CONVERSION_PENDING'));
    assert.equal(records.get(s.id)?.status, 'created');
    const pendingHash = `0x${'ee'.repeat(32)}`;
    conversionDeps.receipt = async () => { const e = new Error('pending'); e.name = 'TransactionReceiptNotFoundError'; throw e; };
    await checkoutRequest('conversion-verify', { ...req, hash: pendingHash });
    assert.equal(receipts.has(pendingHash), false, 'unverified hashes cannot reserve other payments');
    assert.equal(records.get(s.id)?.conversion?.status, 'submitted');
    records.get(s.id)!.conversion!.status = 'confirmed';
    checkoutDeps.conversionQuote = async () => { throw new Error('Should reuse approved quote'); };
    assert.deepEqual(await checkoutRequest('conversion-quote', req), q);
    await checkoutRequest('conversion-prepare', req);
    await checkoutRequest('conversion-arm', { ...req, stepId: records.get(s.id)!.conversion!.id });
    await checkoutRequest('conversion-rejected', req);
    assert.equal(records.get(s.id)?.conversion, undefined);
  } finally {
    Object.assign(conversionDeps, previous); checkoutDeps.conversionQuote = previousQuote;
    checkoutDeps.conversionStep = previousStep; checkoutDeps.balance = previousBalance;
  }
});

test('checkout origin is server-selected and validated before creating a session', async () => {
  const old = process.env.MARKEE_CHECKOUT_ORIGIN;
  try {
    process.env.MARKEE_CHECKOUT_ORIGIN = 'https://www.markee.xyz';
    assert.equal((await create()).checkoutOrigin, 'https://www.markee.xyz');
    for (const invalid of ['http://www.markee.xyz', 'https://www.markee.xyz/path', 'https://user:password@www.markee.xyz']) {
      process.env.MARKEE_CHECKOUT_ORIGIN = invalid;
      assert.throws(hostedCheckoutOrigin);
    }
  } finally { if (old === undefined) delete process.env.MARKEE_CHECKOUT_ORIGIN; else process.env.MARKEE_CHECKOUT_ORIGIN = old; }
});
