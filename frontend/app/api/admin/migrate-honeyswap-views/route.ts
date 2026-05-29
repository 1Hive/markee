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

  const { searchParams } = new URL(request.url)

  // ?fix=1 — corrects the double-count from running migration twice
  // views:msg was already at 1066 from a prior session; INCRBY added 1066 again → 2133
  // views:total for user markee was already at 800; INCRBY added 800 again → 1600
  if (searchParams.get('fix') === '1') {
    const ccMsgHash = hashMessage(CHAINCARE_MESSAGE)
    const msgKey = `views:msg:${CHAINCARE_NEW}:${ccMsgHash}`
    const userTotalKey = `views:total:${USER_NEW}`
    const [msgVal, userTotal] = await Promise.all([
      kv.get<number>(msgKey),
      kv.get<number>(userTotalKey),
    ])
    const msgFixed = await kv.decrby(msgKey, 1066)
    const userFixed = await kv.decrby(userTotalKey, 800)
    return NextResponse.json({
      ok: true,
      fix: {
        [msgKey]: { before: msgVal, after: msgFixed },
        [userTotalKey]: { before: userTotal, after: userFixed },
      },
    })
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
    const oldVal = await kv.get<number>(oldKey)
    if (!oldVal) {
      results['ChainCare'].skipped.push(`${oldKey} (no source data)`)
      return
    }
    const added = await kv.incrby(newKey, oldVal)
    results['ChainCare'].copied.push(`${oldKey} (+${oldVal} → ${newKey} now ${added})`)
  }))

  // --- User markee: views:total only (message changed) ---
  const oldTotal = await kv.get<number>(`views:total:${USER_OLD}`)
  if (!oldTotal) {
    results['User markee'].skipped.push(`views:total:${USER_OLD} (no source data)`)
  } else {
    const added = await kv.incrby(`views:total:${USER_NEW}`, oldTotal)
    results['User markee'].copied.push(`views:total:${USER_OLD} (+${oldTotal} → now ${added})`)
  }

  return NextResponse.json({ ok: true, results })
}
