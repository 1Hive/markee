import { parseAbi, zeroAddress, type Address } from 'viem';
import type { BoardContext } from './snapshot';

const terminalABI = parseAbi([
  'function pay(uint256 projectId,address token,uint256 amount,address beneficiary,uint256 minReturnedTokens,string memo,bytes metadata) payable returns (uint256 beneficiaryTokenCount)',
]);
const nativeToken = '0x000000000000000000000000000000000000EEEe' as Address;

/** Mirrors Markee.pay's two splits before asking the current RevNet terminal for its output. */
export function buyerPayment(amount: bigint, beneficiaryBps: bigint, platformFeeBps: bigint, hasFeeReceiver: boolean): bigint {
  if (beneficiaryBps > 10_000n || platformFeeBps > 10_000n) throw new Error('Invalid Markee payment split.');
  const revnetAmount = amount - amount * beneficiaryBps / 10_000n;
  return hasFeeReceiver ? revnetAmount - revnetAmount * platformFeeBps / 10_000n : revnetAmount;
}

export async function quoteReward(c: BoardContext, amount: bigint, account: Address): Promise<bigint | null> {
  if (!c.revnetEnabled || !c.token || amount === 0n) return null;
  const [beneficiaryBps, platformFeeBps, feeReceiver, terminal, projectId] = await Promise.all([
    c.r<bigint>('percentToBeneficiary'), c.r<bigint>('percentToPlatformFeeReceiver'),
    c.r<Address>('platformFeeReceiver'), c.r<Address>('revNetTerminal'), c.r<bigint>('revNetProjectId'),
  ]);
  if (terminal === zeroAddress || projectId === 0n) return null;
  const payment = buyerPayment(amount, beneficiaryBps, platformFeeBps, feeReceiver !== zeroAddress);
  if (payment === 0n) return 0n;
  const { result } = await c.client.simulateContract({
    address: terminal, abi: terminalABI, functionName: 'pay',
    args: [projectId, nativeToken, payment, account, 0n, '', '0x'],
    account, value: payment, blockNumber: c.blockNumber,
  });
  return result;
}
