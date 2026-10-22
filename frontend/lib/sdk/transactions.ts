import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decodeEventLog, encodeAbiParameters, encodeFunctionData, formatEther, toHex, zeroAddress, type Address, type Hex } from 'viem';
import type { Action, Placement, PreparedAction, TransactionResult } from '../../../packages/sdk/src/types';
import { boardABI, gdaABI, messageABI, poolABI, tokenABI } from './abi';
import { getEnvPublicClient, resolveClientChain } from './chains';
import { boardContext, read, resolvePlacement, streamContext } from './snapshot';
import { assertTextLength, SDKError, wei } from './validation';
import { invalidateVerifiedDisplay } from './cached-display';
import { buildMarkeeOpenStreamOperations, CFA_V1_FORWARDER_ADDRESS, cfaV1ForwarderABI, getMarkeeAutoFunding, getMarkeeStreamAmounts, getMarkeeWithdrawableDeposit, superfluidHostABI } from './gardens/streaming';

const devSecret = randomBytes(32).toString('hex');
function secret() {
  const configured = process.env.MARKEE_SDK_SIGNING_SECRET;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) throw new SDKError('NOT_CONFIGURED', 'Transaction verification is not configured.', 503);
  return configured || devSecret;
}
type Envelope = Omit<PreparedAction, 'id' | 'review'> & { token: Address | null; board: Address; issuedAt: number };
export function signEnvelope(value: Envelope): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
export function verifyEnvelope(id: string): Envelope {
  if (id.length > 32_000) throw new SDKError('INVALID_PREPARATION', 'Invalid transaction preparation.');
  const [payload, signature, extra] = id.split('.');
  const expected = createHmac('sha256', secret()).update(payload || '').digest();
  const supplied = Buffer.from(signature || '', 'base64url');
  if (extra || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new SDKError('INVALID_PREPARATION', 'Transaction preparation was changed.');
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Envelope;
  if (Date.now() - value.issuedAt > 7 * 86400_000) throw new SDKError('PREPARATION_EXPIRED', 'This verification record expired. Check the transaction in the explorer.', 410);
  return value;
}

export async function prepare(p: Placement, account: Address, action: Action): Promise<PreparedAction> {
  const resolved = await resolvePlacement(p);
  if (!resolved.board) throw new SDKError('INACTIVE_COMMUNITY', 'Activate the community Markee first.', 409);
  const c = await boardContext(resolved.chainId, resolved.board, p.kind === 'gardens-community');
  let to = c.board;
  let data: Hex;
  let value = 0n;
  const lines: string[] = [];
  let title: string = action.kind;
  let reward = 'This action does not issue MARKEE.';
  if ('markee' in action) {
    if (!await c.r<boolean>('isMarkeeOnLeaderboard', [action.markee])) throw new SDKError('UNKNOWN_MARKEE', 'This message does not belong to the board.');
    const strategy = await read<Address>(c.client, action.markee, messageABI, 'pricingStrategy');
    if (strategy.toLowerCase() !== c.board.toLowerCase()) throw new SDKError('MIGRATED_MARKEE', 'This message has moved to another strategy.', 409);
  }
  const saleReward = c.revnetEnabled ? 'MARKEE from this payment is delivered by the contract to your connected wallet. The receipt reports the actual amount.' : 'RevNet is disabled on this board; this payment does not issue MARKEE.';
  if (action.kind === 'create') {
    assertTextLength(action.message, c.maxMessageBytes); assertTextLength(action.name, c.maxNameBytes);
    value = c.strategy === 'sale' ? wei(action.amount ?? '0', true) : 0n;
    if (c.strategy === 'sale' && value < c.minimum) throw new SDKError('BELOW_MINIMUM', `Minimum payment is ${formatEther(c.minimum)} ETH.`);
    data = encodeFunctionData({ abi: boardABI, functionName: 'createMarkee', args: [action.message, action.name] });
    title = c.strategy === 'sale' ? 'Create and fund your Markee' : 'Create your rental message';
    lines.push(`Message: ${action.message}`, `Name: ${action.name}`, 'Your connected wallet owns the new message.');
    reward = c.strategy === 'sale' ? saleReward : 'Creation does not start a stream or issue MARKEE. Select a monthly rate after confirmation.';
  } else if (action.kind === 'fund') {
    if (c.strategy !== 'sale') throw new SDKError('WRONG_STRATEGY', 'Use a stream to back a rental message.');
    value = wei(action.amount);
    data = encodeFunctionData({ abi: boardABI, functionName: 'addFunds', args: [action.markee] });
    title = 'Fund this Markee'; lines.push('Funding keeps the current message owner.'); reward = saleReward;
  } else if (action.kind === 'edit-message' || action.kind === 'edit-name') {
    const owner = await read<Address>(c.client, action.markee, messageABI, 'owner');
    if (owner.toLowerCase() !== account.toLowerCase()) throw new SDKError('NOT_OWNER', 'Only this message’s owner can edit it.', 403);
    const text = action.kind === 'edit-message' ? action.message : action.name;
    assertTextLength(text, action.kind === 'edit-message' ? c.maxMessageBytes : c.maxNameBytes);
    data = encodeFunctionData({ abi: boardABI, functionName: action.kind === 'edit-message' ? 'updateMessage' : 'updateName', args: [action.markee, text] });
    title = action.kind === 'edit-message' ? 'Update your message' : 'Update your name'; lines.push(text);
  } else {
    if (c.strategy !== 'rent') throw new SDKError('WRONG_STRATEGY', 'This action requires a rental board.');
    const s = await streamContext(c, account);
    if (action.kind === 'stream') {
      const monthly = wei(action.monthlyAmount);
      if (monthly < c.minimum) throw new SDKError('BELOW_MINIMUM', `Minimum monthly rate is ${formatEther(c.minimum)} ETH.`);
      const { ratePerSecond } = getMarkeeStreamAmounts(monthly, 0n, c.minimum);
      if (ratePerSecond >= 2n ** 95n) throw new SDKError('INVALID_RATE', 'Stream rate is out of range.');
      const nativeBalance = await c.client.getBalance({ address: account });
      const funding = getMarkeeAutoFunding({ ethxAvailableBalance: s.available, existingDeposit: s.deposit, nativeBalance, ratePerSecond });
      if (funding.insufficientEth) throw new SDKError('INSUFFICIENT_FUNDS', 'Not enough ETH/ETHx to fund both stream buffers and gas.');
      const [pool, allowance] = await Promise.all([c.r<Address>('poolOf', [action.markee]), read<bigint>(c.client, s.ethx, tokenABI, 'allowance', [account, c.board])]);
      const ops = buildMarkeeOpenStreamOperations({ backer: account, board: c.board, markee: action.markee,
        ethx: s.ethx, cfaAgreement: s.cfa, gdaAgreement: s.gda, pool, ratePerSecond,
        buffer: funding.depositTopUp, wrapValue: funding.wrapValue, existingMarkee: s.backed,
        existingRatePerSecond: s.rate, approvalAmount: allowance < funding.depositTopUp ? funding.depositTopUp : 0n });
      to = s.host; value = funding.wrapValue;
      data = encodeFunctionData({ abi: superfluidHostABI, functionName: 'batchCall', args: [ops] });
      title = s.rate > 0n ? 'Update your rental stream' : 'Start your rental stream';
      lines.push(`${formatEther(ratePerSecond * 2628000n)} ETH per month`, `Wrap ${formatEther(value)} ETH into ETHx.`, `Add ${formatEther(funding.depositTopUp)} ETHx to the refundable board buffer.`, 'The refund pool is connected in the same transaction.', 'Streams continue until stopped or liquidated; adding funds is not a fixed rental duration.');
      reward = c.revnetEnabled ? 'MARKEE is earned from rent actually spent while your message holds the spot. Claim it through settlement; wrapping ETH does not issue rewards.' : 'RevNet is disabled; settlement pays native ETH instead of MARKEE.';
    } else if (action.kind === 'stop') {
      if (s.rate <= 0n) throw new SDKError('NO_STREAM', 'There is no active stream to stop.');
      to = CFA_V1_FORWARDER_ADDRESS;
      data = encodeFunctionData({ abi: cfaV1ForwarderABI, functionName: 'setFlowrate', args: [s.ethx, c.board, 0n] });
      title = 'Stop your rental stream'; lines.push('Your remaining ETHx stays in your wallet. Withdraw the board buffer separately.');
    } else if (action.kind === 'wrap') {
      to = s.ethx; value = wei(action.amount);
      data = encodeFunctionData({ abi: tokenABI, functionName: 'upgradeByETHTo', args: [account] });
      title = 'Add ETHx to your wallet'; lines.push('ETHx can fund all of your active ETHx streams.');
    } else if (action.kind === 'unwrap') {
      const amount = wei(action.amount);
      if (amount > s.available) throw new SDKError('INSUFFICIENT_ETHX', 'Amount exceeds your available ETHx.');
      to = s.ethx; data = encodeFunctionData({ abi: tokenABI, functionName: 'downgradeToETH', args: [amount] });
      title = 'Withdraw ETHx as ETH'; lines.push(`Receive ${formatEther(amount)} ETH.`, 'Withdrawing reduces the runway of every active ETHx stream.');
    } else if (action.kind === 'withdraw-buffer') {
      const amount = getMarkeeWithdrawableDeposit(s.deposit, s.rate);
      if (amount <= 0n) throw new SDKError('NO_WITHDRAWABLE_BUFFER', 'No excess board buffer is available.');
      data = encodeFunctionData({ abi: boardABI, functionName: 'withdrawDeposit' });
      title = 'Recover your board buffer'; lines.push(`Return approximately ${formatEther(amount)} ETHx to your wallet.`);
    } else if (action.kind === 'settle') {
      if (s.pendingSettlement <= 0n) throw new SDKError('NOTHING_TO_SETTLE', 'No rent is ready to settle yet.');
      data = encodeFunctionData({ abi: boardABI, functionName: 'settle', args: [[account]] });
      title = c.revnetEnabled ? 'Claim your MARKEE rewards' : 'Settle your rent';
      lines.push(`${formatEther(s.pendingSettlement)} ETH of accrued rent before fees.`);
      reward = c.revnetEnabled ? 'The contract delivers MARKEE to your wallet. If the RevNet payment is deferred, your claim stays available.' : 'RevNet is disabled; the contract pays native ETH to your wallet.';
    } else if (action.kind === 'claim-refund' || action.kind === 'connect-refund') {
      const pool = await c.r<Address>('poolOf', [action.markee]);
      if (pool === zeroAddress) throw new SDKError('NO_POOL', 'No refund pool exists for this message.');
      if (action.kind === 'claim-refund') {
        to = pool; data = encodeFunctionData({ abi: poolABI, functionName: 'claimAll', args: [account] }); title = 'Collect your accrued pool refund';
      } else {
        to = s.host;
        const call = encodeFunctionData({ abi: gdaABI, functionName: 'connectPool', args: [pool, '0x'] });
        data = encodeFunctionData({ abi: superfluidHostABI, functionName: 'batchCall', args: [[{ operationType: 201, target: s.gda, data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [call, '0x']) }]] });
        title = 'Connect your refund pool';
      }
    } else if (action.kind === 'claim-top') {
      data = encodeFunctionData({ abi: boardABI, functionName: 'claimTop', args: [action.markee] }); title = 'Refresh the leading Markee';
    } else throw new SDKError('INVALID_ACTION', 'Unsupported action.');
  }
  // eth_estimateGas executes the exact call from the user, catching ownership, minimum,
  // buffer and leaderboard races before the wallet prompts. No backend key signs it.
  const [estimated, gasPrice, balance] = await Promise.all([
    c.client.estimateGas({ account, to, data, value }), c.client.getGasPrice(), c.client.getBalance({ address: account }),
  ]);
  const gas = (estimated * 125n + 99n) / 100n;
  const cost = gas * gasPrice;
  if (balance < value + cost) throw new SDKError('INSUFFICIENT_GAS', 'Keep enough native ETH for this transaction and network fees.');
  const transaction = { from: account, to, data, chainId: c.chainId, value: toHex(value), gas: toHex(gas) };
  const expiresAt = Date.now() + 5 * 60_000;
  const id = signEnvelope({ transaction, placement: p, action, expiresAt, token: c.token, board: c.board, issuedAt: Date.now() });
  lines.push(`Native ETH sent: ${formatEther(value)} ETH`, `Network: ${resolveClientChain(c.chainId).name}`, `Recipient: ${to}`);
  return { id, expiresAt, placement: p, action, transaction, review: { title, lines, estimatedGasCost: cost.toString(), reward } };
}

