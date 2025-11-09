// lib/analytics.ts
'use client'

import { track } from '@vercel/analytics'

// Local storage keys
const MESSAGE_VIEWS_KEY = 'markee_message_views'
const MARKEE_VIEWS_KEY = 'markee_total_views'

interface ViewData {
  [markeeAddress: string]: number
}

interface MessageViewData {
  [messageHash: string]: number // hash of markee address + message
}

// Simple hash function for message tracking
function hashMessage(markeeAddress: string, message: string): string {
  return `${markeeAddress}:${message.substring(0, 50)}` // Use first 50 chars
}

// Get views from localStorage
export function getMessageViews(): MessageViewData {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(MESSAGE_VIEWS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getTotalViews(): ViewData {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(MARKEE_VIEWS_KEY) || '{}')
  } catch {
    return {}
  }
}

// Track a markee view
export function trackMarkeeView(
  markeeAddress: string,
  message: string,
  rank: number,
  chainId: number
) {
  if (typeof window === 'undefined') return

  const messageHash = hashMessage(markeeAddress, message)

  // Update message-specific views
  const messageViews = getMessageViews()
  messageViews[messageHash] = (messageViews[messageHash] || 0) + 1
  localStorage.setItem(MESSAGE_VIEWS_KEY, JSON.stringify(messageViews))

  // Update total markee views
  const totalViews = getTotalViews()
  totalViews[markeeAddress] = (totalViews[markeeAddress] || 0) + 1
  localStorage.setItem(MARKEE_VIEWS_KEY, JSON.stringify(totalViews))

  // Track in Vercel Analytics
  track('markee_view', {
    markee_address: markeeAddress,
    rank,
    chain_id: chainId,
    message_length: message.length,
    has_name: message.includes('|') // or however you distinguish
  })
}

// Get view count for a specific message
export function getViewCount(markeeAddress: string, message: string): number {
  const messageHash = hashMessage(markeeAddress, message)
  const views = getMessageViews()
  return views[messageHash] || 0
}

// Get total view count for a markee (across all messages)
export function getTotalViewCount(markeeAddress: string): number {
  const views = getTotalViews()
  return views[markeeAddress] || 0
}

// Reset all views (for testing)
export function resetViews() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(MESSAGE_VIEWS_KEY)
  localStorage.removeItem(MARKEE_VIEWS_KEY)
}

// Export aggregated stats for display
export function getMarkeeStats(markeeAddress: string, message: string) {
  return {
    messageViews: getViewCount(markeeAddress, message),
    totalViews: getTotalViewCount(markeeAddress)
  }
}
