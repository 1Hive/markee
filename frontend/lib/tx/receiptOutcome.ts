export type ReceiptPoll =
  | { kind: 'receipt'; status: 'success' | 'reverted' }
  | { kind: 'pending' }
  | { kind: 'unseen' }
  | { kind: 'error' }

export type ReceiptOutcome = 'confirming' | 'unknown' | 'confirmed' | 'reverted' | 'dropped'

export interface ReceiptTracking {
  outcome: ReceiptOutcome
  unseenSince?: number
  failingSince?: number
}

export const DROPPED_AFTER_MS = 120_000
export const UNKNOWN_AFTER_MS = 20_000

export function nextTracking(prev: ReceiptTracking, poll: ReceiptPoll, now: number): ReceiptTracking {
  if (prev.outcome === 'confirmed' || prev.outcome === 'reverted' || prev.outcome === 'dropped') return prev
  if (poll.kind === 'receipt') return { outcome: poll.status === 'success' ? 'confirmed' : 'reverted' }
  if (poll.kind === 'pending') return { outcome: 'confirming' }
  if (poll.kind === 'unseen') {
    const unseenSince = prev.unseenSince ?? now
    return { outcome: now - unseenSince >= DROPPED_AFTER_MS ? 'dropped' : 'confirming', unseenSince }
  }
  const failingSince = prev.failingSince ?? now
  return { outcome: now - failingSince >= UNKNOWN_AFTER_MS ? 'unknown' : prev.outcome, unseenSince: prev.unseenSince, failingSince }
}
