import { parseEther } from 'viem'

export type EthAmountParse = { wei: bigint; error: null } | { wei: null; error: string }

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/
const FAR_FACTOR = 100n

export function parseEthAmountInput(input: string, unitLabel = 'ETH'): EthAmountParse {
  const value = input.trim()
  if (!DECIMAL.test(value)) {
    return { wei: null, error: `Enter a plain decimal amount in ${unitLabel}, like 0.01.` }
  }
  const fraction = value.split('.')[1] ?? ''
  if (fraction.length > 18) return { wei: null, error: 'ETH has at most 18 decimal places.' }
  const wei = parseEther(value)
  if (wei <= 0n) return { wei: null, error: 'Enter an amount above zero.' }
  return { wei, error: null }
}

export function farFromCurrentWarning(next: bigint, current: bigint): string | null {
  if (current <= 0n || next <= 0n) return null
  if (next >= current * FAR_FACTOR) return `${(next / current).toLocaleString('en-US')}x the current value. Check the amount.`
  if (next * FAR_FACTOR <= current) return 'Under 1% of the current value. Check the amount.'
  return null
}
