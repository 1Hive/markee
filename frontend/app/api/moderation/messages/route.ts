// GET /api/moderation/messages?moderator=0x..&page=0
//   The unflagged messages on the boards this wallet moderates, for the Creator Hub's "Visible" list,
//   one page at a time. Ordered by rank so each board's winning message comes first, then its runners
//   up. Only the page's own messages are read from chain.
//   → { total, page, pageSize, items: [{ markee, board, boardName, rank, message, name, author }] }

import { NextRequest, NextResponse } from 'next/server'
import { parseAbi, type Address } from 'viem'
import { ADDRESS_PATTERN, type VisibleMessage } from '@/lib/moderation/queue'
import { flagKey, getModerationClient, listModeratedBoards, readAllFlagged } from '@/lib/moderation/server'
import { BOARD_MESSAGE_LIMIT } from '@/lib/streaming/listing'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10
const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])
const MARKEE_ABI = parseAbi([
  'function message() view returns (string)',
  'function name() view returns (string)',
  'function owner() view returns (address)',
])
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export async function GET(req: NextRequest) {
  const moderator = req.nextUrl.searchParams.get('moderator')?.toLowerCase()
  if (!moderator || !ADDRESS_PATTERN.test(moderator)) {
    return NextResponse.json({ error: 'Missing or invalid moderator address' }, { status: 400 })
  }
  const page = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get('page')) || 0))

  try {
    const [boards, flags] = await Promise.all([listModeratedBoards(), readAllFlagged()])
    const mine = boards.filter(b => b.moderators.includes(moderator))
    if (mine.length === 0) return NextResponse.json({ total: 0, page, pageSize: PAGE_SIZE, items: [] })

    const client = getModerationClient()
    const tops = await client.multicall({
      contracts: mine.map(b => ({ address: b.address as Address, abi: TOP_ABI, functionName: 'getTopMarkees' as const, args: [BigInt(BOARD_MESSAGE_LIMIT)] as const })),
    })
    const hidden = new Set(flags.board)
    const ranked = mine.flatMap((b, i) => {
      const list = (tops[i]?.result?.[0] ?? []) as readonly string[]
      return list
        .map((m, j) => ({ markee: m.toLowerCase(), board: b.address, boardName: b.name, rank: j + 1 }))
        .filter(m => m.markee !== ZERO_ADDRESS && !hidden.has(flagKey(m.markee)))
    }).sort((a, b) => a.rank - b.rank || a.boardName.localeCompare(b.boardName))

    const slice = ranked.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const reads = slice.length
      ? await client.multicall({
          contracts: slice.flatMap(m => (['message', 'name', 'owner'] as const).map(fn => ({ address: m.markee as Address, abi: MARKEE_ABI, functionName: fn }))),
        })
      : []
    const items: VisibleMessage[] = slice.map((m, i) => ({
      ...m,
      message: String(reads[i * 3]?.result ?? ''),
      name: String(reads[i * 3 + 1]?.result ?? ''),
      author: String(reads[i * 3 + 2]?.result ?? '').toLowerCase(),
    }))
    return NextResponse.json({ total: ranked.length, page, pageSize: PAGE_SIZE, items }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[moderation/messages] read failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
