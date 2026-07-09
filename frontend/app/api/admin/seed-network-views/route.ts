// app/api/admin/seed-network-views/route.ts
//
// One-time (and safe-to-re-run) admin endpoint that scans all views:total:* keys
// in KV and sets views:network:total to their sum. Run this after any manual view
// migrations to keep the network counter in sync.
//
// Usage:
//   curl -X POST -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/seed-network-views

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let cursor = 0
  let total = 0
  let keyCount = 0

  do {
    const [nextCursor, keys] = await kv.scan(cursor, { match: 'views:total:*', count: 200 })
    cursor = Number(nextCursor)
    if (keys.length > 0) {
      const values = await kv.mget<(number | null)[]>(...keys)
      for (const v of values) {
        if (v) total += v
      }
      keyCount += keys.length
    }
  } while (cursor !== 0)

  await kv.set('views:network:total', total)

  return NextResponse.json({ ok: true, total, keyCount })
}
