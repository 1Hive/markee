import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from 'viem'

export interface SyncRecord { signature: string; at: number }
export interface SyncFileResult { repoFullName: string; filePath: string; success: boolean; unchanged?: boolean; error?: string; permanent?: boolean }

export const RESYNC_AFTER_MS = 24 * 60 * 60_000
export const FAILED_RETRY_MS = 6 * 60 * 60_000
export const syncFailedKey = (board: string) => `github:sync-failed:${board.toLowerCase()}`

/**
 * Whether the GitHub sync cron should write a board's billboard this run.
 * - 'unchanged': the last successful sync has this billboard and is under a day old.
 * - 'backoff': the last attempt with this same billboard failed for a reason that won't fix
 *   itself; a new message or price (a different signature) retries at once.
 */
export function syncDecision(signature: string, previous: SyncRecord | null, lastFailure: SyncRecord | null, now = Date.now()): 'sync' | 'unchanged' | 'backoff' {
  if (previous?.signature === signature && now - previous.at < RESYNC_AFTER_MS) return 'unchanged'
  if (lastFailure?.signature === signature && now - lastFailure.at < FAILED_RETRY_MS) return 'backoff'
  return 'sync'
}

/** GitHub statuses that mean the link itself is broken (no access, missing file), not a blip. */
export const isPermanentGitHubStatus = (status: number) => status === 401 || status === 404

/**
 * Back off only when every failed file failed for a lasting reason (no GitHub connection,
 * invalid repo, no access, missing delimiters). A GitHub 5xx, 409, rate limit or network error
 * right after a purchase must be retried on the next run, not 6 hours later.
 */
export function shouldBackOff(results: readonly SyncFileResult[]): boolean {
  const failed = results.filter(r => !r.success)
  return failed.length > 0 && failed.every(r => r.permanent === true)
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
