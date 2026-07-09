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
const USER_NEW = '0x7a8b352ac19957cecccfcc0b69634ab6d6db7033'
const USER_NEW_TYPO = '0x7a8b352ac19957ceccfcc0b69634ab6d6db7033' // wrong key from earlier runs

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // ?fix=1 — corrects all migration errors:
  //   1. ChainCare views:msg was double-counted (2133 → ~1067): DECRBY 1066
  //   2. User markee went to a typo address — delete that key, INCRBY 800 on correct address
  if (searchParams.get('fix') === '1') {
    const ccMsgHash = hashMessage(CHAINCARE_MESSAGE)
    const msgKey = `views:msg:${CHAINCARE_NEW}:${ccMsgHash}`
    const correctUserKey = `views:total:${USER_NEW}`
    const typoUserKey = `views:total:${USER_NEW_TYPO}`

    const [msgVal, correctUserVal, typoUserVal] = await Promise.all([
      kv.get<number>(msgKey),
      kv.get<number>(correctUserKey),
      kv.get<number>(typoUserKey),
    ])

    const [msgFixed, correctUserFixed] = await Promise.all([
      kv.decrby(msgKey, 1066),
      kv.incrby(correctUserKey, 800),
    ])
    await kv.del(typoUserKey)

    return NextResponse.json({
      ok: true,
      fix: {
        [msgKey]: { before: msgVal, after: msgFixed },
        [correctUserKey]: { before: correctUserVal, after: correctUserFixed },
        [typoUserKey]: { before: typoUserVal, deleted: true },
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
