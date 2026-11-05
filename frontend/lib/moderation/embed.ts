import 'server-only'
import { autoEnabled, checkPublished, contentHash } from './automatic'
import { flagKey, readAllFlagged } from './server'

export const embedModerationDeps = { flags: readAllFlagged, checkPublished }
export async function moderateEmbed<T extends { topMarkeeAddress: string | null; message: string; name: string; flagged: boolean }>(payload: T) {
  if (!payload.topMarkeeAddress) return payload
  try {
    const { board } = await embedModerationDeps.flags()
    if (board.includes(flagKey(payload.topMarkeeAddress))) return { ...payload, flagged: true, message: '', name: '' }
    if (autoEnabled()) {
      const [verdict] = await embedModerationDeps.checkPublished([payload.topMarkeeAddress])
      if (!verdict || verdict.state === 'unavailable' || verdict.contentHash !== contentHash(payload.message)) throw new Error('No current moderation verdict')
      if (verdict.state !== 'visible') return { ...payload, flagged: true, message: '', name: '' }
    }
    return payload
  } catch {
    // Keep the legacy hidden-content field true; unavailable is never a passing verdict.
    return { ...payload, flagged: true, message: '', name: '', moderationUnavailable: true }
  }
}
