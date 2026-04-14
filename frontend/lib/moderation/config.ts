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
  '0x07AD02e0C1FA0b09fC945ff197E18e9C256838c6',
  '0x2F9e113434aeBDd70bB99cB6505e1F726C578D6d',
  '0xa25211B64D041F690C0c818183E32f28ba9647Dd',
  '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB',
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
