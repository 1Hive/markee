import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Markee } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatEth(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(3)
}

export function formatUsd(usd: number): string {
  if (usd >= 10000) return `$${Math.round(usd).toLocaleString()}`
  if (usd >= 100) return `$${usd.toFixed(0)}`
  return `$${usd.toFixed(2)}`
}

/**
 * Get display name with priority: Custom Name > ENS > Formatted Address
 */
export function getDisplayName(markee: Markee, ensName?: string | null): string {
  // Priority 1: Custom name
  if (markee.name && markee.name.trim()) {
    return markee.name
  }
  
  // Priority 2: ENS name
  if (ensName) {
    return ensName
  }
  
  // Priority 3: Shortened address
  return formatAddress(markee.owner)
}

// ETH held back from "max" spend calculations so the user can still pay gas for the transaction
// they are about to send.
export const FAST_TX_GAS_RESERVE = 200000000000000n // 0.0002 ETH

export function logoDevUrl(domain: string, size = 32): string {
  return `https://img.logo.dev/${domain}?token=pk_V2lLjqQVQHahGBEhZYWN0g&size=${size}`
}

// Compact MARKEE token amounts. Small values keep enough decimals to stay non-zero.
export function formatMarkeeAmount(n: number): string {
  if (n >= 999_999e12) return '>999,999T'
  if (n >= 1e12) return `${(n / 1e12).toFixed(3)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(3)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)}M`
  if (n > 0 && n < 10) {
    let decimals = 3
    while (decimals < 12 && Number(n.toFixed(decimals)) === 0) decimals++
    if (decimals > 3) decimals = Math.min(decimals + 2, 12)
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// Shared by /api/views and its callers so the client never builds a query string the route would
// truncate anyway. 100 addresses is ~4.3KB of URL, well inside what CDNs will carry.
export const VIEWS_ADDRESS_LIMIT = 100
