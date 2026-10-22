// Shapes the /account page reads from the leaderboard and account APIs, shared by its components.

export interface BaseLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  // Address-resolved creator (lib/leaderboards/resolveCreators.ts) -- distinct from admin, which for
  // some platforms (Superfluid) is the beneficiary, and for migrated boards is the Cooperative
  // multisig, not whoever actually created the board. Populated for superfluid/github/openinternet/
  // forsale; streaming boards have no separate creator resolution, so callers fall back to admin
  // (matches the existing lb.creator ?? lb.admin convention already used elsewhere on this page).
  creator?: string | null
  topMessage: string | null
  topMessageOwner?: string | null
  // Address of the top markee slot itself (distinct from `address`, the leaderboard/board contract) --
  // already returned by every platform's leaderboards API, just not previously typed here. Needed as
  // the markeeId for moderation (ModeratedContent/FlagButton key flagged state per-markee, not per-board).
  topMarkeeAddress?: string | null
  topFundsAddedRaw: string
  topRateRaw?: string
  minimumPriceRaw?: string
  strategy?: 'fixed' | 'streaming'
  // Verification is address-based, not platform-based -- a streaming board can be integrated on a
  // website, GitHub, both, or neither, independent of its on-chain platform tag. Populated for every
  // board (any platform) from /api/account/verification-status, not just website/github-tagged ones.
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  // Set on boards from the shared "For Sale" factory (see /api/forsale/leaderboards) -- unlike the
  // three legacy per-vertical factories, there's no migration history to exempt these from needing a
  // verified integration to reach "Active Markees".
  verificationGated?: boolean
}
export interface SuperfluidLeaderboard extends BaseLeaderboard { platform: 'superfluid' }
export interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl: string
  repoHtmlUrl: string
  filePath: string
  verified: boolean
}

export interface GithubLeaderboard extends BaseLeaderboard {
  platform: 'github'
  repoFullName: string | null
  repoAvatarUrl: string | null
  repoHtmlUrl: string | null
  filePath: string | null
  linkedFiles: LinkedFile[]
}
export interface WebsiteLeaderboard extends BaseLeaderboard {
  platform: 'website'
  creator: string | null
  logoUrl: string | null
  siteUrl: string | null
  verifiedUrl: string | null
  verifiedUrls: string[]
  status: 'pending' | 'verified'
  isLegacy: boolean
  slug?: string
}
export type AnyLeaderboard = SuperfluidLeaderboard | GithubLeaderboard | WebsiteLeaderboard

export interface MyMessage {
  address: string
  message: string
  name: string
  totalFundsAdded: bigint
  createdAt: number
  strategyId: string
  strategyName: string
  isTop: boolean
  topFunds: bigint
  strategy?: 'fixed' | 'streaming'
  rank?: number | null
  flowRateRaw?: string
  // Streaming boards only: the message's own effective rate across all its backers (wei/sec). '0'
  // means nothing funds it any more: shown dimmed, last, with Reactivate (as on the board page).
  markeeRateRaw?: string
  // Streaming boards only: the current #1's rate in wei/sec.
  topRateRaw?: string
  // From the board's #1 history (lib/leaderboard/topHistory.ts): since when this message has been
  // #1 (unix seconds, while it is), and its total time at #1. null where the board has no history.
  winningSince?: number | null
  wonSeconds?: number | null
  // Legacy TopDawg (subgraph-sourced) vs v1.x LeaderboardFactory (RPC-sourced) — determines
  // whether MarkeeSignModal's RPC-only useLeaderboardDetail can safely target this markee's board.
  isLegacy: boolean
  // Verification data for the leaderboard this message lives on -- absent for legacy
  // subgraph-sourced rows (the subgraph query doesn't carry it), which just fall back to the
  // "Add to Your Site" / blank state like any other missing-data default in this file.
  platform?: string | null
  admin?: string | null
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  siteUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
}

export interface FundedMessage {
  address: string
  message: string
  name: string
  winningSince?: number | null
  wonSeconds?: number | null
  totalFundsAdded: string
  totalContributed: string
  strategyId: string
  strategyName: string
  isTop: boolean
  topFundsRaw: string
  strategy?: 'fixed' | 'streaming'
  rank?: number | null
  flowRateRaw?: string
  platform?: string | null
  admin?: string | null
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  siteUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
}

// One row of /api/marketplace/best-buys.
export interface BestBuy {
  address: string
  name: string
  platform: string | null
  strategy: 'fixed' | 'streaming'
  servedOn: string | null
  views: number
  // Wei per 1k views.
  cpmWei: string
  // Sale: the bid that takes #1. Rent: the current #1's monthly rate (wei/month).
  priceWei: string
}
