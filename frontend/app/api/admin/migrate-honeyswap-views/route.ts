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
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function hashMessage(message: string): string {
  return createHash('md5').update(message.trim().toLowerCase()).digest('hex').slice(0, 8)
}

// ChainCare's message text — used to compute the views:msg key hash
const CHAINCARE_MESSAGE =
  "Your users don't care that it's 3am. Neither do we. ChainCare runs 24/7 support ops for DeFi protocols — AI triage, crypto-native escalation, trust & safety. chaincare.co"

const CHAINCARE_OLD = '0x82fb4cd58a4fcc577983b466f424426083dec26d'
const CHAINCARE_NEW = '0x75ca6217f6525140dcfa6f41987a8ea5ff70fff1'
const USER_OLD = '0x376f4f8c9cac0629df6b6d5495d6e7d2c687412a'
const USER_NEW = '0x7a8b352ac19957ceccfcc0b69634ab6d6db7033'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, { copied: string[]; skipped: string[] }> = {
    ChainCare: { copied: [], skipped: [] },
    'User markee': { copied: [], skipped: [] },
  }

  // --- ChainCare: views:total + views:msg ---
  const ccMsgHash = hashMessage(CHAINCARE_MESSAGE)
  const ccKeys = [
    { old: `views:total:${CHAINCARE_OLD}`, new: `views:total:${CHAINCARE_NEW}` },
    { old: `views:msg:${CHAINCARE_OLD}:${ccMsgHash}`, new: `views:msg:${CHAINCARE_NEW}:${ccMsgHash}` },
  ]
  await Promise.all(ccKeys.map(async ({ old: oldKey, new: newKey }) => {
    const [oldVal, newVal] = await Promise.all([kv.get<number>(oldKey), kv.get<number>(newKey)])
    if (oldVal && !newVal) {
      await kv.set(newKey, oldVal)
      results['ChainCare'].copied.push(`${oldKey} (${oldVal}) → ${newKey}`)
    } else if (oldVal && newVal) {
      results['ChainCare'].skipped.push(`${oldKey} (dest already has ${newVal})`)
    } else {
      results['ChainCare'].skipped.push(`${oldKey} (no source data)`)
    }
  }))

  // --- User markee: views:total only (message changed) ---
  const [oldTotal, newTotal] = await Promise.all([
    kv.get<number>(`views:total:${USER_OLD}`),
    kv.get<number>(`views:total:${USER_NEW}`),
  ])
  if (oldTotal && !newTotal) {
    await kv.set(`views:total:${USER_NEW}`, oldTotal)
    results['User markee'].copied.push(`views:total:${USER_OLD} (${oldTotal}) → views:total:${USER_NEW}`)
  } else if (oldTotal && newTotal) {
    results['User markee'].skipped.push(`views:total:${USER_OLD} (dest already has ${newTotal})`)
  } else {
    results['User markee'].skipped.push(`views:total:${USER_OLD} (no source data)`)
  }

  return NextResponse.json({ ok: true, results })
}
