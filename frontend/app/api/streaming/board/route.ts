// GET /api/streaming/board?board=0x...[&fresh=1]
// A streaming (For Rent) board's metadata and ranked markees, read on the server and shared by every
// viewer through the snapshot cache (30 s fresh). ?fresh=1 is for post-transaction refreshes and is
// rate-limited per IP. During an RPC outage the last good payload is served with stale: true.
// The page size is fixed (BOARD_MESSAGE_LIMIT) so callers cannot multiply cache entries per board.
import { NextRequest, NextResponse } from 'next/server'
import { isAddress, type Address } from 'viem'
import { cachedChainRead } from '@/lib/server/cachedChainRead'
import { loadStreamingBoard } from '@/lib/streaming/boardSnapshot'
import { BOARD_MESSAGE_LIMIT } from '@/lib/streaming/listing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const board = params.get('board')?.toLowerCase().trim()
  if (!board || !isAddress(board)) {
    return NextResponse.json({ error: 'Valid board address is required' }, { status: 400 })
  }
  return cachedChainRead(request, {
    scope: 'streaming-board',
    key: board,
    load: () => loadStreamingBoard(board as Address, BOARD_MESSAGE_LIMIT),
  })
}
