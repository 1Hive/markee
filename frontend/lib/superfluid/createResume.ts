import type { Address } from 'viem'

export interface CreatedMarkee { markee: Address; pool: Address; owner: string; message: string }

export type CreateStep = 'create' | 'update' | 'reuse'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export const resumeKey = (board: string, owner: string) => `markee:stream-create:v1:${board.toLowerCase()}:${owner.toLowerCase()}`

export function loadCreated(board: string, owner: string): CreatedMarkee | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(resumeKey(board, owner)) || 'null') as CreatedMarkee | null
    return saved && ADDRESS_RE.test(saved.markee) && ADDRESS_RE.test(saved.pool) && typeof saved.message === 'string'
      ? { ...saved, owner: owner.toLowerCase() } : null
  } catch { return null }
}

export function saveCreated(board: string, created: CreatedMarkee) {
  try { window.localStorage.setItem(resumeKey(board, created.owner), JSON.stringify(created)) } catch { /* Resume falls back to this session only. */ }
}

export function clearCreated(board: string, owner: string) {
  try { window.localStorage.removeItem(resumeKey(board, owner)) } catch { /* Nothing to clear. */ }
}

export function planCreateStep(created: CreatedMarkee | null, message: string): CreateStep {
  if (!created) return 'create'
  return created.message === message ? 'reuse' : 'update'
}
