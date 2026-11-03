import { kv } from '@vercel/kv'
import { authorizedScopes, readItems, readAllFlagged } from './server'
import { underRateLimit } from '../rate-limit'

export const moderationWriteDeps = {
  authorizedScopes, readItems, readAllFlagged, underRateLimit,
  pipeline: () => kv.pipeline(),
}
