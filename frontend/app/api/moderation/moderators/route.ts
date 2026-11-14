// GET  /api/moderation/moderators?board=0x...
//   Who moderates a board: its owner (the current on-chain admin, always a moderator) and the
//   moderators it added. Public and CORS-open so any site showing the board can read it.
//
// POST /api/moderation/moderators
//   { board, moderators: Array<{wallet, email?}>, owner, signature, timestamp }
//   Replaces the board's added moderators. Only the board admin can make it, proven by a Privy
//   session for the admin wallet or a signature. The signature covers
//   moderatorsMessage(8453, board, normalizeModerators(moderators), timestamp). Any email is
//   accepted for older callers but ignored: each wallet sets its own notification email through the
//   /api/moderation/notify route.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { base } from 'viem/chains'
import { authorizeWallet } from '@/lib/auth/wallet-session'
import {
  ADDRESS_PATTERN,
  MAX_BOARD_MODERATORS,
  moderatorsMessage,
  normalizeModerators,
  type EmailFrequency,
} from '@/lib/moderation/queue'
import {
  clearModeratedBoards,
  moderatorsKey,
  notifyStateKey,
  readBoardModerators,
  readBoardOwners,
  type BoardModerators,
  type ModeratorNotifyState,
} from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  return local.slice(0, 1) + '***' + (local.length > 1 ? local.slice(-1) : '') + domain
}

async function boardState(board: string) {
  const [[owners], [added]] = await Promise.all([
    readBoardOwners([board]),
    readBoardModerators([board]),
  ])
  // Fetch notify states for all added moderators to surface verified/frequency info.
  const addedWallets = added.moderators.map(m => m.wallet).filter(w => !owners.includes(w))
  const notifyRows = addedWallets.length > 0
    ? await kv.mget<(ModeratorNotifyState | null)[]>(...addedWallets.map(notifyStateKey)).catch(() => [] as (ModeratorNotifyState | null)[])
    : []

  const moderators = added.moderators
    .filter(m => !owners.includes(m.wallet))
    .map((m, i) => {
      const state = notifyRows[i] ?? null
      return {
        wallet: m.wallet,
        emailMasked: state?.email ? maskEmail(state.email) : null,
        verified: state?.verified ?? false,
        frequency: (state?.frequency ?? 'every') as EmailFrequency,
      }
    })

  return {
    board,
    owners,
    moderators,
    updatedAt: added.updatedAt || null,
  }
}

export async function GET(req: NextRequest) {
  const board = req.nextUrl.searchParams.get('board')?.toLowerCase()
  if (!board || !ADDRESS_PATTERN.test(board)) {
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
      moderators?: unknown[]
      owner?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const board = rawBoard?.toLowerCase()
    const owner = rawOwner?.toLowerCase()
    if (!board || !ADDRESS_PATTERN.test(board)) {
      return NextResponse.json({ error: 'Missing or invalid board address' }, { status: 400 })
    }
    if (!owner || !ADDRESS_PATTERN.test(owner)) {
      return NextResponse.json({ error: 'Missing or invalid owner address' }, { status: 400 })
    }
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    if (!Array.isArray(rawModerators)) {
      return NextResponse.json({ error: 'moderators must be a list' }, { status: 400 })
    }

    const moderators = normalizeModerators(rawModerators)
    if (moderators.some(m => !ADDRESS_PATTERN.test(m.wallet))) {
      return NextResponse.json({ error: 'Every moderator must have a valid wallet address' }, { status: 400 })
    }
    if (moderators.length > MAX_BOARD_MODERATORS) {
      return NextResponse.json({ error: `A board can have at most ${MAX_BOARD_MODERATORS} moderators` }, { status: 400 })
    }

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    const auth = await authorizeWallet(req, owner, signature, () => moderatorsMessage(base.id, board, moderators, timestamp))
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

    const [[owners], [current]] = await Promise.all([readBoardOwners([board]), readBoardModerators([board])])
    if (!owners.includes(owner)) {
      return NextResponse.json({ error: "Only this board's owner can change its moderators" }, { status: 403 })
    }
    if (timestamp <= current.updatedAt) {
      return NextResponse.json({ error: 'A newer moderator list was already saved. Reload and try again.' }, { status: 409 })
    }

    const next: BoardModerators = {
      moderators: moderators.filter(m => !owners.includes(m.wallet)).map(m => ({ wallet: m.wallet })),
      updatedAt: timestamp,
      updatedBy: owner,
    }
    await kv.set(moderatorsKey(board), next)
    await clearModeratedBoards()

    return NextResponse.json(await boardState(board))
  } catch (error) {
    console.error('[moderation/moderators] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
