import { normalize } from 'viem/ens'

// Shared by the server rules and the browser, so it must stay free of server-only imports.

// Compare a copy only; original on-chain text and its hash remain untouched.
export const ruleText = (text: string) => text.normalize('NFKC').replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').replace(/\s+/g, ' ')

export const FULL_ADDRESS = /\b0x[0-9a-f]{40}(?![0-9a-f])/i
// The shortened form signs display (0x1234…abcd), the most convincing one to fake.
export const SHORT_ADDRESS = /\b0x[0-9a-f]{4,38}(?:\.{2,3}|…)[0-9a-f]{4,38}(?![0-9a-f])/i

export function ensTarget(text: string) {
  // ENS permits names (including emoji) that are not ordinary DNS hostnames.
  for (const match of text.matchAll(/(?:[\p{L}\p{N}\p{M}\p{Extended_Pictographic}️‍_-]+\.)+eth\b/giu)) {
    try { normalize(match[0]); return true } catch { /* Invalid names are not validated ENS targets. */ }
  }
  return false
}

/**
 * Whether a display name could pass as a wallet identity other than the author's own: any ENS name, or
 * an address (full or shortened) that is not the Markee owner's. A name is free text its author sets,
 * so a sign showing "vitalik.eth" or "0xd8dA…6045" would claim the message came from that wallet.
 * The author's own address is allowed; an ENS name is withheld even when it is theirs, since that
 * would need a resolution this check does not make.
 */
export function impersonatesWallet(name: string, owner?: string | null): boolean {
  const text = ruleText(name)
  if (ensTarget(text)) return true
  const own = owner?.toLowerCase()
  for (const [address] of text.matchAll(new RegExp(FULL_ADDRESS.source, 'gi'))) {
    if (address.toLowerCase() !== own) return true
  }
  for (const [short] of text.matchAll(new RegExp(SHORT_ADDRESS.source, 'gi'))) {
    const [head, tail] = short.toLowerCase().slice(2).split(/\.{2,3}|…/)
    if (!own || !own.slice(2).startsWith(head) || !own.endsWith(tail)) return true
  }
  return false
}

/** The author name to show: the name itself, or '' when it is withheld so the caller shows the owner's address. */
export function authorName(name: string | null | undefined, owner?: string | null): string {
  return name && !impersonatesWallet(name, owner) ? name : ''
}
