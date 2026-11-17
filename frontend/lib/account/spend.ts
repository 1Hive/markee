export interface OwnedSpend {
  strategy?: 'fixed' | 'streaming'
  totalFundsAdded: bigint
  rentSpent?: bigint | null
}

export interface FundedSpend {
  totalContributed: string
}

export function ownedMessageSpend(m: OwnedSpend): bigint | null {
  if (m.strategy !== 'streaming') return m.totalFundsAdded
  return m.rentSpent == null ? null : m.totalFundsAdded + m.rentSpent
}

export function walletSpend(owned: OwnedSpend[], funded: FundedSpend[]): bigint | null {
  let total = 0n
  for (const m of owned) {
    const spent = ownedMessageSpend(m)
    if (spent === null) return null
    total += spent
  }
  return funded.reduce((sum, m) => sum + BigInt(m.totalContributed || '0'), total)
}

export function buyerBoards(owned: { strategyId: string }[], funded: { strategyId: string }[]): string[] {
  return [...new Set([...owned, ...funded].map(m => m.strategyId.toLowerCase()).filter(Boolean))]
}
