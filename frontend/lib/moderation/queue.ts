export type ModerationStatus = 'pending' | 'approved' | 'flagged'
export type ModerationAction = 'flag' | 'unflag' | 'approve'
// The queue approves rather than unflags, since approving also settles the item's pending review.
export type QueueAction = Exclude<ModerationAction, 'unflag'>

export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

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
  // The same for the author's display name. Absent on items stored before names were reviewed.
  previousName?: string | null
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

// Each entry in a board's moderator list. The admin optionally supplies an email address when
// adding a moderator; a verification email is sent to confirm it before notifications are sent.
export interface ModeratorEntry {
  wallet: string
  email?: string
}

export function reviewMessage(action: ModerationAction, chainId: number | string, markeeIds: string[], timestamp: number): string {
  return `markee-moderation:${action}:${chainId}:${markeeIds.join(',')}:${timestamp}`
}

// Each entry serializes as "wallet" or "wallet|email". The list must be normalized before signing.
export function moderatorsMessage(chainId: number | string, board: string, moderators: ModeratorEntry[], timestamp: number): string {
  const serialized = moderators.map(m => m.email ? `${m.wallet}|${m.email}` : m.wallet).join(',')
  return `markee-moderation:moderators:${chainId}:${board.toLowerCase()}:${serialized}:${timestamp}`
}

export type EmailFrequency = 'every' | 'daily' | 'off'
export const EMAIL_FREQUENCIES: EmailFrequency[] = ['every', 'daily', 'off']

// Signed by the moderator themselves to update their own notification frequency preference.
export function notifyFreqMessage(chainId: number | string, wallet: string, frequency: EmailFrequency, timestamp: number): string {
  return `markee-moderation:notify-freq:${chainId}:${wallet.toLowerCase()}:${frequency}:${timestamp}`
}

// Which emails a wallet gets: moderation queue activity, its messages starting or stopping winning,
// and its stream balance running under a day. All on until switched off in Settings.
export interface NotifyEvents { mod: boolean; status: boolean; budget: boolean }
export const NOTIFY_EVENTS: (keyof NotifyEvents)[] = ['mod', 'status', 'budget']

export function notifyEventsOf(state: { events?: Partial<NotifyEvents> } | null | undefined): NotifyEvents {
  return { mod: true, status: true, budget: true, ...state?.events }
}

// Signed to set frequency and events together (Settings' Save); the frequency-only message above is
// kept for older clients.
export function notifyPrefsMessage(chainId: number | string, wallet: string, frequency: EmailFrequency, events: NotifyEvents, timestamp: number): string {
  const flags = NOTIFY_EVENTS.map(k => `${k}=${events[k] ? 1 : 0}`).join(',')
  return `markee-moderation:notify-prefs:${chainId}:${wallet.toLowerCase()}:${frequency}:${flags}:${timestamp}`
}

// Signed by the moderator to unsubscribe (remove their notify state entirely).
export function notifyEmailMessage(chainId: number | string, wallet: string, email: string, timestamp: number): string {
  return `markee-moderation:notify-email:${chainId}:${wallet.toLowerCase()}:${email.toLowerCase()}:${timestamp}`
}

// Lowercased, deduped and sorted by wallet, so the client and the server sign over the same list.
// Accepts raw strings (wallet-only, legacy) or {wallet, email?} objects.
export function normalizeModerators(raw: unknown[]): ModeratorEntry[] {
  const seen = new Map<string, string | undefined>()
  for (const item of raw) {
    if (typeof item === 'string') {
      const w = item.trim().toLowerCase()
      if (w && !seen.has(w)) seen.set(w, undefined)
    } else if (item && typeof item === 'object') {
      const obj = item as { wallet?: unknown; email?: unknown }
      const w = typeof obj.wallet === 'string' ? obj.wallet.trim().toLowerCase() : ''
      const e = typeof obj.email === 'string' ? obj.email.trim().toLowerCase() || undefined : undefined
      if (w && !seen.has(w)) seen.set(w, e)
    }
  }
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wallet, email]) => (email ? { wallet, email } : { wallet }))
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

// Approval covers specific text and name, so any change to either owes a fresh review in every scope. An item
// still owed a review keeps the text a moderator last saw, not the intermediate one nobody reviewed.
// Text that was already live before the queue existed starts out approved.
export function observeMessage(
  prev: ModerationItem | null,
  obs: MessageObservation,
  { flagged, preexisting }: { flagged: Record<ModerationScope, boolean>; preexisting: boolean },
): ModerationItem | null {
  if (prev && prev.message === obs.message && prev.name === obs.name) return null
  const owed = prev && isPendingIn(prev, SCOPES)
  const previousMessage = prev ? (owed ? prev.previousMessage : prev.message) : null
  const previousName = prev ? (owed ? prev.previousName ?? prev.name : prev.name) : null
  const review = (scope: ModerationScope): ScopeReview => ({
    status: prev ? 'pending' : flagged[scope] ? 'flagged' : preexisting ? 'approved' : 'pending',
    reviewedBy: null,
    reviewedAt: null,
  })
  return {
    ...obs,
    kind: previousMessage === null ? 'created' : 'edited',
    previousMessage,
    previousName,
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
