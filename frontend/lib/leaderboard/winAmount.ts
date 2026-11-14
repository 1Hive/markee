import { formatEther } from 'viem'

export const WIN_INCREMENT_WEI = 10n ** 15n
const DISPLAY_STEP_WEI = 10n ** 15n

export function ceilToDisplayStep(wei: bigint): bigint {
  if (wei <= 0n) return 0n
  return ((wei + DISPLAY_STEP_WEI - 1n) / DISPLAY_STEP_WEI) * DISPLAY_STEP_WEI
}

export function formatEthCeil(wei: bigint): string {
  return Number(formatEther(ceilToDisplayStep(wei))).toFixed(3)
}

export function winAmountWei(topTotal: bigint, ownTotal = 0n): bigint | null {
  if (topTotal <= 0n) return null
  const raw = topTotal + WIN_INCREMENT_WEI - ownTotal
  return raw > 0n ? ceilToDisplayStep(raw) : null
}

export function beatsTop(amount: bigint, ownTotal: bigint, topTotal: bigint): boolean {
  return amount + ownTotal > topTotal
}

export function shortfallToWin(amount: bigint, ownTotal: bigint, topTotal: bigint): bigint {
  const needed = topTotal + 1n - ownTotal - amount
  return needed > 0n ? needed : 0n
}
