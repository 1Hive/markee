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
// Every new For Rent or For Sale Markee activated (first message live) at or after the campaign
// start is listed automatically, as long as it has a verified site embed (the marketplace's own
// rule, applied upstream by /api/ecosystem/leaderboards). Rejected signs are removed by hand via
// ONE_HIVE_EXCLUDED_BOARDS. The pure rules live here; /api/campaigns/1hive does the reads.

/** 2026-11-17 21:00 UTC. Boards activated before this are not part of the campaign. */
export const ONE_HIVE_CAMPAIGN_START = 1794949200

/**
 * Signs rejected from the campaign: board address (any case; original or current address after a
 * migration) -> why it was removed. Add an entry and deploy to take a sign off the leaderboard.
 */
export const ONE_HIVE_EXCLUDED_BOARDS: Record<string, string> = {}

/** The subset of an /api/ecosystem/leaderboards row the campaign reads. */
export interface CampaignListingRow {
  address: string
  migratedFrom?: string | null
  strategy?: string
  /** Set by /api/forsale/leaderboards: the current, vertical-agnostic For Sale factory. */
  verificationGated?: boolean
  name?: string
  leaderboardName?: string
  verifiedUrl?: string | null
  verifiedUrls?: string[]
  linkedFiles?: { verified?: boolean; repoFullName?: string }[]
  topMarkeeAddress?: string | null
}

/** One stretch at #1 from the board's top history (lib/leaderboard/topHistory.ts). */
export interface CampaignTopSpan { markee: string; from: number; to: number | null }

const lower = (a: string | null | undefined) => (a ?? '').toLowerCase()

/** The board's original address: a migrated board keeps its predecessor's identity. */
export const campaignOriginal = (row: CampaignListingRow) => lower(row.migratedFrom ?? row.address)

/** Only boards from the current For Rent and For Sale factories count as "new" signs. */
export function isCampaignStrategy(row: CampaignListingRow): boolean {
  return row.strategy === 'streaming' || row.verificationGated === true
}

export function isExcludedBoard(row: CampaignListingRow, excluded: Record<string, string> = ONE_HIVE_EXCLUDED_BOARDS): boolean {
  const out = new Set(Object.keys(excluded).map(lower))
  return out.has(lower(row.address)) || out.has(campaignOriginal(row))
}

/**
 * When the board's first message went live: the earliest #1 span across its original and current
 * histories (a migration starts a fresh history on the successor). Null until the moderation scan
 * has recorded one, so a just-activated board appears within one scan.
 */
export function activationTime(histories: (CampaignTopSpan[] | undefined)[]): number | null {
  const starts = histories.flatMap(spans => spans?.length ? [spans[0].from] : [])
  return starts.length ? Math.min(...starts) : null
}

export function isEligibleBoard(row: CampaignListingRow, activatedAt: number | null, start = ONE_HIVE_CAMPAIGN_START, excluded = ONE_HIVE_EXCLUDED_BOARDS): boolean {
  return isCampaignStrategy(row) && !isExcludedBoard(row, excluded) && activatedAt !== null && activatedAt >= start
}

/**
 * Every address a sign's views were counted under: the board (original and current) and each
 * message that has been #1 on it. Views stay with a message, so including past #1 messages means
 * being outbid never takes views away from the sign.
 */
export function viewAddresses(row: CampaignListingRow, histories: (CampaignTopSpan[] | undefined)[]): string[] {
  return [...new Set([
    lower(row.address), campaignOriginal(row), lower(row.topMarkeeAddress),
    ...histories.flatMap(spans => (spans ?? []).map(s => lower(s.markee))),
  ].filter(Boolean))]
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
      const u = new URL(url)
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
