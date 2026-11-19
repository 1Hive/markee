// 1Hive incentives campaign (markee.xyz/1hive).
//
// Bonus curve: monthly bonus in USD = sqrt(views), from 100 views ($10/mo) up to a cap of 1M views
// ($1k/mo). Signs under 100 views are not funded.

export const CAMPAIGN_1HIVE_MIN_VIEWS = 100
export const CAMPAIGN_1HIVE_MAX_VIEWS = 1_000_000
export const CAMPAIGN_1HIVE_SPONSOR_URL = 'https://1hive.org'

export function campaign1HiveMonthlyBonusUsd(views: number): number {
  if (!Number.isFinite(views) || views < CAMPAIGN_1HIVE_MIN_VIEWS) return 0
  return Math.round(Math.sqrt(Math.min(views, CAMPAIGN_1HIVE_MAX_VIEWS)))
}

// ── Leaderboard eligibility ──────────────────────────────────────────────────
//
// A sign is listed when it is a new (v1.4-era) For Rent or For Sale Markee that has been activated
// (a real message went live) and has a verified site or GitHub embed. There is no start date for
// views: every view the sign has ever had counts, including views while only the placeholder
// message was up. A board copied over by the v1.4 migration counts only if its original was created
// after the v1.4 launch; copies of older signs never count. Disqualified
// boards (lib/leaderboards/disqualified.ts) never count, and signs rejected from this campaign only
// are removed via CAMPAIGN_1HIVE_EXCLUDED_BOARDS. The pure rules live here; /api/campaigns/1hive
// does the reads.

/**
 * For Rent boards that already existed at the v1.4 launch (2026-11-13 16:59:17 UTC,
 * V14_FACTORIES_DEPLOY_BLOCK 56,993,907). For Rent's factory (BASE_STREAMING_FACTORY) predates v1.4
 * and only ever appends to its board list, so the boards at index 80 and up are the ones created
 * since the launch. Every v1.4 For Sale board is new by construction (its factory launched then).
 */
export const FOR_RENT_BOARDS_BEFORE_V14 = 80

/**
 * Boards the v1.3 For Sale factory (FACTORIES.FOR_SALE) had at the v1.4 launch. Boards created on it
 * after the launch (index 18 and up) are new signs; the forced migration copied them to v1.4.
 */
export const FOR_SALE_V13_BOARDS_BEFORE_V14 = 18

/**
 * Signs rejected from the campaign: board address (any case) -> why it was removed. Add an entry and
 * deploy to take a sign off the leaderboard.
 */
export const CAMPAIGN_1HIVE_EXCLUDED_BOARDS: Record<string, string> = {}

