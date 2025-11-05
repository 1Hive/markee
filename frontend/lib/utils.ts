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
  return (Number(wei) / 1e18).toFixed(4)
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
