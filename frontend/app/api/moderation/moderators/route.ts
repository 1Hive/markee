// GET  /api/moderation/moderators?board=0x...
//   Who moderates a board: its owners (on-chain admin and creator, always moderators) and the
//   moderators they added. Public and CORS-open so any site showing the board can read it.
//
// POST /api/moderation/moderators
//   { board, moderators: Array<{wallet, email?}>, owner, signature, timestamp }
//   Replaces the board's added moderators. Only an owner can sign it. The signature covers
//   moderatorsMessage(8453, board, normalizeModerators(moderators), timestamp).
//   When a new moderator is supplied with an email address a verification email is sent.

import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import {
  ADDRESS_PATTERN,
  MAX_BOARD_MODERATORS,
  moderatorsMessage,
  normalizeModerators,
  EMAIL_FREQUENCIES,
  type EmailFrequency,
} from '@/lib/moderation/queue'
import {
  clearModeratedBoards,
  moderatorsKey,
  notifyStateKey,
  verifyTokenKey,
  readBoardModerators,
  readBoardOwners,
  type BoardModerators,
  type ModeratorNotifyState,
  type VerifyToken,
} from '@/lib/moderation/server'
import { sendVerificationEmail } from '@/lib/moderation/email'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const VERIFY_TOKEN_TTL = 60 * 60 * 24 * 7 // 7 days

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

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
    if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    }
    if (!Array.isArray(rawModerators)) {
      return NextResponse.json({ error: 'moderators must be a list' }, { status: 400 })
    }

    const moderators = normalizeModerators(rawModerators)
    if (moderators.some(m => !ADDRESS_PATTERN.test(m.wallet))) {
      return NextResponse.json({ error: 'Every moderator must have a valid wallet address' }, { status: 400 })
    }
    if (moderators.some(m => m.email && (m.email.length > 254 || !EMAIL_RE.test(m.email)))) {
      return NextResponse.json({ error: 'One or more email addresses are invalid' }, { status: 400 })
    }
    if (moderators.length > MAX_BOARD_MODERATORS) {
      return NextResponse.json({ error: `A board can have at most ${MAX_BOARD_MODERATORS} moderators` }, { status: 400 })
    }

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    const valid = await verifyMessage({
      address: owner as `0x${string}`,
      message: moderatorsMessage(base.id, board, moderators, timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const [[owners], [current]] = await Promise.all([readBoardOwners([board]), readBoardModerators([board])])
    if (!owners.includes(owner)) {
      return NextResponse.json({ error: "Only this board's owner can change its moderators" }, { status: 403 })
    }
    if (timestamp <= current.updatedAt) {
      return NextResponse.json({ error: 'A newer moderator list was already saved. Reload and try again.' }, { status: 409 })
    }

    // Determine which wallets are newly added (not already in the stored list).
    const existingWallets = new Set(current.moderators.map(m => m.wallet))
    const toAdd = moderators.filter(m => !owners.includes(m.wallet) && !existingWallets.has(m.wallet))

    const next: BoardModerators = {
      moderators: moderators.filter(m => !owners.includes(m.wallet)),
      updatedAt: timestamp,
      updatedBy: owner,
    }
    await kv.set(moderatorsKey(board), next)
    await clearModeratedBoards()

    // Board name for verification emails: the address unless the moderated boards listing names it.
    let boardName = board

    // Send verification emails to newly added moderators that have an email address.
    const origin = req.nextUrl.origin
    const moderatorsWithNewEmails = toAdd.filter(m => m.email)
    if (moderatorsWithNewEmails.length > 0) {
      // Read any existing board name from the moderated boards listing for a friendlier email.
      const { listModeratedBoards } = await import('@/lib/moderation/server')
      const allBoards = await listModeratedBoards().catch(() => [])
      const foundBoard = allBoards.find(b => b.address === board)
      if (foundBoard) boardName = foundBoard.name

      await Promise.all(moderatorsWithNewEmails.map(async m => {
        const email = m.email!
        const token = randomBytes(32).toString('hex')
        const verifyUrl = `${origin}/api/moderation/notify/verify?token=${token}`
        const tokenPayload: VerifyToken = {
          wallet: m.wallet,
          email,
          board,
          boardName,
          expiresAt: now + VERIFY_TOKEN_TTL,
        }
        // Upsert notify state (verified=false, frequency='every') if not already set.
        const existing = await kv.get<ModeratorNotifyState>(notifyStateKey(m.wallet)).catch(() => null)
        if (!existing || existing.email !== email) {
          const notifyState: ModeratorNotifyState = {
            email,
            verified: false,
            frequency: existing?.frequency ?? 'every',
            setAt: now,
          }
          await kv.set(notifyStateKey(m.wallet), notifyState)
        }
        await kv.set(verifyTokenKey(token), tokenPayload, { ex: VERIFY_TOKEN_TTL })
        await sendVerificationEmail(email, boardName, verifyUrl).catch(e => {
          console.error('[moderation/moderators] verification email failed to', email, e)
        })
      }))
    }

    return NextResponse.json(await boardState(board))
  } catch (error) {
    console.error('[moderation/moderators] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
