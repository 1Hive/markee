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
import { readRateLimited } from '@/lib/rate-limit'
import { isPlaceholderMarkee } from '@/lib/leaderboards/placeholder'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10
const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])
const MARKEE_ABI = parseAbi([
  'function message() view returns (string)',
  'function name() view returns (string)',
  'function owner() view returns (address)',
  'function totalFundsAdded() view returns (uint256)',
])
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export async function GET(req: NextRequest) {
  const moderator = req.nextUrl.searchParams.get('moderator')?.toLowerCase()
  if (!moderator || !ADDRESS_PATTERN.test(moderator)) {
    return NextResponse.json({ error: 'Missing or invalid moderator address' }, { status: 400 })
  }
  const page = Math.min(1_000, Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get('page')) || 0)))
  if (await readRateLimited(req, 'moderation-messages', 60)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 })
  }

  try {
    const [boards, flags] = await Promise.all([listModeratedBoards(), readAllFlagged()])
    const mine = boards.filter(b => b.moderators.includes(moderator))
    if (mine.length === 0) return NextResponse.json({ total: 0, page, pageSize: PAGE_SIZE, items: [] })

    const client = getModerationClient()
    const tops = await client.multicall({
      contracts: mine.map(b => ({ address: b.address as Address, abi: TOP_ABI, functionName: 'getTopMarkees' as const, args: [BigInt(BOARD_MESSAGE_LIMIT)] as const })),
    })
    const hidden = new Set(flags.board)
    const listed = mine.flatMap((b, i) => {
      const list = (tops[i]?.result?.[0] ?? []) as readonly string[]
      const values = (tops[i]?.result?.[1] ?? []) as readonly bigint[]
      return list
        .map((m, j) => ({ markee: m.toLowerCase(), board: b.address, boardName: b.name, rank: j + 1, value: values[j] ?? 0n }))
        .filter(m => m.markee !== ZERO_ADDRESS)
    })
    // Entries ranked at zero are read up front so the board's empty seed Markee never takes a page slot.
    // On streaming boards the ranked value is the current rate, so a funded Markee whose stream stopped
    // also ranks at zero: lifetime funds tell it apart from the seed.
    const unfunded = listed.filter(m => m.value === 0n)
    const unfundedReads = unfunded.length
      ? await client.multicall({
          contracts: unfunded.flatMap(m => (['message', 'totalFundsAdded'] as const).map(fn => ({ address: m.markee as Address, abi: MARKEE_ABI, functionName: fn }))),
        })
      : []
    const placeholders = new Set(unfunded.filter((m, i) => {
      const [message, funds] = [unfundedReads[i * 2], unfundedReads[i * 2 + 1]]
      return message?.status === 'success' && funds?.status === 'success'
        && isPlaceholderMarkee({ message: String(message.result), totalFunds: funds.result as bigint })
    }).map(m => m.markee))
    const boardRank = new Map<string, number>()
    const ranked = listed
      .filter(m => !placeholders.has(m.markee))
      .map(m => {
        const rank = (boardRank.get(m.board) ?? 0) + 1
        boardRank.set(m.board, rank)
        return { markee: m.markee, board: m.board, boardName: m.boardName, rank }
      })
      .filter(m => !hidden.has(flagKey(m.markee)))
      .sort((a, b) => a.rank - b.rank || a.boardName.localeCompare(b.boardName))

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
