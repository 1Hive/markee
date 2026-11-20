import { formatEther, parseAbi, parseEther, zeroAddress, type Address, type PublicClient } from 'viem'
import { estimateDirectRevnetMarkeeTokens } from '@/lib/tokenPhases'
import { formatMarkeeAmount } from '@/lib/utils'

export const NATIVE_TOKEN = '0x000000000000000000000000000000000000EEEe' as Address
export const QUOTE_PLACEHOLDER_ACCOUNT = '0x000000000000000000000000000000000000dEaD' as Address
const BASIS_POINTS = 10_000n

export const terminalPayABI = parseAbi([
  'function pay(uint256 projectId,address token,uint256 amount,address beneficiary,uint256 minReturnedTokens,string memo,bytes metadata) payable returns (uint256 beneficiaryTokenCount)',
])

export const revnetRouteABI = parseAbi([
  'function revNetEnabled() view returns (bool)',
  'function beneficiaryAddress() view returns (address)',
  'function percentToBeneficiary() view returns (uint256)',
  'function platformFeeReceiver() view returns (address)',
  'function percentToPlatformFeeReceiver() view returns (uint256)',
  'function revNetTerminal() view returns (address)',
  'function revNetProjectId() view returns (uint256)',
])

export interface RevnetRoute {
  revnetEnabled: boolean
  beneficiary: Address
  beneficiaryBps: bigint
  feeReceiver: Address
  feeBps: bigint
  terminal: Address
  projectId: bigint
}

export interface TerminalPay {
  amount: bigint
  beneficiary: Address
}

export interface PayPlan {
  terminal: Address
  projectId: bigint
  pays: TerminalPay[]
  buyerIndex: number | null
}

function assertBps(bps: bigint) {
  if (bps < 0n || bps > BASIS_POINTS) throw new Error('Invalid Markee payment split.')
}

function feeSplit(amount: bigint, route: RevnetRoute) {
  const takesFee = route.feeReceiver !== zeroAddress && route.feeBps > 0n
  const fee = takesFee ? amount * route.feeBps / BASIS_POINTS : 0n
  return { fee, buyer: amount - fee }
}

export function markeePayPlan(amount: bigint, route: RevnetRoute, buyer: Address): PayPlan {
  assertBps(route.beneficiaryBps); assertBps(route.feeBps)
  const plan: PayPlan = { terminal: route.terminal, projectId: route.projectId, pays: [], buyerIndex: null }
  if (!route.revnetEnabled || route.beneficiary === zeroAddress || amount <= 0n) return plan
  const revnetAmount = amount - amount * route.beneficiaryBps / BASIS_POINTS
  if (revnetAmount === 0n) return plan
  const { fee, buyer: buyerAmount } = feeSplit(revnetAmount, route)
  if (fee > 0n) plan.pays.push({ amount: fee, beneficiary: route.feeReceiver })
  if (buyerAmount > 0n) {
    plan.buyerIndex = plan.pays.length
    plan.pays.push({ amount: buyerAmount, beneficiary: buyer })
  }
  return plan
}

export function settlementPayPlan(amount: bigint, route: RevnetRoute, buyer: Address): PayPlan {
  const plan = markeePayPlan(amount, route, buyer)
  if (plan.buyerIndex === null || plan.pays.length < 2) return plan
  return { ...plan, pays: [plan.pays[1], plan.pays[0]], buyerIndex: 0 }
}

export function directPayPlan(amount: bigint, terminal: Address, projectId: bigint, buyer: Address): PayPlan {
  return amount > 0n
    ? { terminal, projectId, pays: [{ amount, beneficiary: buyer }], buyerIndex: 0 }
    : { terminal, projectId, pays: [], buyerIndex: null }
}

export function buyerPayAmount(plan: PayPlan): bigint {
  return plan.buyerIndex === null ? 0n : plan.pays[plan.buyerIndex].amount
}

export function mintFloorTokens(plan: PayPlan, now = Date.now()): number {
  return estimateDirectRevnetMarkeeTokens(Number(formatEther(buyerPayAmount(plan))), now)
}

export async function quotePayPlan(client: PublicClient, plan: PayPlan, account: Address, blockNumber?: bigint): Promise<bigint> {
  if (plan.buyerIndex === null) return 0n
  const total = plan.pays.reduce((sum, p) => sum + p.amount, 0n)
  const { results } = await client.simulateCalls({
    account,
    blockNumber,
    calls: plan.pays.map(p => ({
      to: plan.terminal, abi: terminalPayABI, functionName: 'pay' as const,
      args: [plan.projectId, NATIVE_TOKEN, p.amount, p.beneficiary, 0n, '', '0x'] as const,
      value: p.amount,
    })),
    stateOverrides: [{ address: account, balance: total + parseEther('1') }],
  })
  const failed = results.find(r => r.status !== 'success')
  if (failed) throw failed.error ?? new Error('MARKEE quote simulation failed.')
  return results[plan.buyerIndex].result as bigint
}

export interface MarkeeEstimate {
  quoted: number | null
  floor: number | null
}

export function markeeEstimateParts({ quoted, floor }: MarkeeEstimate): { prefix: '' | '~' | 'at least '; amount: number; floor: number | null } | null {
  if (quoted !== null) {
    const swapped = floor !== null && quoted > floor * 1.0001
    return { prefix: swapped ? '~' : '', amount: quoted, floor: swapped ? floor : null }
  }
  return floor === null ? null : { prefix: 'at least ', amount: floor, floor: null }
}

export function formatMarkeeEstimate(estimate: MarkeeEstimate, unit = 'MARKEE'): string | null {
  const parts = markeeEstimateParts(estimate)
  if (!parts) return null
  const main = `${parts.prefix}${formatMarkeeAmount(parts.amount)} ${unit}`
  return parts.floor === null ? main : `${main} (at least ${formatMarkeeAmount(parts.floor)})`
}

export function markeeEstimateHeadline(estimate: MarkeeEstimate & { loading?: boolean }): { headline: string; note: string | null } {
  const parts = markeeEstimateParts(estimate)
  if (!parts) return { headline: estimate.loading ? '…' : 'Unavailable', note: null }
  return {
    headline: `${parts.prefix === 'at least ' ? '≥ ' : parts.prefix}${formatMarkeeAmount(parts.amount)}`,
    note: parts.floor === null ? null : `at least ${formatMarkeeAmount(parts.floor)}`,
  }
}
