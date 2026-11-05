export type ModerationSeverity = 'relaxed' | 'standard' | 'strict'
export function moderationSeverity(value: unknown): ModerationSeverity {
  if (value === undefined) return 'standard'
  if (value === 'relaxed' || value === 'standard' || value === 'strict') return value
  throw new Error('Invalid moderation severity')
}
