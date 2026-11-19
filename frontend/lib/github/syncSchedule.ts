import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from 'viem'

export interface SyncRecord { signature: string; at: number }
export interface SyncFileResult { repoFullName: string; filePath: string; success: boolean; unchanged?: boolean; error?: string; permanent?: boolean }

export const RESYNC_AFTER_MS = 24 * 60 * 60_000
export const FAILED_RETRY_MS = 6 * 60 * 60_000
export const syncFailedKey = (board: string) => `github:sync-failed:${board.toLowerCase()}`

/**
 * Whether the GitHub sync cron should write a board's billboard this run: 'unchanged' when the last
 * successful sync has this billboard and is under a day old.
 */
export function syncDecision(signature: string, previous: SyncRecord | null, now = Date.now()): 'sync' | 'unchanged' {
  return previous?.signature === signature && now - previous.at < RESYNC_AFTER_MS ? 'unchanged' : 'sync'
}

/**
 * Whether a board is backing off after a sync that failed for a lasting reason. The cron checks this
 * before reading the board from the chain, so a broken link costs no RPC until FAILED_RETRY_MS
 * passes. A new message doesn't end the backoff: these failures are about the file (missing
 * delimiters, no access), not the billboard. Changing the board's links (saveLinkedFiles) or any
 * successful sync, such as the manual update-markee-file route, clears it.
 */
export function inBackoff(lastFailure: SyncRecord | null, now = Date.now()): boolean {
  return !!lastFailure && now - lastFailure.at < FAILED_RETRY_MS
}

/**
 * A GitHub rate limit, which passes on its own. GitHub answers both rate limits and refused access
 * with 403; a rate limit carries Retry-After (secondary limits) or X-RateLimit-Remaining: 0 (primary),
 * and says "rate limit" in its message.
 */
export function isGitHubRateLimited(status: number, headers: Pick<Headers, 'get'>, body = ''): boolean {
  if (status === 429) return true
  if (status !== 403) return false
  return headers.get('retry-after') !== null || headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(body)
}

/**
 * GitHub failures that mean the link itself is broken, not a blip: expired access (401), a missing
 * file or repo (404), or refused access (a 403 that isn't a rate limit, e.g. no push access).
 */
export function isPermanentGitHubFailure(status: number, headers: Pick<Headers, 'get'>, body = ''): boolean {
  if (status === 401 || status === 404) return true
  return status === 403 && !isGitHubRateLimited(status, headers, body)
}

/**
 * What the cron does after syncing a board's files.
 * - 'synced': every file is current, so the board isn't synced again until its billboard changes or
 *   a day passes.
 * - 'retry': a file failed for a reason that may pass (GitHub 5xx, 409, rate limit, network error),
 *   so the board is synced again on the next run, even if other files worked.
 * - 'backoff': every failure is lasting (no GitHub connection, invalid repo, no access, missing
 *   delimiters), so the same billboard isn't retried for FAILED_RETRY_MS. Files that worked are
 *   already current.
 */
export function boardSyncResult(results: readonly SyncFileResult[]): 'synced' | 'retry' | 'backoff' {
  const failed = results.filter(r => !r.success)
  if (results.length > 0 && failed.length === 0) return 'synced'
  return failed.length > 0 && failed.every(r => r.permanent === true) ? 'backoff' : 'retry'
}

/**
 * The last sync of each linked GitHub file, shown per embed in the Manage drawer: one hash per board,
 * field = the file's integration key (lib/integrations/featured.ts fileIntegrationKey).
 */
export const fileSyncKey = (board: string) => `github:file-sync:${board.toLowerCase()}`

export interface FileSyncStatus {
  ok: boolean
  /** Unix ms of the attempt. */
  at: number
  error?: string
  /** A failure that won't fix itself: the owner has to act (reconnect, add delimiters, restore access). */
  permanent?: boolean
}

export function fileSyncStatus(result: SyncFileResult, at: number): FileSyncStatus {
  return result.success ? { ok: true, at } : { ok: false, at, error: result.error ?? 'Sync failed', permanent: result.permanent === true }
}

/**
 * A read reverted or hit an address with no such function, as opposed to a failed RPC request.
 *
 * viem also reports an RPC internal error (-32603) that has a message as ContractFunctionRevertedError,
 * so that class alone can't tell a transient Alchemy failure from a real revert. A real revert carries
 * revert data (`raw`; '0x' through the multicall batch) or the node's "execution reverted" reason; an
 * internal error has neither, only its own message as the reason.
 */
export function isMissingFunction(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false
  if (error.walk(cause => cause instanceof ContractFunctionZeroDataError)) return true
  const reverted = error.walk(cause => cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
  return !!reverted && (reverted.raw !== undefined || /revert/i.test(reverted.reason ?? ''))
}
