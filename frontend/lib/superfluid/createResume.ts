import type { Address } from 'viem'

// `streamHash` is set once the stream-opening tx for this markee has been submitted. A later attempt
// must check it: if it confirmed, this markee is already backed and in use, so a new message has to
// create a new markee instead of editing (and taking over) this one.
export interface CreatedMarkee { markee: Address; pool: Address; owner: string; message: string; streamHash?: `0x${string}` }

export type CreateStep = 'create' | 'update' | 'reuse'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HASH_RE = /^0x[0-9a-fA-F]{64}$/

export const resumeKey = (board: string, owner: string) => `markee:stream-create:v1:${board.toLowerCase()}:${owner.toLowerCase()}`

export function loadCreated(board: string, owner: string): CreatedMarkee | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(resumeKey(board, owner)) || 'null') as CreatedMarkee | null
    if (!(saved && ADDRESS_RE.test(saved.markee) && ADDRESS_RE.test(saved.pool) && typeof saved.message === 'string')) return null
    const { streamHash, ...rest } = saved
    return { ...rest, owner: owner.toLowerCase(), ...(typeof streamHash === 'string' && HASH_RE.test(streamHash) ? { streamHash } : {}) }
  } catch { return null }
}

export function saveCreated(board: string, created: CreatedMarkee) {
  try { window.localStorage.setItem(resumeKey(board, created.owner), JSON.stringify(created)) } catch { /* Resume falls back to this session only. */ }
}

export function clearCreated(board: string, owner: string) {
  try { window.localStorage.removeItem(resumeKey(board, owner)) } catch { /* Nothing to clear. */ }
}

// What a saved markee's already-submitted stream means for the next attempt:
// - 'taken':     the stream confirmed, so the markee is backed. Start a new markee.
// - 'reusable':  the stream reverted, so the markee is still unbacked. Reuse it.
// - 'in-flight': no receipt yet and the payment is still tracked. Block until it resolves; reusing
//                or editing the markee now could be overtaken by that stream confirming.
// - 'abandoned': no receipt and no longer tracked (the user dismissed it as never sent, or it aged
//                out). Start a new markee rather than editing this one, in case it lands later.
export type PriorStream = 'taken' | 'reusable' | 'in-flight' | 'abandoned'

export function classifyPriorStream(receipt: 'success' | 'reverted' | null, stillTracked: boolean): PriorStream {
  if (receipt === 'success') return 'taken'
  if (receipt === 'reverted') return 'reusable'
  return stillTracked ? 'in-flight' : 'abandoned'
}

export function planCreateStep(created: CreatedMarkee | null, message: string): CreateStep {
  if (!created) return 'create'
  return created.message === message ? 'reuse' : 'update'
}
