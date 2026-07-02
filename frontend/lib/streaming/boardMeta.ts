import { kv } from '@vercel/kv'
import type { Vertical } from '@/lib/strategy'

// Streaming boards are vertical-agnostic on-chain (one factory). The placement (which vertical listing
// the board belongs to) is stored off-chain here, mirroring how github/open-internet metadata is kept.
export interface StreamingBoardMeta {
  vertical: Vertical
  name?: string
}

const key = (addr: string) => `streaming:board:${addr.toLowerCase()}`

export async function getStreamingBoardMeta(address: string): Promise<StreamingBoardMeta | null> {
  const raw = await kv.get(key(address))
  if (!raw) return null
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as StreamingBoardMeta
}

export async function setStreamingBoardMeta(address: string, meta: StreamingBoardMeta): Promise<void> {
  await kv.set(key(address), meta)
}
