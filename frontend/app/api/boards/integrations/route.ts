import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { isAddress, verifyMessage } from 'viem'
import { base } from 'viem/chains'
import { featuredIntegrationMessage } from '@/lib/integrations/featured'
import { featuredKvKey, readBoardIntegrations } from '@/lib/integrations/server'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { readBoardOwners } from '@/lib/moderation/server'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const BOARDS_LIMIT = 100
const RATE_WINDOW = 60
const RATE_MAX = 60

// GET ?boards=0x1,0x2,...  → { [board]: { featured, chosen, views } } (see lib/integrations/server.ts)
export async function GET(req: NextRequest) {
  if (!await underRateLimit('boards:integrations', clientIp(req), RATE_MAX, RATE_WINDOW)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(RATE_WINDOW) } })
  }
  const boards = [...new Set((req.nextUrl.searchParams.get('boards') ?? '').split(',').map(b => b.trim().toLowerCase()).filter(b => isAddress(b)))]
  if (boards.length > BOARDS_LIMIT) return NextResponse.json({ error: `At most ${BOARDS_LIMIT} boards` }, { status: 400 })
  try {
    return NextResponse.json(await readBoardIntegrations(boards))
  } catch (err) {
    console.error('[boards/integrations] read failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT body { board, key, owner, signature, timestamp }: a board owner picks the featured integration
// (key) or goes back to the most viewed one (key: null). Signed with featuredIntegrationMessage,
// good for 5 minutes.
export async function PUT(req: NextRequest) {
  const { board: rawBoard, key, owner: rawOwner, signature, timestamp } = await req.json().catch(() => ({})) as {
    board?: string
    key?: string | null
    owner?: string
    signature?: `0x${string}`
    timestamp?: number
  }
  const board = rawBoard?.toLowerCase()
  const owner = rawOwner?.toLowerCase()
  if (!board || !ADDRESS_PATTERN.test(board) || !owner || !ADDRESS_PATTERN.test(owner))
    return NextResponse.json({ error: 'Missing or invalid board or owner address' }, { status: 400 })
  if (key !== null && (typeof key !== 'string' || key.length > 600))
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 400 })
  if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp))
    return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300)
    return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
  const valid = await verifyMessage({
    address: owner as `0x${string}`,
    message: featuredIntegrationMessage(base.id, board, key, timestamp),
    signature,
  }).catch(() => false)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  const [owners] = await readBoardOwners([board])
  if (!owners?.includes(owner))
    return NextResponse.json({ error: "Only this board's owner can choose its featured integration" }, { status: 403 })

  if (key === null) {
    await kv.del(featuredKvKey(board))
  } else {
    const current = (await readBoardIntegrations([board]))[board]
    if (!current || !(key in current.views))
      return NextResponse.json({ error: 'Not a verified integration of this board' }, { status: 404 })
    await kv.set(featuredKvKey(board), key)
  }
  return NextResponse.json((await readBoardIntegrations([board]))[board])
}
