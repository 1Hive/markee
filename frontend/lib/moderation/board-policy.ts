import 'server-only'
import { kv } from '@vercel/kv'
import { versionedModerationPolicy, type ModerationSeverity } from './severity'

export const boardPolicyKey = (board: string) => `moderation:board-policy:8453:${board.toLowerCase()}`

export const boardPolicyDeps = {
  get: (key: string) => kv.get<{ policy: unknown; updatedAt: number }>(key),
  set: (key: string, value: { policy: unknown; updatedAt: number }) => kv.set(key, value),
}

/** A saved board policy takes precedence over settings embedded in older host apps. */
export async function boardModerationPolicy(board: string | null | undefined, policy?: unknown, severity?: unknown, rules?: unknown): Promise<ModerationSeverity> {
  const requested = versionedModerationPolicy(policy, severity, rules)
  if (!board) return requested
  const saved = await boardPolicyDeps.get(boardPolicyKey(board))
  return saved ? versionedModerationPolicy(saved.policy) : requested
}
