export type ReceiptPoll =
  | { kind: 'receipt'; status: 'success' | 'reverted' }
  | { kind: 'pending' }
  | { kind: 'unseen' }
  | { kind: 'error' }

// There is deliberately no 'dropped' outcome. A hash the RPC can't see is not proof the transaction
// was dropped: Base's sequencer mempool is private, so public nodes often can't see a valid pending
// tx, and relayed (sponsored) sends can be invisible for a while. Calling it dropped told the user
// nothing was charged and lifted the duplicate-payment guard, so a second payment could follow a
// first one that then confirmed. A long-unseen hash becomes 'unknown' instead, and only the user
// clears it after checking Basescan (PendingPaymentNotice).
export type ReceiptOutcome = 'confirming' | 'unknown' | 'confirmed' | 'reverted'

export interface ReceiptTracking {
  outcome: ReceiptOutcome
  unseenSince?: number
  failingSince?: number
}

export const UNSEEN_UNKNOWN_AFTER_MS = 120_000
export const UNKNOWN_AFTER_MS = 20_000

export function nextTracking(prev: ReceiptTracking, poll: ReceiptPoll, now: number): ReceiptTracking {
  if (prev.outcome === 'confirmed' || prev.outcome === 'reverted') return prev
  if (poll.kind === 'receipt') return { outcome: poll.status === 'success' ? 'confirmed' : 'reverted' }
  if (poll.kind === 'pending') return { outcome: 'confirming' }
  if (poll.kind === 'unseen') {
    const unseenSince = prev.unseenSince ?? now
    return { outcome: now - unseenSince >= UNSEEN_UNKNOWN_AFTER_MS ? 'unknown' : 'confirming', unseenSince }
  }
  const failingSince = prev.failingSince ?? now
  return { outcome: now - failingSince >= UNKNOWN_AFTER_MS ? 'unknown' : prev.outcome, unseenSince: prev.unseenSince, failingSince }
}
