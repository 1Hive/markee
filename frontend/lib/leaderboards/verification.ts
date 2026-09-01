// lib/leaderboards/verification.ts
//
// Shared "does this board need a verified integration before it's shown as active" logic -- used by
// /account (to sort a wallet's own boards into Active vs Awaiting Verification) and by the public
// ecosystem/marketplace aggregation (to exclude unverified boards from public listing entirely).
// Keep these in one place: the two call sites must agree on what "verified" means, or a board could
// show as active on one and unverified on the other.

import { COOPERATIVE_MULTISIG } from '@/lib/contracts/addresses'

export interface VerifiableLeaderboard {
  strategy?: 'fixed' | 'streaming'
  admin?: string
  verifiedUrls?: string[]
  linkedFiles?: { verified: boolean }[]
}

// Streaming boards always need a verified integration to reach Active -- they've never been split by
// platform, so there's no "migrated, creator can't fix it" history to exempt. Fixed ("For Sale")
// boards are exempt only when admin was reassigned to the Coop multisig during migration -- that's the
// actual "creator can't act on it anymore" case (confirmed on the known migrated partner boards:
// Cooperative/Gardens/Clawchemy all carry admin === COOPERATIVE_MULTISIG). A board whose admin is
// still a normal wallet -- even one from a legacy per-vertical factory -- was created directly by
// someone who can act on it, so it's gated like everything else.
export function needsVerificationGate(lb: VerifiableLeaderboard): boolean {
  if (lb.strategy === 'streaming') return true
  return lb.admin?.toLowerCase() !== COOPERATIVE_MULTISIG.toLowerCase()
}

// `override` lets a caller substitute a more authoritative, address-based verification lookup (see
// /api/account/verification-status) instead of trusting whatever a single platform-specific listing
// route happened to attach -- streaming boards in particular aren't split by platform, so their own
// listing route can't reliably know about a website/GitHub integration made through another route.
export function isVerifiedLeaderboard(
  lb: VerifiableLeaderboard,
  override?: { verifiedUrls?: string[]; linkedFiles?: { verified: boolean }[] },
): boolean {
  const verifiedUrls = override?.verifiedUrls ?? lb.verifiedUrls ?? []
  const linkedFiles = override?.linkedFiles ?? lb.linkedFiles ?? []
  return verifiedUrls.length > 0 || linkedFiles.some(f => f.verified)
}
