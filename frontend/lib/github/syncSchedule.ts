export interface SyncRecord { signature: string; at: number }

export const RESYNC_AFTER_MS = 24 * 60 * 60_000
export const FAILED_RETRY_MS = 6 * 60 * 60_000

/**
 * Whether the GitHub sync cron should write a board's billboard this run.
 * - 'unchanged': the last successful sync has this billboard and is under a day old.
 * - 'backoff': the last attempt with this same billboard failed recently; a new message or
 *   price (a different signature) retries at once.
 */
export function syncDecision(signature: string, previous: SyncRecord | null, lastFailure: SyncRecord | null, now = Date.now()): 'sync' | 'unchanged' | 'backoff' {
  if (previous?.signature === signature && now - previous.at < RESYNC_AFTER_MS) return 'unchanged'
  if (lastFailure?.signature === signature && now - lastFailure.at < FAILED_RETRY_MS) return 'backoff'
  return 'sync'
}
