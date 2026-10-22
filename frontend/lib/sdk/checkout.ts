import { createHash, randomBytes } from 'node:crypto';
import { kv } from '@vercel/kv';
import { isHash, type Address, type Hex } from 'viem';
import type { Action, Placement, PreparedAction, TransactionResult, CheckoutSession, CheckoutStatus } from '../../../packages/sdk/src/types';
import { address, assertTextLength, parseAction, placement, SDKError, wei } from './validation';
import { boardContext, read } from './snapshot';
import { messageABI } from './abi';
import { prepare, verifyTransaction } from './transactions';
import { getEnvPublicClient } from './chains';

import { conversionQuote, conversionStep, conversionDeps, verifyConversionReceipt, type ConversionStep } from './conversion';

type PaymentAction = Extract<Action, { kind: 'create' | 'fund' }>;
export interface CheckoutRecord {
  id: string; revision: number; createdAt: number; expiresAt: number; origin: string;
  readHash: string; writeHash: string; placement: Placement; action: PaymentAction;
  name: string; status: CheckoutStatus['status']; account?: Address; preparation?: PreparedAction;
  funding?: 'stripe' | 'moonpay'; conversion?: ConversionStep; nonce?: number; result?: TransactionResult; hash?: Hex;
}
const key = (id: string) => `sdk:checkout:v1:${id}`;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const CAS = `local old=redis.call('GET',KEYS[1]); if not old or cjson.decode(old).revision~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',604800); return 1`;
export const checkoutDeps = {
  get: (id: string) => kv.get<CheckoutRecord>(key(id)),
  create: async (s: CheckoutRecord) => { if (!await kv.set(key(s.id), s, { nx: true, ex: 604800 })) throw new SDKError('CHECKOUT_BUSY', 'Please retry checkout creation.', 409); },
  cas: async (s: CheckoutRecord, next: CheckoutRecord) => Number(await kv.eval(CAS, [key(s.id)], [String(s.revision), JSON.stringify(next)])) === 1,
  reserveReceipt: async (hash: Hex, id: string) => {
    const receiptKey = `sdk:checkout:receipt:8453:${hash.toLowerCase()}`;
    if (await kv.set(receiptKey, id, { nx: true, ex: 604800 })) return true;
    return await kv.get(receiptKey) === id;
  },
  board: boardContext, prepare, verify: verifyTransaction, conversionQuote, conversionStep,
  balance: (account: Address) => getEnvPublicClient(8453).getBalance({ address: account }),
  nonce: (account: Address) => getEnvPublicClient(8453).getTransactionCount({ address: account, blockTag: 'pending' }),
  transaction: (hash: Hex) => getEnvPublicClient(8453).getTransaction({ hash }),
};
export function checkoutEnabled() {
  return process.env.MARKEE_HOSTED_CHECKOUT_ENABLED === 'true' && !!process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
    !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN && (process.env.MARKEE_SDK_SIGNING_SECRET?.length || 0) >= 32;
}
export function checkoutOrigin(input: unknown) {
  if (typeof input !== 'string') throw new SDKError('INVALID_ORIGIN', 'A return origin is required.');
  let u: URL; try { u = new URL(input); } catch { throw new SDKError('INVALID_ORIGIN', 'Invalid return origin.'); }
  if (u.origin !== input || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new SDKError('INVALID_ORIGIN', 'Use an HTTPS app origin.');
  return u.origin;
}
export function checkoutAction(input: unknown): PaymentAction {
  const a = parseAction(input);
  if (a.kind !== 'create' && a.kind !== 'fund') throw new SDKError('UNSUPPORTED_CHECKOUT', 'Hosted checkout supports For Sale creation and funding only.');
  wei(a.amount);
  return a;
}
export async function createCheckout(body: Record<string, unknown>, origin: string) : Promise<CheckoutSession> {
  const p = placement(body.placement), action = checkoutAction(body.action);
  if (p.kind !== 'board' || p.chainId !== 8453) throw new SDKError('UNSUPPORTED_CHECKOUT', 'Hosted checkout supports Base boards.');
  const c = await checkoutDeps.board(8453, p.address);
  if (c.strategy !== 'sale') throw new SDKError('UNSUPPORTED_CHECKOUT', 'Use the streaming flow for For Rent boards.');
  if (action.kind === 'create') {
    assertTextLength(action.message, c.maxMessageBytes); assertTextLength(action.name, c.maxNameBytes);
    if (BigInt(action.amount!) < c.minimum) throw new SDKError('BELOW_MINIMUM', 'Amount is below this board’s minimum.');
  }
  if (action.kind === 'fund') {
    if (!await c.r<boolean>('isMarkeeOnLeaderboard', [action.markee])) throw new SDKError('UNKNOWN_MARKEE', 'This message does not belong to the board.');
    const strategy = await read<Address>(c.client, action.markee, messageABI, 'pricingStrategy');
    if (strategy.toLowerCase() !== c.board.toLowerCase()) throw new SDKError('MIGRATED_MARKEE', 'This message has moved to another strategy.', 409);
  }
  if (!c.revnetEnabled || !c.token) throw new SDKError('REWARDS_UNAVAILABLE', 'Card checkout requires a board with MARKEE rewards enabled.');
  const readToken = randomBytes(32).toString('hex'), writeToken = randomBytes(32).toString('hex');
  const s: CheckoutRecord = { id: randomBytes(24).toString('hex'), revision: 0, origin: checkoutOrigin(origin), createdAt: Date.now(), expiresAt: Date.now() + 3600000,
    readHash: digest(readToken), writeHash: digest(writeToken), placement: p, action, name: c.name, status: 'created' };
  await checkoutDeps.create(s);
  return { id: s.id, readToken, writeToken, expiresAt: s.expiresAt };
}
async function load(id: unknown, token: unknown, write = false) {
  if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new SDKError('CHECKOUT_NOT_FOUND', 'Checkout not found.', 404);
  const s = await checkoutDeps.get(id);
  if (!s || digest(token) !== (write ? s.writeHash : s.readHash)) throw new SDKError('CHECKOUT_NOT_FOUND', 'Checkout not found.', 404);
  return s;
}
const status = (s: CheckoutRecord): CheckoutStatus => ({ id: s.id, status: s.status, account: s.account, result: s.result, expiresAt: s.expiresAt });
async function save(s: CheckoutRecord, changes: Partial<CheckoutRecord>) {
  const next = { ...s, ...changes, revision: s.revision + 1 };
  if (!await checkoutDeps.cas(s, next)) throw new SDKError('CHECKOUT_BUSY', 'Checkout changed in another window. Refresh its status.', 409);
  return next;
}
export async function checkoutRequest(operation: string, body: Record<string, unknown>) {
  const s = await load(body.id, body.token, operation !== 'status');
  if (operation === 'status') {
    // A host can finish observing a submitted payment even after the popup closes.
    if (s.status === 'submitted' && s.hash && s.preparation) {
      const result = await checkoutDeps.verify(s.preparation.id, s.hash);
      if (result.status !== 'pending') return status(await save(s, { result, status: result.status }));
    }
    return status(s);
  }
  if (operation === 'read') return { ...status(s), placement: s.placement, action: s.action, name: s.name, origin: s.origin, hash: s.hash, conversion: s.conversion, funding: s.funding };
  if (operation === 'conversion-verify') {
    const step = s.conversion;
    if (!step || !['signing', 'submitted', 'confirmed', 'reverted'].includes(step.status)) throw new SDKError('INVALID_CHECKOUT_STATE', 'No conversion is pending.', 409);
    if (step.status === 'confirmed' || step.status === 'reverted') return step;
    const hash = body.hash || step.hash;
    if (typeof hash !== 'string' || !isHash(hash)) throw new SDKError('INVALID_HASH', 'Provide the conversion transaction hash.');
    const state = await verifyConversionReceipt(step, hash);
    // An unmined hash has no verified effects; never reserve it globally.
    if (state === 'confirmed' && !await checkoutDeps.reserveReceipt(hash, `${s.id}:${step.id}`)) throw new SDKError('TRANSACTION_REUSED', 'This transaction belongs to another operation.', 409);
    const next = { ...step, hash, status: state };
    await save(s, { conversion: next });
    return next;
  }
  if (operation === 'verify' || operation === 'submitted') {
    if (!s.preparation || !s.account || s.nonce === undefined || !['signing', 'submitted', 'confirmed', 'reverted'].includes(s.status)) throw new SDKError('INVALID_CHECKOUT_STATE', 'No payment has been prepared.', 409);
    if (s.status === 'confirmed' || s.status === 'reverted') return status(s);
    const hash = body.hash || s.hash;
    if (typeof hash !== 'string' || !isHash(hash)) throw new SDKError('INVALID_HASH', 'Provide the submitted transaction hash.');
    // Do not bind an arbitrary unmined hash. Check sender, nonce and the signed preparation first.
    let tx; try { tx = await checkoutDeps.transaction(hash); } catch { throw new SDKError('TRANSACTION_PENDING', 'Waiting for the transaction to reach the network.', 409); }
    if (tx.nonce !== s.nonce) throw new SDKError('TRANSACTION_MISMATCH', 'Transaction nonce does not match this checkout.', 409);
    const expected = s.preparation.transaction;
    if (tx.from.toLowerCase() !== expected.from.toLowerCase() || tx.to?.toLowerCase() !== expected.to.toLowerCase() || tx.input.toLowerCase() !== expected.data.toLowerCase() || tx.value !== BigInt(expected.value)) throw new SDKError('TRANSACTION_MISMATCH', 'Transaction does not match this checkout.', 409);
    const result = await checkoutDeps.verify(s.preparation.id, hash);
    if (!await checkoutDeps.reserveReceipt(hash, s.id)) throw new SDKError('TRANSACTION_REUSED', 'This receipt already belongs to another checkout.', 409);
    const next = await save(s, { hash, result, status: result.status === 'pending' ? 'submitted' : result.status });
    return status(next);
  }
  if (Date.now() >= s.expiresAt) throw new SDKError('CHECKOUT_EXPIRED', 'Checkout expired. Funds remain in your wallet; start a new checkout.', 410);
  if (operation.startsWith('conversion-')) {
    if (!s.account || !['created', 'ready'].includes(s.status)) throw new SDKError('INVALID_CHECKOUT_STATE', 'Select a wallet before conversion.', 409);
    const step = s.conversion;
    if (operation === 'conversion-rejected') {
      if (step?.status !== 'signing') throw new SDKError('INVALID_CHECKOUT_STATE', 'Conversion is already submitted.', 409);
      await save(s, { conversion: undefined }); return { status: 'rejected' };
    }
    if (operation === 'conversion-arm') {
      if (step?.status !== 'ready' || body.stepId !== step.id || step.quote.expiresAt <= Date.now()) throw new SDKError('QUOTE_EXPIRED', 'Refresh the conversion review.', 409);
      const armedBlock = await conversionDeps.block();
      const ethBalanceBefore = await conversionDeps.ethBalance(s.account, armedBlock);
      await save(s, { conversion: { ...step, armedBlock: armedBlock.toString(), ethBalanceBefore: ethBalanceBefore.toString(), status: 'signing' } }); return { status: 'armed' };
    }
    if (step && ['signing', 'submitted'].includes(step.status)) throw new SDKError('CONVERSION_PENDING', 'Check the existing conversion before continuing.', 409);
    const target = BigInt(s.action.amount!) + 100000000000000n;
    const shortfall = target - await checkoutDeps.balance(s.account);
    // Keep an approved quote until expiry so tiny price moves do not force repeated approvals.
    const quote = step?.kind === 'approval' && step.status === 'confirmed' && step.quote.expiresAt > Date.now() && BigInt(step.quote.eth) === shortfall
      ? step.quote : await checkoutDeps.conversionQuote(s.account, shortfall);
    if (operation === 'conversion-quote') return quote;
    if (operation === 'conversion-prepare') {
      const next = await checkoutDeps.conversionStep(s.account, quote, randomBytes(16).toString('hex'));
      await save(s, { conversion: next }); return next;
    }
    throw new SDKError('NOT_FOUND', 'Unknown conversion operation.', 404);
  }
  if (s.conversion && ['signing', 'submitted'].includes(s.conversion.status)) throw new SDKError('CONVERSION_PENDING', 'Check the existing conversion before continuing.', 409);
  if (operation === 'funding-start' || operation === 'funding-reset') {
    if (!s.account || !['created', 'ready'].includes(s.status)) throw new SDKError('INVALID_CHECKOUT_STATE', 'Select your wallet before funding.', 409);
    if (operation === 'funding-reset') {
      if (body.confirmNoPendingPurchase !== true) throw new SDKError('FUNDING_PENDING', 'Confirm that no card purchase is pending.');
      await save(s, { funding: undefined }); return { status: 'reset' };
    }
    if (s.funding) throw new SDKError('FUNDING_PENDING', 'Check your existing purchase before starting another.', 409);
    if (body.provider !== 'stripe' && body.provider !== 'moonpay') throw new SDKError('INVALID_PROVIDER', 'Choose Stripe or MoonPay.');
    await save(s, { funding: body.provider }); return { status: 'started' };
  }
  if (operation === 'balance') {
    const account = address(body.account);
    if (s.account && s.account.toLowerCase() !== account.toLowerCase()) throw new SDKError('WALLET_CHANGED', 'Use the wallet already selected for this checkout.', 409);
    if (!['created', 'ready'].includes(s.status)) throw new SDKError('PAYMENT_IN_PROGRESS', 'Check the existing payment before funding again.', 409);
    if (!s.account) await save(s, { account });
    const balance = await checkoutDeps.balance(account);
    // A funding reserve, not a fee quote. Unspent ETH remains in the user's wallet.
    return { balance: balance.toString(), target: (BigInt(s.action.amount!) + 100000000000000n).toString(), amount: s.action.amount };
  }
  if (operation === 'prepare') {
    if (!['created', 'ready'].includes(s.status)) throw new SDKError('PAYMENT_IN_PROGRESS', 'Check the existing payment before retrying.', 409);
    const account = address(body.account);
    if (s.account && s.account.toLowerCase() !== account.toLowerCase()) throw new SDKError('WALLET_CHANGED', 'Use the wallet already selected for this checkout.', 409);
    const currentBoard = await checkoutDeps.board(8453, (s.placement as Extract<Placement, { kind: 'board' }>).address);
    if (currentBoard.strategy !== 'sale' || !currentBoard.revnetEnabled || !currentBoard.token) throw new SDKError('REWARDS_UNAVAILABLE', 'This board no longer supports rewards checkout. Your ETH remains in your wallet.');
    const preparation = await checkoutDeps.prepare(s.placement, account, s.action);
    await save(s, { account, preparation, status: 'ready' });
    return preparation;
  }
  if (operation === 'arm') {
    if (s.status !== 'ready' || !s.preparation || !s.account || s.preparation.id !== body.preparationId || s.preparation.expiresAt <= Date.now()) throw new SDKError('INVALID_CHECKOUT_STATE', 'Refresh the payment review before continuing.', 409);
    const nonce = await checkoutDeps.nonce(s.account);
    await save(s, { status: 'signing', nonce });
    return { nonce };
  }
  if (operation === 'rejected') {
    // Only call when the wallet explicitly rejects (4001). Unknown submission errors stay locked.
    if (s.status !== 'signing') throw new SDKError('INVALID_CHECKOUT_STATE', 'Payment is already submitted.', 409);
    return status(await save(s, { status: 'created', preparation: undefined, nonce: undefined }));
  }
  throw new SDKError('NOT_FOUND', 'Unknown checkout operation.', 404);
}
