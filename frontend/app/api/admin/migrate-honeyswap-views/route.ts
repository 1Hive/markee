// app/api/admin/migrate-honeyswap-views/route.ts
//
// One-time migration: copies per-markee view counts from the legacy Honeyswap
// leaderboard (v1.0) to the current v1.3 leaderboard.
//
// Mapping (matched by message content + owner):
//   ChainCare:   0x82fb4cd5... → 0x75ca6217... (same message — migrates views:total + views:msg)
//   User markee: 0x376f4f8c... → 0x7A8B352A... (message changed — migrates views:total only)
//
// Safe to re-run — only writes if dest key doesn't already exist.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MARKEE_MAP: Array<{
  label: string
  oldAddr: string
  newAddr: string
  migrateMsg: boolean
}> = [
  {
    label: 'ChainCare',
    oldAddr: '0x82fb4cd58a4fcc577983b466f424426083dec26d',
    newAddr: '0x75ca6217f6525140dcfa6f41987a8ea5ff70fff1',
    migrateMsg: true,
  },
  {
    label: 'User markee (message changed)',
    oldAddr: '0x376f4f8c9cac0629df6b6d5495d6e7d2c687412a',
    newAddr: '0x7a8b352ac19957ceccfcc0b69634ab6d6db7033',
    migrateMsg: false,
  },
]

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, { copied: string[]; skipped: string[] }> = {}

  for (const { label, oldAddr, newAddr, migrateMsg } of MARKEE_MAP) {
    const result = { copied: [] as string[], skipped: [] as string[] }
    results[label] = result

    // Migrate views:total
    const totalOld = `views:total:${oldAddr}`
    const totalNew = `views:total:${newAddr}`
    const [oldTotal, newTotal] = await Promise.all([
      kv.get<number>(totalOld),
      kv.get<number>(totalNew),
    ])
    if (oldTotal && !newTotal) {
      await kv.set(totalNew, oldTotal)
      result.copied.push(`${totalOld} (${oldTotal}) → ${totalNew}`)
    } else if (oldTotal && newTotal) {
      result.skipped.push(`${totalOld} (dest already has ${newTotal})`)
    } else {
      result.skipped.push(`${totalOld} (no source data)`)
    }

    if (!migrateMsg) continue

    // Scan and migrate all views:msg:{oldAddr}:* keys
    let cursor = 0
    do {
      const [nextCursor, keys] = await kv.scan(cursor, {
        match: `views:msg:${oldAddr}:*`,
        count: 100,
      })
      cursor = nextCursor as unknown as number

      if (keys.length > 0) {
        const values = await kv.mget<number[]>(...keys)
        await Promise.all(keys.map(async (oldKey, i) => {
          const val = values[i]
          if (!val) return
          const newKey = oldKey.replace(oldAddr, newAddr)
          const existing = await kv.get(newKey)
          if (!existing) {
            await kv.set(newKey, val)
            result.copied.push(`${oldKey} (${val}) → ${newKey}`)
          } else {
            result.skipped.push(`${oldKey} (dest already has ${existing})`)
          }
        }))
      }
    } while (cursor !== 0)
  }

  return NextResponse.json({ ok: true, results })
}
