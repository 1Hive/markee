export type ModerationStatus = 'pending' | 'approved' | 'flagged'
export type ModerationAction = 'flag' | 'unflag' | 'approve'

export interface ModerationItem {
  markee: string
  board: string
  status: ModerationStatus
  kind: 'created' | 'edited'
  message: string
  name: string
  author: string
  // The text a moderator last reviewed, or the text this edit replaced while a review was still owed.
  previousMessage: string | null
  blockNumber: string
  txHash: string
  at: number
  reviewedBy: string | null
  reviewedAt: number | null
}

export interface MessageObservation {
  markee: string
  board: string
  message: string
  name: string
  author: string
  blockNumber: string
  txHash: string
  at: number
}

export interface QueueBoard {
  address: string
  name: string
  platform: string | null
}

export interface QueueResponse {
  boards: QueueBoard[]
  items: ModerationItem[]
}

export const QUEUE_SESSION_TTL_SECONDS = 24 * 60 * 60
export const MAX_REVIEW_BATCH = 100

export function queueSessionMessage(moderator: string, timestamp: number): string {
  return `markee-moderation:queue:${moderator.toLowerCase()}:${timestamp}`
}

export function reviewMessage(action: ModerationAction, chainId: number | string, markeeIds: string[], timestamp: number): string {
  return `markee-moderation:${action}:${chainId}:${markeeIds.join(',')}:${timestamp}`
}

// Approval covers specific text, so any change to it owes a fresh review. An item that was still
// pending keeps the text a moderator last saw, not the intermediate one nobody reviewed.
export function observeMessage(prev: ModerationItem | null, obs: MessageObservation, alreadyFlagged: boolean): ModerationItem | null {
  if (prev && prev.message === obs.message) return null
  const previousMessage = prev ? (prev.status === 'pending' ? prev.previousMessage : prev.message) : null
  return {
    ...obs,
    status: !prev && alreadyFlagged ? 'flagged' : 'pending',
    kind: previousMessage === null ? 'created' : 'edited',
    previousMessage,
    reviewedBy: null,
    reviewedAt: null,
  }
}

export function reviewItem(item: ModerationItem, action: ModerationAction, reviewer: string, now: number): ModerationItem {
  return {
    ...item,
    status: action === 'flag' ? 'flagged' : 'approved',
    reviewedBy: reviewer.toLowerCase(),
    reviewedAt: now,
  }
}
