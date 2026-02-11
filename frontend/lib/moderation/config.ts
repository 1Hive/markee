/**
 * Moderation Configuration
 * 
 * Centralized config for the moderation system.
 */

// Wallet addresses authorized to flag/unflag content.
// Add any address in lowercase. Checked case-insensitively at runtime.
export const ADMIN_ADDRESSES: string[] = [
  // Addresses that can flag messages for blurring
    '0x809C9f8dd8CA93A41c3adca4972Fa234C28F7714',
    '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB'
]

// How flagged content appears to non-admin users
export const MODERATION_DEFAULTS = {
  /** CSS blur radius for flagged messages */
  blurAmount: '8px',
  /** Text shown over blurred content */
  overlayText: '🚩 this message has been flagged by moderators',
  /** Allow users to click through and reveal flagged content */
  allowReveal: true,
  /** Text on the reveal button */
  revealText: 'Show flagged message',
} as const

// API endpoint — override if hosting moderation API separately
export const MODERATION_API = '/api/moderation'
