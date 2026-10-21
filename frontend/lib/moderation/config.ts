/**
 * Moderation Configuration
 * 
 * Centralized config for the moderation system.
 */

// markee.xyz's global admins: they can flag ANY message, but their flags hide it on markee.xyz only
// (the `site` scope), never on other sites showing the board. Checked case-insensitively at runtime.
// This is deliberately a small, fixed, hand-maintained list -- per-board moderators aren't managed
// here: a board's owners (on-chain admin and resolved creator, see lib/leaderboards/resolveCreators.ts)
// moderate it out of the box and can add more moderators from /account, and their flags hide the
// message everywhere (see lib/moderation/server.ts). Only add an address here if it should moderate
// every board on markee.xyz.
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
  /** Shown in place of a flagged message's author name or wallet */
  hiddenAuthorText: 'hidden',
} as const

// API endpoint — override if hosting moderation API separately
export const MODERATION_API = '/api/moderation'
