import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicClient, createWalletClient, http, parseEther, keccak256, toHex, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { prepare, verifyTransaction } from '../lib/sdk/transactions';
import { boardContext, walletState } from '../lib/sdk/snapshot';
import type { Action, Placement } from '../../packages/sdk/src/types';

// Opt-in integration suite. Refuse all non-loopback RPC URLs; this uses Anvil's
// public development key and must NEVER run against a live chain.
const url = process.env.MARKEE_SDK_FORK_RPC;
test('Base fork: sale and rental lifecycle uses the real deployed contracts', { skip: !url, timeout: 240_000 }, async () => {
  assert.match(url!, /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
  process.env.MARKEE_RPC_8453 = url!;
  const account = privateKeyToAccount(keccak256(toHex('Markee SDK fork-only integration tests v1')));
  const publicClient = createPublicClient({ chain: base, transport: http(url!) });
  const wallet = createWalletClient({ account, chain: base, transport: http(url!) });
  const rpc = async (method: string, params: unknown[] = []) => {
    const res = await fetch(url!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const body = await res.json(); assert.equal(body.error, undefined); return body.result;
  };
  assert.match(await rpc('web3_clientVersion'), /anvil/i);
  assert.ok(!await publicClient.getCode({ address: account.address }), 'Use an EOA without inherited fork code');
  await rpc('anvil_setBalance', [account.address, toHex(parseEther('100'))]);
  const sale: Placement = { kind: 'board', chainId: 8453, address: '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' };
  const rent: Placement = { kind: 'board', chainId: 8453, address: '0x82cbe3BdFC4e01940D186Ac5EA151355647DE0d3' };
  async function execute(placement: Placement, action: Action) {
    const prepared = await prepare(placement, account.address, action);
    const hash = await wallet.sendTransaction({ to: prepared.transaction.to, data: prepared.transaction.data, value: BigInt(prepared.transaction.value), gas: BigInt(prepared.transaction.gas) });
    await publicClient.waitForTransactionReceipt({ hash }); await rpc('evm_mine');
    const result = await verifyTransaction(prepared.id, hash);
    assert.equal(result.status, 'confirmed', `${action.kind} should confirm`);
    console.log(`${action.kind}: confirmed${result.tokensReceived ? `, MARKEE=${result.tokensReceived}` : ''}`);
    return { result, prepared, hash };
  }
  const saleContext = await boardContext(8453, sale.address);
  const first = await execute(sale, { kind: 'create', message: 'SDK fork lifecycle', name: 'SDK tests', amount: (saleContext.minimum || parseEther('0.001')).toString() });
  assert.ok(first.result.createdMarkee);
  if (saleContext.revnetEnabled) assert.ok(BigInt(first.result.tokensReceived!) > 0n);
  await execute(sale, { kind: 'edit-message', markee: first.result.createdMarkee!, message: 'Edited on a local fork' });
  await execute(sale, { kind: 'edit-name', markee: first.result.createdMarkee!, name: 'SDK owner' });
  await execute(sale, { kind: 'fund', markee: first.result.createdMarkee!, amount: parseEther('0.0001').toString() });
  await assert.rejects(verifyTransaction(first.prepared.id, (await execute(sale, { kind: 'fund', markee: first.result.createdMarkee!, amount: parseEther('0.0002').toString() })).hash), /does not match/);
  const message = (await execute(rent, { kind: 'create', message: 'SDK rent fork', name: 'Backed by SDK' })).result.createdMarkee!;
  const c = await boardContext(8453, rent.address);
  const monthly = c.minimum > parseEther('0.01') ? c.minimum : parseEther('0.01');
  await execute(rent, { kind: 'stream', markee: message, monthlyAmount: monthly.toString() });
  let state = await walletState(await boardContext(8453, rent.address), account.address);
  assert.equal(state.backedMarkee?.toLowerCase(), message.toLowerCase()); assert.equal(state.poolConnected, true);
  await execute(rent, { kind: 'stream', markee: message, monthlyAmount: (monthly * 2n).toString() });
  const other = (await execute(rent, { kind: 'create', message: 'Switched SDK message', name: 'SDK' })).result.createdMarkee!;
  await execute(rent, { kind: 'stream', markee: other, monthlyAmount: (monthly * 3n).toString() });
  state = await walletState(await boardContext(8453, rent.address), account.address);
  assert.equal(state.backedMarkee?.toLowerCase(), other.toLowerCase()); assert.equal(state.poolConnected, true);
  await rpc('evm_increaseTime', [86400]); await rpc('evm_mine');
  await execute(rent, { kind: 'wrap', amount: parseEther('0.01').toString() });
  await execute(rent, { kind: 'unwrap', amount: parseEther('0.001').toString() });
  await execute(rent, { kind: 'claim-refund', markee: message });
  await execute(rent, { kind: 'stop' });
  await execute(rent, { kind: 'withdraw-buffer' });
  state = await walletState(await boardContext(8453, rent.address), account.address);
  assert.equal(state.flowRate, '0'); assert.equal(state.deposit, '0');
  if (BigInt(state.pendingSettlement) > 0n) {
    const settled = await execute(rent, { kind: 'settle' });
    assert.ok(['paid', 'deferred'].includes(settled.result.settlement!));
  }
});