/** The subset of an /api/ecosystem/leaderboards row the campaign reads. */
export interface CampaignListingRow {
  address: string
  migratedFrom?: string | null
  strategy?: string
  /** Set by /api/forsale/leaderboards: the current, vertical-agnostic For Sale factories. */
  verificationGated?: boolean
  /** Set by /api/ecosystem/leaderboards from lib/leaderboards/disqualified.ts. */
  disqualified?: boolean
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
 * Only new boards count: every v1.4 For Sale board created on v1.4, and For Rent boards created since
 * the v1.4 launch. `newBoards` (lowercase addresses) holds every board created since the launch on a
 * factory that predates it: the For Rent factory's boards from FOR_RENT_BOARDS_BEFORE_V14 on, and the
 * v1.3 For Sale factory's from FOR_SALE_V13_BOARDS_BEFORE_V14 on. A migrated board is judged by its
 * original, so a copy of a sign created after the launch still counts and a copy of an older one
 * (every pre-launch v1.3 board was copied to v1.4) doesn't.
 */
export function isCampaignBoard(row: CampaignListingRow, newBoards: ReadonlySet<string>): boolean {
  if (row.migratedFrom) return newBoards.has(lower(row.migratedFrom))
  if (row.strategy === 'streaming') return newBoards.has(lower(row.address))
  return row.verificationGated === true
}

// The exclusion list's addresses, lowercased once per list, so each board is a single lookup.
const excludedSets = new WeakMap<Record<string, string>, ReadonlySet<string>>()

export function isExcludedBoard(row: CampaignListingRow, excluded: Record<string, string> = CAMPAIGN_1HIVE_EXCLUDED_BOARDS): boolean {
  let set = excludedSets.get(excluded)
  if (!set) excludedSets.set(excluded, set = new Set(Object.keys(excluded).map(lower)))
  // Listed under either address: an entry added before the migration names the original board.
  return set.has(lower(row.address)) || (!!row.migratedFrom && set.has(lower(row.migratedFrom)))
}

/**
 * Whether the board's first real message has gone live, from its #1 history. False if it hasn't, or
 * the moderation scan hasn't recorded it yet (a just-activated board appears within one scan).
 *
 * For Rent: any #1 span (the first TopChanged).
 * For Sale: initialize() deploys an empty placeholder message that holds #1 from the moment the board
 * is created, so its span doesn't count; any other message reaching #1 does. So does the placeholder
 * itself being given a message and funds.
 */
export function isActivated(row: CampaignListingRow, spans: CampaignTopSpan[] | undefined): boolean {
  if (!spans?.length) return false
  if (row.strategy === 'streaming') return true
  const placeholder = lower(spans[0].markee)
  if (spans.some(s => lower(s.markee) !== placeholder)) return true
  return BigInt(row.topFundsAddedRaw || '0') > 0n && !!row.topMessage && lower(row.topMarkeeAddress) === placeholder
}

/**
 * Embedded somewhere: a verified website or a verified GitHub file. No bonus goes to a sign that
 * hasn't been added to a site. The marketplace listing checks this too, but exempts Coop-administered
 * boards, so it's checked here as well. The route merges the address-based lookup into the row first.
 */
export function hasVerifiedEmbed(row: CampaignListingRow): boolean {
  return (row.verifiedUrls?.length ?? 0) > 0 || !!row.verifiedUrl || !!row.linkedFiles?.some(f => f.verified === true)
}

export function isEligibleBoard(
  row: CampaignListingRow,
  spans: CampaignTopSpan[] | undefined,
  newBoards: ReadonlySet<string>,
  excluded: Record<string, string> = CAMPAIGN_1HIVE_EXCLUDED_BOARDS,
): boolean {
  return isCampaignBoard(row, newBoards) && row.disqualified !== true && !isExcludedBoard(row, excluded)
    && hasVerifiedEmbed(row) && isActivated(row, spans)
}

/**
 * Every address a sign's views were counted under: the board and each message that has been #1 on
 * it, including the For Sale placeholder. Views stay with a message, so including past #1 messages
 * means being outbid never takes views away from the sign. A sign's views are the sum of these
 * addresses' all-time counters (views:total:{address}).
 */
export function viewAddresses(row: CampaignListingRow, spans: CampaignTopSpan[] | undefined): string[] {
  return [...new Set([lower(row.address), lower(row.topMarkeeAddress), ...(spans ?? []).map(s => lower(s.markee))].filter(Boolean))]
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
export interface Campaign1HiveSign {
  address: string
  site: string
  strategy: 'streaming' | 'fixed'
  topMessage: string | null
  topMarkeeAddress: string | null
  /** All-time views across the board and every message that has been #1 on it. */
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

export const CAMPAIGN_1HIVE_TERMS: string[] = [
  'Signs need at least 100 views to get funded.',
  'More views, more funding: $10/mo for 100 views, up to $1k/mo for 1M+ views.',
  "The bonus is paid directly to the Markee sign. The sign's beneficiary receives the funds, and 1Hive owns the message that's displayed.",
  "As with any Markee, anyone can outbid 1Hive to take over the sign. 38% of every payment goes to the Markee Cooperative's Revnet, earning MARKEE tokens for the buyer, and the remaining funds go directly to the beneficiary set for the Markee.",
  'Limit one eligible bonus per domain.',
  'Available on any new For Rent or For Sale sign embed.',
  'Pay amounts are updated weekly based on view counts.',
  'View counts are reviewed for gaming. Signs suspected of view farming will have their stream stopped.',
  'All entries are reviewed for quality. Sites that are abusive or inappropriate will be rejected.',
  'Bonuses are not guaranteed. Markee may approve, adjust, pause or end any bonus at its discretion.',
  'For a limited time, while funding lasts.',
]
