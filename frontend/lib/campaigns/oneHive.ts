// 1Hive incentives campaign (markee.xyz/1hive).
//
// Bonus curve: monthly bonus in USD = sqrt(views), from 100 views ($10/mo) up to a cap of 1M views
// ($1k/mo). Signs under 100 views are not funded.

export const ONE_HIVE_MIN_VIEWS = 100
export const ONE_HIVE_MAX_VIEWS = 1_000_000
export const ONE_HIVE_SPONSOR_URL = 'https://1hive.org'

export function oneHiveMonthlyBonusUsd(views: number): number {
  if (!Number.isFinite(views) || views < ONE_HIVE_MIN_VIEWS) return 0
  return Math.round(Math.sqrt(Math.min(views, ONE_HIVE_MAX_VIEWS)))
}

export interface OneHiveBonusSign {
  /** Display label for the host site, e.g. "example.com/blog". */
  site: string
  /** Optional link to the board detail page or the host site. */
  href?: string
  currentMessage: string
  /** True while 1Hive still owns the displayed message; false once someone has outbid it. */
  ownedBy1Hive: boolean
  views: number
  monthlyUsd: number
  totalEarnedUsd: number
}

// Signs currently earning a bonus, maintained by hand and updated weekly as payouts are set.
// Leave empty until real signs are approved: the page shows an empty state rather than placeholder
// figures, so no earnings are displayed that haven't actually been paid.
export const ONE_HIVE_BONUS_SIGNS: OneHiveBonusSign[] = []

export const ONE_HIVE_TERMS: string[] = [
  'Signs need at least 100 views to get funded.',
  'More views, more funding: $10/mo for 100 views, up to $1k/mo for 1M+ views.',
  "The bonus is paid directly to the message. The sign's beneficiary receives the funds, and 1Hive owns the message that's displayed.",
  "As with any Markee, anyone can outbid 1Hive to take over the message. 38% of every payment goes to the Markee Cooperative's Revnet, earning MARKEE tokens for the buyer.",
  'Limit one eligible bonus per domain.',
  'Available on any new For Rent or For Sale sign embed.',
  'Pay amounts are updated weekly based on view counts.',
  'View counts are reviewed for gaming. Signs suspected of view farming will have their stream stopped.',
  'All entries are reviewed for quality. Sites that are abusive or inappropriate will be rejected.',
  'Bonuses are not guaranteed. Markee may approve, adjust, pause or end any bonus at its discretion.',
  'For a limited time, while funding lasts.',
]
