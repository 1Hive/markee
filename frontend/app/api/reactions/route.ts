import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { clientIp } from '@/lib/rate-limit'
import { isReactionEmoji, reactionMessage, REACTION_SIGNATURE_TTL, type ReactionAction } from '@/lib/reactions'
import { reactionsDeps } from '@/lib/reactions-deps'

// @vercel/kv leaves fetch caching to Next, which would otherwise store (and can replay) KV reads.
export const dynamic = 'force-dynamic'

const CHAIN_IDS = [1, 10, 8453, 42161]
const MAX_INDEXED_MARKEES = 500

interface Reaction {
  id: string
  markeeAddress: string
  userAddress: string
  emoji: string
  timestamp: number
  chainId: number
}

// Per-markee hash keys eliminate the GET→modify→SET race condition.
// Each hset/hdel is a single atomic KV command.
function reactionsKey(markeeAddress: string) {
  return `reactions:v2:${markeeAddress.toLowerCase()}`
}

// Set that tracks every markee address that has ever received a reaction.
// Used by the no-param GET to bulk-load all reactions without a SCAN.
const REACTIONS_INDEX_KEY = 'reactions:markees'

// The KV client already deserializes JSON values, while older writes may still come back as strings.
function storedReaction(value: unknown): Reaction | null {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return null }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const r = parsed as Record<string, unknown>
  if (typeof r.markeeAddress !== 'string' || !isAddress(r.markeeAddress)) return null
  if (typeof r.userAddress !== 'string' || !isAddress(r.userAddress)) return null
  if (!isReactionEmoji(r.emoji) || typeof r.timestamp !== 'number' || !Number.isFinite(r.timestamp)) return null
  return {
    id: typeof r.id === 'string' ? r.id : `${r.markeeAddress}-${r.userAddress}`,
    markeeAddress: r.markeeAddress,
    userAddress: r.userAddress,
    emoji: r.emoji,
    timestamp: r.timestamp,
    chainId: typeof r.chainId === 'number' ? r.chainId : 8453,
  }
}

async function getReactionsForMarkee(markeeAddress: string): Promise<Reaction[]> {
  const hash = await reactionsDeps.hgetall(reactionsKey(markeeAddress))
  if (!hash) return []
  return Object.values(hash).map(storedReaction).filter((r): r is Reaction => r !== null)
}

type Signed = { ok: true; markee: string; user: `0x${string}` } | { ok: false; response: NextResponse }

async function verifySigned(action: ReactionAction, body: Record<string, unknown>, emoji: string): Promise<Signed> {
  const { markeeAddress, userAddress, signature, timestamp } = body
  const fail = (error: string, status: number): Signed => ({ ok: false, response: NextResponse.json({ error }, { status }) })
  if (typeof markeeAddress !== 'string' || !isAddress(markeeAddress) || typeof userAddress !== 'string' || !isAddress(userAddress)) {
    return fail('Valid markeeAddress and userAddress are required', 400)
  }
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature) || typeof timestamp !== 'number' || !Number.isInteger(timestamp)) {
    return fail('Sign the reaction with your wallet to continue', 401)
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > REACTION_SIGNATURE_TTL) return fail('Signature expired', 401)
  const valid = await reactionsDeps.verifyMessage({
    address: userAddress,
    message: reactionMessage(action, markeeAddress, emoji, timestamp),
    signature: signature as `0x${string}`,
  })
  if (!valid) return fail('Invalid signature', 401)
  return { ok: true, markee: markeeAddress.toLowerCase(), user: userAddress.toLowerCase() as `0x${string}` }
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
}

// GET /api/reactions?markeeAddress=0x... (omit param to fetch all)
export async function GET(request: NextRequest) {
  try {
    const markeeAddress = request.nextUrl.searchParams.get('markeeAddress')

    if (markeeAddress) {
      if (!isAddress(markeeAddress)) return NextResponse.json({ error: 'Invalid markeeAddress' }, { status: 400 })
      return NextResponse.json({ reactions: await getReactionsForMarkee(markeeAddress) })
    }

    const markeeAddresses = (await reactionsDeps.smembers(REACTIONS_INDEX_KEY) ?? [])
      .filter(addr => typeof addr === 'string' && isAddress(addr))
      .slice(0, MAX_INDEXED_MARKEES)
    const lists = await Promise.all(markeeAddresses.map(getReactionsForMarkee))
    return NextResponse.json({ reactions: lists.flat() })
  } catch (error) {
    console.error('[Reactions] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 })
  }
}

// POST /api/reactions
//   { markeeAddress, userAddress, emoji, chainId, signature, timestamp }
//   The signature covers reactionMessage('react', markeeAddress, emoji, timestamp).
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    const { emoji, chainId } = body
    if (!isReactionEmoji(emoji)) return NextResponse.json({ error: 'Unsupported reaction' }, { status: 400 })
    if (typeof chainId !== 'number' || !CHAIN_IDS.includes(chainId)) return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 })

    if (!await reactionsDeps.underRateLimit('reactions-ip', clientIp(request), 30, 60)) {
      return NextResponse.json({ error: 'Too many requests. Please wait before reacting again.' }, { status: 429 })
    }

    const signed = await verifySigned('react', body, emoji)
    if (!signed.ok) return signed.response

    if (!await reactionsDeps.cooldown(signed.user)) {
      return NextResponse.json({ error: 'Too many requests. Please wait before reacting again.' }, { status: 429 })
    }

    if (!await reactionsDeps.holdsEnoughMarkee(signed.user)) {
      return NextResponse.json(
        { error: 'Insufficient MARKEE balance. You need at least 100 MARKEE tokens to react.' },
        { status: 403 }
      )
    }

    const reaction: Reaction = {
      id: `${signed.markee}-${signed.user}`,
      markeeAddress: signed.markee,
      userAddress: signed.user,
      emoji,
      timestamp: Date.now(),
      chainId,
    }

    await reactionsDeps.hset(reactionsKey(signed.markee), signed.user, JSON.stringify(reaction))
    await reactionsDeps.sadd(REACTIONS_INDEX_KEY, signed.markee)

    return NextResponse.json({ success: true, reaction })
  } catch (error) {
    console.error('[Reactions] POST error:', error)
    return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 })
  }
}

// DELETE /api/reactions
//   { markeeAddress, userAddress, signature, timestamp }
//   The signature covers reactionMessage('remove', markeeAddress, '', timestamp).
export async function DELETE(request: NextRequest) {
  try {
    const body = await readBody(request)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    if (!await reactionsDeps.underRateLimit('reactions-ip', clientIp(request), 30, 60)) {
      return NextResponse.json({ error: 'Too many requests. Please wait before reacting again.' }, { status: 429 })
    }

    const signed = await verifySigned('remove', body, '')
    if (!signed.ok) return signed.response

    await reactionsDeps.hdel(reactionsKey(signed.markee), signed.user)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Reactions] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete reaction' }, { status: 500 })
  }
}
