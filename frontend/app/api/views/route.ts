// app/api/views/route.ts
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createPublicClient, http, isAddress, parseAbi, type Address } from 'viem'
import { base } from 'viem/chains'
import { VIEWS_ADDRESS_LIMIT } from '@/lib/utils'
import { readBoardViews } from '@/lib/views/boards'
import { normalizeHost, lastSiteViewKey } from '@/lib/views/host'
import { dayOf, dailyViewsKey, VIEWS_SINCE_KEY } from '@/lib/stats/daily'

// Counts change with every view: never let Next serve these KV reads from its data cache.
export const dynamic = 'force-dynamic'

const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])

function corsHeaders(_origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function hashMessage(message: string): string {
  return createHash('md5').update(message.trim().toLowerCase()).digest('hex').slice(0, 8)
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// OPTIONS — preflight for cross-origin requests
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

// GET /api/views?network=1  → { total: number }  (network-wide total across all markees)
// GET /api/views?addresses=0x1,0x2,...
// GET /api/views?address=0x1&messages=msg1||msg2||msg3  (pipe-delimited, per-message counts)
// GET /api/views?boards=0x1,0x2,...  → { board: { totalViews } }, each board's views by the shared rule
//   in lib/views/boards.ts (board key + its current top message's key, read live from the board)
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)

  const boardsParam = searchParams.get('boards')
  if (boardsParam !== null) {
    const boards = [...new Set(boardsParam.split(',').map(a => a.toLowerCase().trim()).filter(a => isAddress(a)))].slice(0, VIEWS_ADDRESS_LIMIT)
    if (boards.length === 0) return NextResponse.json({}, { headers: corsHeaders(origin) })
    const client = createPublicClient({ chain: base, transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }) })
    // Legacy boards have no getTopMarkees; they count by board address alone.
    const tops = await client.multicall({
      contracts: boards.map(address => ({ address: address as Address, abi: TOP_ABI, functionName: 'getTopMarkees' as const, args: [1n] as const })),
    }).catch(() => [])
    const views = await readBoardViews(boards.map((address, i) => ({
      address,
      topMarkeeAddress: (tops[i]?.result as readonly [readonly string[], readonly bigint[]] | undefined)?.[0]?.[0] ?? null,
    })))
    return NextResponse.json(Object.fromEntries(boards.map(b => [b, { totalViews: views.get(b) ?? 0 }])), { headers: corsHeaders(origin) })
  }

  if (searchParams.get('network') === '1') {
    const total = await kv.get<number>('views:network:total') ?? 0
    return NextResponse.json({ total }, { headers: corsHeaders(origin) })
  }

  // Per-message view counts for leaderboard
  const singleAddress = searchParams.get('address')
  const messagesParam = searchParams.get('messages')
  if (singleAddress && messagesParam) {
    const address = singleAddress.toLowerCase().trim()
    const messages = messagesParam.split('||').filter(Boolean)
    if (messages.length === 0) {
      return NextResponse.json({}, { headers: corsHeaders(origin) })
    }
    const keys = messages.map((m) => `views:msg:${address}:${hashMessage(m)}`)
    const counts = await kv.mget<number[]>(...keys)
    const result: Record<string, number> = {}
    messages.forEach((msg, i) => {
      result[msg] = counts[i] ?? 0
    })
    return NextResponse.json(result, { headers: corsHeaders(origin) })
  }

  // Per-URL view counts (which of a board's verified sites is actually getting traffic) —
  // callers pass the exact verifiedUrls list, mirroring the `messages` param above.
  const urlsParam = searchParams.get('urls')
  if (singleAddress && urlsParam) {
    const address = singleAddress.toLowerCase().trim()
    const urls = urlsParam.split('||').filter(Boolean).slice(0, 100)
    if (urls.length === 0) {
      return NextResponse.json({}, { headers: corsHeaders(origin) })
    }
    const hosts = urls.map(u => normalizeHost(u))
    const validIdx = hosts.map((h, i) => (h ? i : -1)).filter(i => i !== -1)
    const validKeys = validIdx.map(i => `views:url:${address}:${hosts[i]}`)
    const counts = validKeys.length ? await kv.mget<(number | null)[]>(...validKeys) : []
    const result: Record<string, number> = {}
    urls.forEach(url => { result[url] = 0 })
    validIdx.forEach((urlIdx, keyIdx) => {
      result[urls[urlIdx]] = counts[keyIdx] ?? 0
    })
    return NextResponse.json(result, { headers: corsHeaders(origin) })
  }

  // Batch total view counts by address
  const addressParam = searchParams.get('addresses')
  if (!addressParam) {
    return NextResponse.json(
      { error: 'Missing addresses param' },
      { status: 400, headers: corsHeaders(origin) },
    )
  }

  const addresses = addressParam
    .split(',')
    .map((a) => a.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, VIEWS_ADDRESS_LIMIT)

  if (addresses.length === 0) {
    return NextResponse.json({}, { headers: corsHeaders(origin) })
  }

  const totalKeys = addresses.map((a) => `views:total:${a}`)
  const totalCounts = await kv.mget<number[]>(...totalKeys)

  const result: Record<string, { totalViews: number }> = {}
  addresses.forEach((address, i) => {
    result[address] = { totalViews: totalCounts[i] ?? 0 }
  })

  return NextResponse.json(result, { headers: corsHeaders(origin) })
}

