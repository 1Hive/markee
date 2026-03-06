// app/api/views/route.ts
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

const ALLOWED_ORIGINS = [
  'https://markee.xyz',
  'https://www.markee.xyz',
  'https://app.gardens.fund',
  // Add new integration domains here as you expand
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))
      ? origin
      : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
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

// GET /api/views?addresses=0x1,0x2,...
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
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
    .slice(0, 100) // hard cap

  if (addresses.length === 0) {
    return NextResponse.json({}, { headers: corsHeaders(origin) })
  }

  // Batch fetch all total view keys
  const totalKeys = addresses.map((a) => `views:total:${a}`)
  const totalCounts = await kv.mget<number[]>(...totalKeys)

  const result: Record<string, { totalViews: number }> = {}
  addresses.forEach((address, i) => {
    result[address] = {
      totalViews: totalCounts[i] ?? 0,
    }
  })

  return NextResponse.json(result, { headers: corsHeaders(origin) })
}

// POST /api/views
// Body: { address: string, message: string }
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

  // Increment both counters atomically via pipeline
  const pipeline = kv.pipeline()
  pipeline.incr(`views:total:${address}`)
  pipeline.incr(`views:msg:${address}:${msgHash}`)
  pipeline.set(dedupeKey, '1', { ex: 3600 })
  const [totalViews, messageViews] = await pipeline.exec<[number, number, unknown]>()

  return NextResponse.json(
    { totalViews, messageViews, counted: true },
    { headers: corsHeaders(origin) },
  )
}
