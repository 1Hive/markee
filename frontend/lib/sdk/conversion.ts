import { decodeEventLog, encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from 'viem';
import { getEnvPublicClient } from './chains';
import { SDKError } from './validation';

// Official Base deployments: Circle USDC, canonical WETH, Uniswap v3 SwapRouter02/QuoterV2.
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const WETH = '0x4200000000000000000000000000000000000006' as const;
export const ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;
export const QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const;
export const routerABI = parseAbi([
  'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
  'function unwrapWETH9(uint256 amountMinimum,address recipient) payable',
  'function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)',
]);
const quoterABI = parseAbi(['function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
export interface ConversionQuote { eth: string; usdcMaximum: string; usdcBalance: string; fee: number; expiresAt: number }
export interface ConversionStep { id: string; kind: 'approval' | 'swap'; status: 'ready' | 'signing' | 'submitted' | 'confirmed' | 'reverted'; quote: ConversionQuote; transaction: { from: Address; to: Address; data: Hex; value: '0x0'; chainId: 8453 }; armedBlock?: string; ethBalanceBefore?: string; hash?: Hex }
export const conversionDeps = {
  balance: (account: Address) => getEnvPublicClient(8453).readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
  allowance: (account: Address) => getEnvPublicClient(8453).readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [account, ROUTER] }),
  quote: async (amount: bigint, fee: number) => (await getEnvPublicClient(8453).simulateContract({ address: QUOTER, abi: quoterABI, functionName: 'quoteExactOutputSingle', args: [{ tokenIn: USDC, tokenOut: WETH, amount, fee, sqrtPriceLimitX96: 0n }] })).result[0],
  receipt: (hash: Hex) => getEnvPublicClient(8453).getTransactionReceipt({ hash }),
  ethBalance: (account: Address, blockNumber?: bigint) => getEnvPublicClient(8453).getBalance({ address: account, blockNumber }),
  simulate: (transaction: ConversionStep['transaction']) => getEnvPublicClient(8453).call({ account: transaction.from, to: transaction.to, data: transaction.data, value: 0n, gasPrice: 0n }),
  block: () => getEnvPublicClient(8453).getBlockNumber({ cacheTime: 0 }),
};
export async function conversionQuote(account: Address, eth: bigint): Promise<ConversionQuote> {
  if (eth <= 0n) throw new SDKError('NO_CONVERSION_NEEDED', 'Your ETH balance already covers checkout.');
  const [balance, ...quotes] = await Promise.all([conversionDeps.balance(account), ...[500, 3000].map(async fee => { try { return { fee, amount: await conversionDeps.quote(eth, fee) }; } catch { return null; } })]);
  const routes = quotes.filter((q): q is { fee: number; amount: bigint } => q !== null && q.amount > 0n).sort((a, b) => a.amount < b.amount ? -1 : 1);
  if (!routes.length) throw new SDKError('CONVERSION_UNAVAILABLE', 'No USDC to ETH quote is available. Your funds remain in your wallet.', 503);
  return { eth: eth.toString(), usdcMaximum: ((routes[0].amount * 101n + 99n) / 100n).toString(), usdcBalance: balance.toString(), fee: routes[0].fee, expiresAt: Date.now() + 180000 };
}
export function conversionTransaction(account: Address, quote: ConversionQuote, approval: boolean): ConversionStep['transaction'] {
  const amount = BigInt(quote.usdcMaximum);
  if (approval) return { from: account, to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [ROUTER, amount] }), value: '0x0', chainId: 8453 };
  // Swap and unwrap atomically. No WETH is left waiting for a second transaction.
  const swap = encodeFunctionData({ abi: routerABI, functionName: 'exactOutputSingle', args: [{ tokenIn: USDC, tokenOut: WETH, fee: quote.fee, recipient: ROUTER, amountOut: BigInt(quote.eth), amountInMaximum: amount, sqrtPriceLimitX96: 0n }] });
  const unwrap = encodeFunctionData({ abi: routerABI, functionName: 'unwrapWETH9', args: [BigInt(quote.eth), account] });
  return { from: account, to: ROUTER, data: encodeFunctionData({ abi: routerABI, functionName: 'multicall', args: [BigInt(Math.floor(quote.expiresAt / 1000)), [swap, unwrap]] }), value: '0x0', chainId: 8453 };
}
export async function conversionStep(account: Address, quote: ConversionQuote, id: string): Promise<ConversionStep> {
  if (quote.expiresAt <= Date.now()) throw new SDKError('QUOTE_EXPIRED', 'Refresh the conversion quote.');
  if (await conversionDeps.balance(account) < BigInt(quote.usdcMaximum)) throw new SDKError('INSUFFICIENT_USDC', 'Wait for USDC funding or add the missing amount.');
  const approval = await conversionDeps.allowance(account) < BigInt(quote.usdcMaximum);
  const transaction = conversionTransaction(account, quote, approval);
  await conversionDeps.simulate(transaction);
  return { id, kind: approval ? 'approval' : 'swap', status: 'ready', quote, transaction };
}

// Sponsored EIP-7702/4337 transactions have a bundler as the outer sender. Verify
// canonical token effects and ETH received instead of trusting that outer calldata.
// Conversion success never constitutes a Markee payment or rewards receipt.
export async function verifyConversionReceipt(step: ConversionStep, hash: Hex): Promise<ConversionStep['status']> {
  let receipt;
  try { receipt = await conversionDeps.receipt(hash); }
  catch (e) { if ((e as Error).name === 'TransactionReceiptNotFoundError') return 'submitted'; throw e; }
  if (step.armedBlock === undefined || receipt.blockNumber <= BigInt(step.armedBlock)) throw new SDKError('TRANSACTION_MISMATCH', 'Conversion receipt predates this operation.', 409);
  if ((await conversionDeps.block()) - receipt.blockNumber < 1n) return 'submitted';
  // Failed bundled operations must be investigated rather than automatically retried.
  if (receipt.status !== 'success') throw new SDKError('CONVERSION_FAILED', 'Transaction failed. Check your wallet activity before starting a new checkout.', 409);
  const account = step.transaction.from.toLowerCase();
  let approved = false, spent = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName === 'Approval' && event.args.owner.toLowerCase() === account && event.args.spender.toLowerCase() === ROUTER.toLowerCase() && event.args.value === BigInt(step.quote.usdcMaximum)) approved = true;
      if (event.eventName === 'Transfer' && event.args.from.toLowerCase() === account) spent += event.args.value;
    } catch { /* Ignore unrelated token events. */ }
  }
  if (step.kind === 'approval' && approved) return 'confirmed';
  if (step.kind === 'swap' && spent > 0n && spent <= BigInt(step.quote.usdcMaximum) && step.ethBalanceBefore !== undefined) {
    const received = await conversionDeps.ethBalance(step.transaction.from, receipt.blockNumber) - BigInt(step.ethBalanceBefore);
    if (received >= BigInt(step.quote.eth)) return 'confirmed';
  }
  throw new SDKError('TRANSACTION_MISMATCH', 'Receipt does not show the expected conversion effects. Check your wallet activity.', 409);
}
