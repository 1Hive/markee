import { zeroAddress, type Address, type PublicClient } from 'viem';
import type { BoardContext } from './snapshot';
import { markeePayPlan, quotePayPlan, settlementPayPlan, type RevnetRoute } from '../markee/quote';

/** Mirrors Markee.pay's two splits before asking the current RevNet terminal for its output. */
export function buyerPayment(amount: bigint, beneficiaryBps: bigint, platformFeeBps: bigint, hasFeeReceiver: boolean): bigint {
  if (beneficiaryBps > 10_000n || platformFeeBps > 10_000n) throw new Error('Invalid Markee payment split.');
  const revnetAmount = amount - amount * beneficiaryBps / 10_000n;
  return hasFeeReceiver ? revnetAmount - revnetAmount * platformFeeBps / 10_000n : revnetAmount;
}

/** Simulates every terminal payment the board makes, in its order, so the buyer's quote sees the pool after the fee payment. */
export async function quoteReward(c: BoardContext, amount: bigint, account: Address): Promise<bigint | null> {
  if (!c.revnetEnabled || !c.token || amount === 0n) return null;
  const [beneficiaryBps, feeBps, feeReceiver, terminal, projectId] = await Promise.all([
    c.r<bigint>('percentToBeneficiary'), c.r<bigint>('percentToPlatformFeeReceiver'),
    c.r<Address>('platformFeeReceiver'), c.r<Address>('revNetTerminal'), c.r<bigint>('revNetProjectId'),
  ]);
  if (terminal === zeroAddress || projectId === 0n) return null;
  const route: RevnetRoute = { revnetEnabled: true, beneficiary: c.beneficiary, beneficiaryBps, feeReceiver, feeBps, terminal, projectId };
  const plan = c.strategy === 'rent' ? settlementPayPlan(amount, route, account) : markeePayPlan(amount, route, account);
  return quotePayPlan(c.client as PublicClient, plan, account, c.blockNumber);
}
