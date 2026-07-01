// Pricing strategy (how you pay to hold #1) is orthogonal to the vertical (where the board lives).
// A board is one (strategy x vertical). This module is the shared source of truth for strategy
// identity + the universal effectiveRate yardstick that lets fixed-price and streaming markees rank
// in one list.

export type Strategy = 'fixed' | 'streaming'
export type Vertical = 'openinternet' | 'github' | 'superfluid'

export interface StrategyMeta {
  key: Strategy
  label: string
  tagline: string
  summary: string
  glyph: 'tag' | 'stream'
  accent: string
}

export const STRATEGIES: Record<Strategy, StrategyMeta> = {
  fixed: {
    key: 'fixed',
    label: 'Fixed price',
    tagline: 'Pay a lump sum to hold #1',
    summary: 'Buy the top message for a one-time price. The most funded message holds the top spot.',
    glyph: 'tag',
    accent: '#7C9CFF',
  },
  streaming: {
    key: 'streaming',
    label: 'Streaming',
    tagline: 'Stream by the second to hold #1',
    summary: 'Backers stream ETH by the second. The highest active rate holds the top spot; stop anytime.',
    glyph: 'stream',
    accent: '#F897FE',
  },
}

// Mirrors StreamingLeaderboard.sol: SECONDS_IN_MONTH and the default legacyFloorMonths (K), which set
// the grandfather rate a migrated lump sum earns (total / (K * SECONDS_IN_MONTH), stored as wei/sec).
export const SECONDS_IN_MONTH = 2_628_000n
export const LEGACY_FLOOR_MONTHS = 3n

// Convert a fixed-price board's cumulative funds (wei) to the same wei/sec yardstick a streaming board
// exposes via effectiveRate. This is the contract's own grandfather-floor formula, so a fixed-price
// board and a streaming board can be ranked on one axis.
export function imputeEffectiveRate(totalFundsWei: bigint): bigint {
  return totalFundsWei / (LEGACY_FLOOR_MONTHS * SECONDS_IN_MONTH)
}

// A board entry reduced to what ranking needs. Streaming entries carry an on-chain effectiveRate
// (wei/sec); fixed-price entries carry cumulative funds (wei) that we impute to wei/sec.
export interface Rankable {
  strategy: Strategy
  effectiveRateWei?: bigint
  totalFundsWei?: bigint
}

export function effectiveRateOf(entry: Rankable): bigint {
  if (entry.strategy === 'streaming') return entry.effectiveRateWei ?? 0n
  return imputeEffectiveRate(entry.totalFundsWei ?? 0n)
}

export function compareByEffectiveRate(a: Rankable, b: Rankable): number {
  const ar = effectiveRateOf(a)
  const br = effectiveRateOf(b)
  return br > ar ? 1 : br < ar ? -1 : 0
}