// Hostnames that are always trusted as view sources regardless of a board's verifiedUrls.
// Includes our own domains, Vercel preview URLs, and localhost for dev.
const OWNED_HOSTS = new Set(['markee.xyz', 'www.markee.xyz'])
function isTrustedHost(h: string | null): boolean {
  if (!h) return true // no referer → allow (privacy browsers, curl, server-side)
  if (OWNED_HOSTS.has(h)) return true
  if (h === 'localhost' || h.startsWith('127.') || h.startsWith('[::1]')) return true
  if (h.endsWith('.markee.xyz') || h.endsWith('.vercel.app')) return true
  return false
}

// POST /api/views
// Body: { address: string, message: string, url?: string }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = await req.json().catch(() => null)

  if (!body?.address || !body?.message) {
    return NextResponse.json(
      { error: 'Missing address or message' },
      { status: 400, headers: corsHeaders(origin) },
    )
  }

  const address = body.address.toLowerCase().trim()
  const msgHash = hashMessage(body.message)

  // ── Referer / origin guard ──────────────────────────────────────────────────
  // Prefer the browser-set `Origin` header (cross-origin requests always send it and it
  // can't be overridden by fetch() options); fall back to `Referer` for same-origin or
  // server-sent requests. If the inferred host isn't one of our own domains, check it
  // against the board's registered verifiedUrls. A board with NO verified integrations
  // allows all origins (backward-compat; those boards only appear on markee.xyz anyway).
  // A board that HAS verified integrations rejects views from unregistered domains — a
  // site owner can't manufacture traffic by calling the API directly from their server.
  const rawReferer = req.headers.get('origin') ?? req.headers.get('referer')
  const refHost    = rawReferer ? normalizeHost(rawReferer) : null
  // Which site the view came from, for the per-site counters: the body's url when the embed sends
  // it, otherwise the browser's Origin/Referer, so embeds that leave url out are still attributed.
  // Views from markee.xyz itself belong to no site.
  const host = (typeof body.url === 'string' ? normalizeHost(body.url) : null) ?? (isTrustedHost(refHost) ? null : refHost)

  if (!isTrustedHost(refHost)) {
    const meta = await kv.get<{ verifiedUrls?: string[]; verifiedUrl?: string }>(`oi:meta:${address}`).catch(() => null)
    const verifiedHosts = new Set(
      (Array.isArray(meta?.verifiedUrls) ? meta.verifiedUrls
        : meta?.verifiedUrl ? [meta.verifiedUrl] : [])
        .map(u => normalizeHost(u))
        .filter((h): h is string => h !== null),
    )

    if (verifiedHosts.size > 0 && !verifiedHosts.has(refHost!)) {
      // Known board, unknown origin — return current counts but don't increment.
      const [totalViews, messageViews] = await kv.mget<number[]>(
        `views:total:${address}`,
        `views:msg:${address}:${msgHash}`,
      )
      return NextResponse.json(
        { totalViews: totalViews ?? 0, messageViews: messageViews ?? 0, counted: false },
        { headers: corsHeaders(origin) },
      )
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  // The last time this site reported a view, counted or not, so the dashboard can tell a site whose
  // embed isn't reporting views from one that just hasn't had visitors (lib/integrations/server.ts).
  if (host) await kv.set(lastSiteViewKey(address, host), Math.floor(Date.now() / 1000)).catch(() => {})

  // Rate limit: 1 view per IP per markee per hour
  const ip = getClientIp(req)
  const dedupeKey = `dedup:${ip}:${address}`
  const alreadyCounted = await kv.get(dedupeKey)

  if (alreadyCounted) {
    const [totalViews, messageViews] = await kv.mget<number[]>(
      `views:total:${address}`,
      `views:msg:${address}:${msgHash}`,
    )
    return NextResponse.json(
      { totalViews: totalViews ?? 0, messageViews: messageViews ?? 0, counted: false },
      { headers: corsHeaders(origin) },
    )
  }

  const pipeline = kv.pipeline()
  pipeline.incr(`views:total:${address}`)
  pipeline.incr(`views:msg:${address}:${msgHash}`)
  pipeline.set(dedupeKey, '1', { ex: 3600 })
  pipeline.incr('views:network:total')
  if (host) pipeline.incr(`views:url:${address}:${host}`)
  // Day-by-day history for the dashboard charts (lib/stats/daily.ts).
  const day = dayOf()
  pipeline.hincrby(dailyViewsKey(address), day, 1)
  pipeline.set(VIEWS_SINCE_KEY, day, { nx: true })
  const [totalViews, messageViews] = await pipeline.exec<[number, number, unknown, number, number?]>()

  return NextResponse.json(
    { totalViews, messageViews, counted: true },
    { headers: corsHeaders(origin) },
  )
}
