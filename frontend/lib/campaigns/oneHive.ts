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

// ── Leaderboard eligibility ──────────────────────────────────────────────────
//
// Every new For Rent or For Sale Markee activated (first real message live) since the v1.4 launch
// is listed automatically, as long as it has a verified site embed (the marketplace's own rule,
// applied upstream by /api/ecosystem/leaderboards). Boards copied over by a migration are older
// signs, not new ones, and never count. Rejected signs are removed by hand via
// ONE_HIVE_EXCLUDED_BOARDS. The pure rules live here; /api/campaigns/1hive does the reads.

/**
 * The v1.4 launch: 2026-11-13 16:59:17 UTC, the block the v1.4 factories were deployed at
 * (V14_FACTORIES_DEPLOY_BLOCK, 56,993,907). Every v1.4 For Sale board is newer than this; For Rent's
 * factory predates v1.4, so For Rent boards must also have been activated after it.
 */
export const ONE_HIVE_CAMPAIGN_START = 1794589157

/**
 * Signs rejected from the campaign: board address (any case) -> why it was removed. Add an entry and
 * deploy to take a sign off the leaderboard.
 */
export const ONE_HIVE_EXCLUDED_BOARDS: Record<string, string> = {}

/** The subset of an /api/ecosystem/leaderboards row the campaign reads. */
export interface CampaignListingRow {
  address: string
  migratedFrom?: string | null
  strategy?: string
  /** Set by /api/forsale/leaderboards: the current, vertical-agnostic For Sale factories. */
  verificationGated?: boolean
  name?: string
  leaderboardName?: string
  verifiedUrl?: string | null
  verifiedUrls?: string[]
  linkedFiles?: { verified?: boolean; repoFullName?: string }[]
  topMessage?: string | null
  topMarkeeAddress?: string | null
  /** For Sale: the #1 message's total (wei). */
  topFundsAddedRaw?: string
}

/** One stretch at #1 from the board's top history (lib/leaderboard/topHistory.ts). */
export interface CampaignTopSpan { markee: string; from: number; to: number | null }

const lower = (a: string | null | undefined) => (a ?? '').toLowerCase()

/**
 * Only boards from the current For Rent and For Sale factories count, and only ones created there:
 * a board migrated in (every v1.3 For Sale board was copied to v1.4) is an existing sign.
 */
export function isCampaignBoard(row: CampaignListingRow): boolean {
  return (row.strategy === 'streaming' || row.verificationGated === true) && !row.migratedFrom
}

export function isExcludedBoard(row: CampaignListingRow, excluded: Record<string, string> = ONE_HIVE_EXCLUDED_BOARDS): boolean {
  return Object.keys(excluded).some(a => lower(a) === lower(row.address))
}

/**
 * When the board's first real message went live, from its #1 history. Null if it hasn't happened or
 * the moderation scan hasn't recorded it yet (a just-activated board appears within one scan).
 *
 * For Rent: the first #1 span (the first TopChanged).
 * For Sale: initialize() deploys an empty placeholder message that holds #1 from the moment the board
 * is created, so its span is skipped and activation is the first span of any other message. If the
 * placeholder itself was given a message and funds instead, activation falls back to its span.
 */
export function activationTime(row: CampaignListingRow, spans: CampaignTopSpan[] | undefined): number | null {
  if (!spans?.length) return null
  if (row.strategy === 'streaming') return spans[0].from
  const placeholder = lower(spans[0].markee)
  const firstReal = spans.find(s => lower(s.markee) !== placeholder)
  if (firstReal) return firstReal.from
  const placeholderFunded = BigInt(row.topFundsAddedRaw || '0') > 0n && !!row.topMessage && lower(row.topMarkeeAddress) === placeholder
  return placeholderFunded ? spans[0].from : null
}

export function isEligibleBoard(row: CampaignListingRow, activatedAt: number | null, start = ONE_HIVE_CAMPAIGN_START, excluded = ONE_HIVE_EXCLUDED_BOARDS): boolean {
  return isCampaignBoard(row) && !isExcludedBoard(row, excluded) && activatedAt !== null && activatedAt >= start
}

/**
 * Every address a sign's views were counted under: the board and each message that has been #1 on
 * it. Views stay with a message, so including past #1 messages means being outbid never takes views
 * away from the sign.
 */
export function viewAddresses(row: CampaignListingRow, spans: CampaignTopSpan[] | undefined): string[] {
  return [...new Set([lower(row.address), lower(row.topMarkeeAddress), ...(spans ?? []).map(s => lower(s.markee))].filter(Boolean))]
}

/** UTC day string (YYYY-MM-DD), matching the daily view counters' field names. */
export const utcDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10)

/** Sums daily view counters ({ 'YYYY-MM-DD': count }) from `fromDay` onward, inclusive. */
export function viewsSince(dailies: (Record<string, number | string> | null | undefined)[], fromDay: string): number {
  let total = 0
  for (const daily of dailies) {
    for (const [day, count] of Object.entries(daily ?? {})) {
      if (day >= fromDay) total += Number(count) || 0
    }
  }
  return total
}

/** "host/path" of the first verified site, else the verified GitHub repo, else the board name. */
export function siteLabel(row: CampaignListingRow): string {
  const url = row.verifiedUrls?.[0] ?? row.verifiedUrl
  if (url) {
    try {
      // Verified URLs are sometimes stored without a scheme ("example.org/blog").
      const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`)
      return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`
    } catch { /* fall through */ }
  }
  const repo = row.linkedFiles?.find(f => f.verified && f.repoFullName)?.repoFullName
  if (repo) return `github.com/${repo}`
  return row.leaderboardName || row.name || row.address
}

/** What /api/campaigns/1hive returns per sign. Amounts are wei strings; USD is priced client-side. */
export interface OneHiveSign {
  address: string
  site: string
  strategy: 'streaming' | 'fixed'
  topMessage: string | null
  topMarkeeAddress: string | null
  activatedAt: number
  views: number
  /** For Rent: the winning stream rate (wei/sec). For Sale: 0. */
  topRateRaw: string
  /** For Sale: the winning message's total (wei). For Rent: 0. */
  topBidRaw: string
  totalFundsRaw: string
  /** For Rent: total ticks forward at this rate (wei/sec) from streamedAt. */
  streamedRateRaw: string
  streamedAt: number
}

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
