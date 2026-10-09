// GET  /api/moderation/moderators?board=0x...
//   Who moderates a board: its owners (on-chain admin and creator, always moderators) and the
//   moderators they added. Public and CORS-open so any site showing the board can read it.
//
// POST /api/moderation/moderators
//   { board, moderators: string[], owner, signature, timestamp }
//   Replaces the board's added moderators. Only an owner can sign it. The signature covers
//   moderatorsMessage(8453, board, normalizeModerators(moderators), timestamp).

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import { MAX_BOARD_MODERATORS, moderatorsMessage, normalizeModerators } from '@/lib/moderation/queue'
import { moderatorsKey, readBoardModerators, readBoardOwners, type BoardModerators } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

const ADDRESS = /^0x[0-9a-f]{40}$/
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

async function boardState(board: string) {
  const [[owners], [added]] = await Promise.all([readBoardOwners([board]), readBoardModerators([board])])
  return {
    board,
    owners,
    moderators: added.moderators.filter(m => !owners.includes(m)),
    updatedAt: added.updatedAt || null,
  }
}

export async function GET(req: NextRequest) {
  const board = req.nextUrl.searchParams.get('board')?.toLowerCase()
  if (!board || !ADDRESS.test(board)) {
    return NextResponse.json({ error: 'Missing or invalid board address' }, { status: 400, headers: CORS })
  }
  try {
    return NextResponse.json(await boardState(board), { headers: { ...CORS, 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[moderation/moderators] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { board: rawBoard, moderators: rawModerators, owner: rawOwner, signature, timestamp } = await req.json() as {
      board?: string
      moderators?: string[]
      owner?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const board = rawBoard?.toLowerCase()
    const owner = rawOwner?.toLowerCase()
    if (!board || !ADDRESS.test(board) || !owner || !ADDRESS.test(owner) || !signature || !Number.isInteger(timestamp) || !Array.isArray(rawModerators)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const moderators = normalizeModerators(rawModerators)
    if (moderators.some(m => !ADDRESS.test(m))) {
      return NextResponse.json({ error: 'Every moderator must be a wallet address' }, { status: 400 })
    }
    if (moderators.length > MAX_BOARD_MODERATORS) {
      return NextResponse.json({ error: `A board can have at most ${MAX_BOARD_MODERATORS} moderators` }, { status: 400 })
    }

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp!) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    const valid = await verifyMessage({
      address: owner as `0x${string}`,
      message: moderatorsMessage(base.id, board, moderators, timestamp!),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const [[owners], [current]] = await Promise.all([readBoardOwners([board]), readBoardModerators([board])])
    if (!owners.includes(owner)) {
      return NextResponse.json({ error: "Only this board's owner can change its moderators" }, { status: 403 })
    }
    // Replaying an older signed list would undo a later change.
    if (timestamp! <= current.updatedAt) {
      return NextResponse.json({ error: 'A newer moderator list was already saved. Reload and try again.' }, { status: 409 })
    }

    const next: BoardModerators = {
      moderators: moderators.filter(m => !owners.includes(m)),
      updatedAt: timestamp!,
      updatedBy: owner,
    }
    await kv.set(moderatorsKey(board), next)
    return NextResponse.json(await boardState(board))
  } catch (error) {
    console.error('[moderation/moderators] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
