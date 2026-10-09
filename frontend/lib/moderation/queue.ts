export type ModerationStatus = 'pending' | 'approved' | 'flagged'
export type ModerationAction = 'flag' | 'unflag' | 'approve'

// Two independent reviews per message:
//   board -- the board's owner and the moderators they add. Their flags hide the message on every
//            site showing the board (markee.xyz, embeds, integrations).
//   site  -- markee.xyz's global admins. Their flags hide the message on markee.xyz only.
export type ModerationScope = 'board' | 'site'
export const SCOPES: readonly ModerationScope[] = ['board', 'site']

export interface ScopeReview {
  status: ModerationStatus
  reviewedBy: string | null
  reviewedAt: number | null
}

export interface ModerationItem {
  markee: string
  board: string
  kind: 'created' | 'edited'
  message: string
  name: string
  author: string
  // The text a moderator last reviewed, or the text this edit replaced while a review was still owed.
  previousMessage: string | null
  blockNumber: string
  at: number
  reviews: Record<ModerationScope, ScopeReview>
}

export interface MessageObservation {
  markee: string
  board: string
  message: string
  name: string
  author: string
  blockNumber: string
  at: number
}

export interface QueueBoard {
  address: string
  name: string
  platform: string | null
  // The scopes the viewer reviews this board in. Every action on its items applies to all of them.
  scopes: ModerationScope[]
}

export interface QueueResponse {
  boards: QueueBoard[]
  // Waiting on a review in one of the viewer's scopes.
  items: ModerationItem[]
  // Hidden by a flag in one of the viewer's scopes, so it can be reviewed again.
  flagged: ModerationItem[]
}

export const MAX_REVIEW_BATCH = 100
export const MAX_BOARD_MODERATORS = 25

export function reviewMessage(action: ModerationAction, chainId: number | string, markeeIds: string[], timestamp: number): string {
  return `markee-moderation:${action}:${chainId}:${markeeIds.join(',')}:${timestamp}`
}

export function moderatorsMessage(chainId: number | string, board: string, moderators: string[], timestamp: number): string {
  return `markee-moderation:moderators:${chainId}:${board.toLowerCase()}:${moderators.join(',')}:${timestamp}`
}

// Lowercased, deduped and sorted, so the client and the server sign over the same list.
export function normalizeModerators(addresses: string[]): string[] {
  return [...new Set(addresses.map(a => a.trim().toLowerCase()))].sort()
}

export const isPendingIn = (item: ModerationItem, scopes: readonly ModerationScope[]) =>
  scopes.some(s => item.reviews[s].status === 'pending')

export const isFlaggedIn = (item: ModerationItem, scopes: readonly ModerationScope[]) =>
  scopes.some(s => item.reviews[s].status === 'flagged')

// Items stored before reviews were split by scope carry a single status.
export function normalizeItem(raw: ModerationItem | null): ModerationItem | null {
  if (!raw || raw.reviews) return raw
  const legacy = raw as unknown as ScopeReview
  const review = { status: legacy.status, reviewedBy: legacy.reviewedBy ?? null, reviewedAt: legacy.reviewedAt ?? null }
  return { ...raw, reviews: { board: review, site: { ...review } } }
}

// Approval covers specific text, so any change to it owes a fresh review in every scope. An item
// still owed a review keeps the text a moderator last saw, not the intermediate one nobody reviewed.
// Text that was already live before the queue existed starts out approved.
export function observeMessage(
  prev: ModerationItem | null,
  obs: MessageObservation,
  { flagged, preexisting }: { flagged: Record<ModerationScope, boolean>; preexisting: boolean },
): ModerationItem | null {
  if (prev && prev.message === obs.message) return null
  const previousMessage = prev ? (isPendingIn(prev, SCOPES) ? prev.previousMessage : prev.message) : null
  const review = (scope: ModerationScope): ScopeReview => ({
    status: prev ? 'pending' : flagged[scope] ? 'flagged' : preexisting ? 'approved' : 'pending',
    reviewedBy: null,
    reviewedAt: null,
  })
  return {
    ...obs,
    kind: previousMessage === null ? 'created' : 'edited',
    previousMessage,
    reviews: { board: review('board'), site: review('site') },
  }
}

export function reviewItem(
  item: ModerationItem,
  action: ModerationAction,
  reviewer: string,
  now: number,
  scopes: readonly ModerationScope[],
): ModerationItem {
  const reviews = { ...item.reviews }
  scopes.forEach(s => {
    reviews[s] = { status: action === 'flag' ? 'flagged' : 'approved', reviewedBy: reviewer.toLowerCase(), reviewedAt: now }
  })
  return { ...item, reviews }
}
