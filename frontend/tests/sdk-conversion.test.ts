import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, type Address, type Hex } from 'viem';
import { conversionDeps, conversionQuote, conversionStep, conversionTransaction, verifyConversionReceipt, routerABI, USDC, ROUTER, WETH, type ConversionStep } from '../lib/sdk/conversion';
const account = '0x2222222222222222222222222222222222222222';
const other = '0x3333333333333333333333333333333333333333';
const hash = `0x${'cd'.repeat(32)}` as Hex;
const quote = { eth: '1000000000000000', usdcMaximum: '3030000', usdcBalance: '10000000', fee: 500, expiresAt: Date.now() + 180000 };
const original = { ...conversionDeps };
test.afterEach(() => Object.assign(conversionDeps, original));

test('best available route has a rounded-up 1% spend cap; unavailable routes fail closed', async () => {
  conversionDeps.balance = async () => 10000000n;
  conversionDeps.quote = async (_, fee) => fee === 500 ? 3000001n : 3100000n;
  const q = await conversionQuote(account, 1000n);
  assert.equal(q.fee, 500); assert.equal(q.usdcMaximum, '3030002');
  conversionDeps.quote = async () => { throw new Error('RPC unavailable'); };
  await assert.rejects(conversionQuote(account, 1000n), /No USDC to ETH quote/);
  await assert.rejects(conversionQuote(account, 0n), /already covers/);
});
test('approval is capped and swap atomically unwraps exact output into the payer wallet', () => {
  const approval = conversionTransaction(account, quote, true);
  const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data });
  assert.equal(approval.to, USDC); assert.equal(decoded.functionName, 'approve');
  assert.deepEqual(decoded.args, [ROUTER, 3030000n]);
  const transaction = conversionTransaction(account, quote, false);
  assert.equal(transaction.to, ROUTER); assert.equal(transaction.value, '0x0');
  const batch = decodeFunctionData({ abi: routerABI, data: transaction.data });
  assert.equal(batch.functionName, 'multicall');
  if (batch.functionName !== 'multicall') throw new Error('wrong function');
  assert.equal(batch.args[0], BigInt(Math.floor(quote.expiresAt / 1000)));
  const swap = decodeFunctionData({ abi: routerABI, data: batch.args[1][0] });
  assert.equal(swap.functionName, 'exactOutputSingle');
  if (swap.functionName !== 'exactOutputSingle') throw new Error('wrong swap');
  assert.deepEqual(swap.args[0], { tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: ROUTER, amountOut: BigInt(quote.eth), amountInMaximum: 3030000n, sqrtPriceLimitX96: 0n });
  const unwrap = decodeFunctionData({ abi: routerABI, data: batch.args[1][1] });
  assert.equal(unwrap.functionName, 'unwrapWETH9'); assert.deepEqual(unwrap.args, [BigInt(quote.eth), account]);
});
test('expired quotes, insufficient USDC and simulation failures cannot produce a signable step', async () => {
  conversionDeps.balance = async () => 10000000n;
  conversionDeps.allowance = async () => 0n;
  conversionDeps.simulate = async () => ({ data: '0x' });
  await assert.rejects(conversionStep(account, { ...quote, expiresAt: 0 }, 'id'), /Refresh/);
  conversionDeps.balance = async () => 1n;
  await assert.rejects(conversionStep(account, quote, 'id'), /missing amount/);
  conversionDeps.balance = async () => 10000000n;
  assert.equal((await conversionStep(account, quote, 'id')).kind, 'approval');
  conversionDeps.allowance = async () => 4000000n;
  assert.equal((await conversionStep(account, quote, 'id')).kind, 'swap');
  conversionDeps.simulate = async () => { throw new Error('execution reverted'); };
  await assert.rejects(conversionStep(account, quote, 'id'), /execution reverted/);
});
const event = (kind: 'Approval' | 'Transfer', amount: bigint, from: Address = account, address: Address = USDC) => ({
  address, topics: kind === 'Approval' ? encodeEventTopics({ abi: erc20Abi, eventName: 'Approval', args: { owner: from, spender: ROUTER } }) : encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to: other } }),
  data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
});
function mockReceipt(logs: ReturnType<typeof event>[], blockNumber = 101n) {
  conversionDeps.receipt = async () => ({ status: 'success', blockNumber, logs }) as unknown as Awaited<ReturnType<typeof original.receipt>>;
  conversionDeps.block = async () => 102n;
}
function step(kind: 'approval' | 'swap'): ConversionStep {
  return { id: 'id', kind, status: 'signing', quote, armedBlock: '100', ethBalanceBefore: '0', transaction: conversionTransaction(account, quote, kind === 'approval') };
}
test('sponsored approval verifies canonical token, owner, spender, amount and block ordering', async () => {
  const s = step('approval');
  mockReceipt([event('Approval', 3030000n)]);
  assert.equal(await verifyConversionReceipt(s, hash), 'confirmed');
  for (const log of [event('Approval', 3030001n), event('Approval', 3030000n, other), { ...event('Approval', 3030000n), address: other as Address }]) {
    mockReceipt([log]); await assert.rejects(verifyConversionReceipt(s, hash), /expected conversion effects/);
  }
  mockReceipt([event('Approval', 3030000n)], 99n);
  await assert.rejects(verifyConversionReceipt(s, hash), /predates/);
});
test('sponsored swap needs bounded canonical USDC outflow and ETH increase in the same wallet', async () => {
  const s = step('swap');
  mockReceipt([event('Transfer', 3000000n)]);
  conversionDeps.ethBalance = async (address, block) => { assert.equal(address, account); assert.equal(block, 101n); return BigInt(quote.eth); };
  assert.equal(await verifyConversionReceipt(s, hash), 'confirmed');
  conversionDeps.ethBalance = async () => 0n;
  await assert.rejects(verifyConversionReceipt(s, hash), /expected conversion effects/);
  conversionDeps.ethBalance = async () => BigInt(quote.eth);
  mockReceipt([event('Transfer', 3030001n)]);
  await assert.rejects(verifyConversionReceipt(s, hash), /expected conversion effects/);
  mockReceipt([event('Transfer', 3000000n, other)]);
  await assert.rejects(verifyConversionReceipt(s, hash), /expected conversion effects/);
  mockReceipt([event('Transfer', 3000000n)]);
  conversionDeps.block = async () => 101n;
  assert.equal(await verifyConversionReceipt(s, hash), 'submitted');
});
