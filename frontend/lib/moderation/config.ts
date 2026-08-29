/**
 * Moderation Configuration
 * 
 * Centralized config for the moderation system.
 */

// Wallet addresses authorized to flag/unflag ANY content sitewide. Checked case-insensitively at
// runtime. This is deliberately a small, fixed, hand-maintained list -- per-board moderators aren't
// managed here: any leaderboard's own on-chain admin, or its resolved creator (see
// lib/leaderboards/resolveCreators.ts), can already flag content on that specific board, checked
// independently in app/api/moderation/route.ts. Only add an address here if it should be able to
// moderate every board on the site, not just its own.
export const ADMIN_ADDRESSES: string[] = [
    '0x809C9f8dd8CA93A41c3adca4972Fa234C28F7714',
    '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB'
]

// How flagged content appears to non-admin users
export const MODERATION_DEFAULTS = {
  /** CSS blur radius for flagged messages */
  blurAmount: '8px',
  /** Text shown over blurred content */
  overlayText: '🚩 this message has been flagged',
  /** Allow users to click through and reveal flagged content */
  allowReveal: false,
  /** Text on the reveal button */
  revealText: 'Show flagged message',
} as const

// API endpoint — override if hosting moderation API separately
export const MODERATION_API = '/api/moderation'