export async function verifyTransaction(id: string, hash: Hex): Promise<TransactionResult> {
  const prepared = verifyEnvelope(id);
  const tx = prepared.transaction;
  const client = getEnvPublicClient(tx.chainId);
  const explorerUrl = `${resolveClientChain(tx.chainId).blockExplorers!.default.url}/tx/${hash}`;
  const pending: TransactionResult = { status: 'pending', hash, explorerUrl };
  let actual;
  try { actual = await client.getTransaction({ hash }); }
  catch (error) { if ((error as Error).name === 'TransactionNotFoundError') return pending; throw error; }
  if (actual.from.toLowerCase() !== tx.from.toLowerCase() || actual.to?.toLowerCase() !== tx.to.toLowerCase() || actual.input.toLowerCase() !== tx.data.toLowerCase() || actual.value !== BigInt(tx.value)) throw new SDKError('TRANSACTION_MISMATCH', 'This transaction does not match the reviewed action.', 409);
  let receipt;
  try { receipt = await client.getTransactionReceipt({ hash }); }
  catch (error) { if ((error as Error).name === 'TransactionReceiptNotFoundError') return pending; throw error; }
  if ((await client.getBlockNumber({ cacheTime: 0 })) - receipt.blockNumber < 1n) return pending;
  const result: TransactionResult = { status: receipt.status === 'success' ? 'confirmed' : 'reverted', hash, explorerUrl };
  if (result.status === 'reverted') return result;
  let tokens = 0n;
  let settled = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === prepared.board.toLowerCase()) {
      try {
        const event = decodeEventLog({ abi: boardABI, ...log });
        if (event.eventName === 'MarkeeCreated' && event.args.owner.toLowerCase() === tx.from.toLowerCase()) result.createdMarkee = event.args.markeeAddress;
        if (event.eventName === 'Settled' && event.args.backer.toLowerCase() === tx.from.toLowerCase()) settled = true;
      } catch { /* Other board events are irrelevant to this result. */ }
    }
    if (prepared.token && log.address.toLowerCase() === prepared.token.toLowerCase()) {
      try {
        const event = decodeEventLog({ abi: tokenABI, ...log });
        if (event.eventName === 'Transfer' && event.args.to.toLowerCase() === tx.from.toLowerCase()) tokens += event.args.value;
      } catch { /* Ignore non-Transfer token events. */ }
    }
  }
  if (prepared.token) result.tokensReceived = tokens.toString();
  if (prepared.action.kind === 'settle') result.settlement = settled ? 'paid' : 'deferred';
  await invalidateVerifiedDisplay(tx.chainId, hash);
  return result;
}
