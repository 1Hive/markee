export const ALL_EMOJIS = ['❤️', '👍', '👎', '💯', '😂', '🎉', '😮', '💩', '😠', '🚀', '👑', '🤔', '🪧'] as const
export const REACTION_CHAIN_ID = 8453
export const REACTION_SIGNATURE_TTL = 300

export type ReactionAction = 'react' | 'remove'

export function isReactionEmoji(value: unknown): value is typeof ALL_EMOJIS[number] {
  return typeof value === 'string' && (ALL_EMOJIS as readonly string[]).includes(value)
}

export function reactionMessage(action: ReactionAction, markee: string, emoji: string, timestamp: number): string {
  return `markee-reaction:v1:${JSON.stringify([action, REACTION_CHAIN_ID, markee.toLowerCase(), action === 'react' ? emoji : '', timestamp])}`
}
