// app/api/views/route.ts
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

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

// GET /api/views?addresses=0x1,0x2,...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const addressParam = searchParams.get('addresses')

  if (!addressParam) {
    return NextResponse.json({ error: 'Missing addresses param' }, { status: 400 })
  }

  const addresses = addressParam
    .split(',')
    .map(a => a.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 100) // hard cap

  if (addresses.length === 0) {
    return NextResponse.json({})
  }

  // Batch fetch all total view keys
  const totalKeys = addresses.map(a => `views:total:${a}`)
  const totalCounts = await kv.mget<number[]>(...totalKeys)

  const result: Record<string, { totalViews: number }> = {}
  addresses.forEach((address, i) => {
    result[address] = {
      totalViews: totalCounts[i] ?? 0,
    }
  })

  return NextResponse.json(result)
}

// POST /api/views
// Body: { address: string, message: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.address || !body?.message) {
    return NextResponse.json({ error: 'Missing address or message' }, { status: 400 })
  }

  const address = body.address.toLowerCase().trim()
  const msgHash = hashMessage(body.message)

  // Rate limit: 1 view per IP per markee per hour
  const ip = getClientIp(req)
  const dedupeKey = `dedup:${ip}:${address}`
  const alreadyCounted = await kv.get(dedupeKey)

  if (alreadyCounted) {
    // Return current counts without incrementing
    const [totalViews, messageViews] = await kv.mget<number[]>(
      `views:total:${address}`,
      `views:msg:${address}:${msgHash}`
    )
    return NextResponse.json({
      totalViews: totalViews ?? 0,
      messageViews: messageViews ?? 0,
      counted: false,
    })
  }

  // Increment both counters atomically via pipeline
  const pipeline = kv.pipeline()
  pipeline.incr(`views:total:${address}`)
  pipeline.incr(`views:msg:${address}:${msgHash}`)
  // Set dedup key, expires in 1 hour
  pipeline.set(dedupeKey, '1', { ex: 3600 })
  const [totalViews, messageViews] = await pipeline.exec<[number, number, unknown]>()

  return NextResponse.json({
    totalViews,
    messageViews,
    counted: true,
  })
}
