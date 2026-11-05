import { kv } from '@vercel/kv'
import { softRecords } from './automatic'
import { listModeratedBoards, readItems, readAllFlagged } from './server'

export const queueDeps = { listModeratedBoards, readItems, readAllFlagged, softRecords, pipeline: () => kv.pipeline() }
