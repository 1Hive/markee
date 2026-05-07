#!/usr/bin/env node
// scripts/migrate-views.mjs
//
// Copies Redis view counts from old Markee contract addresses to new ones.
// Use this when migrating legacy Markees to v1.1 clones so view history is preserved.
//
// Keys migrated:
//   views:total:{old}          → views:total:{new}
//   views:msg:{old}:{msgHash}  → views:msg:{new}:{msgHash}  (all keys for that address)
//
// Usage:
//   1. Fill in MIGRATIONS below with [oldAddress, newAddress] pairs
//   2. Dry run (no writes): DRY_RUN=1 KV_URL=rediss://... node scripts/migrate-views.mjs
//   3. Live run:                        KV_URL=rediss://... node scripts/migrate-views.mjs
//
// Get KV_URL from: Vercel dashboard → Storage → your KV store → .env.local tab

import { kv } from '@vercel/kv'

// ─── Fill in before running ───────────────────────────────────────────────────

const MIGRATIONS = [
  ['0x8F670c82a17AA3d1cbEf24813b02DF5398dC9637', '0x8B06b9eFaaffE15F17848D1eC61a4682fC9B2cf8'],
  ['0x8198Bd516f0b683C216157470a170Fbd1fb70993', '0xC8363B3E28db6296F3A0e3e04Feb31e4952e69Aa'],
]

// ─────────────────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === '1'

async function migrateOne(oldAddr, newAddr) {
  const old = oldAddr.toLowerCase()
  const neo = newAddr.toLowerCase()

  console.log(`\n${old}\n  → ${neo}${DRY_RUN ? '  [DRY RUN]' : ''}`)

  // Total views
  const total = await kv.get(`views:total:${old}`)
  if (total !== null) {
    console.log(`  views:total  ${total}`)
    if (!DRY_RUN) await kv.set(`views:total:${neo}`, total)
  } else {
    console.log(`  views:total  (none)`)
  }

  // Per-message views — scan all matching keys
  let cursor = 0
  let count = 0
  do {
    const [nextCursor, keys] = await kv.scan(cursor, { match: `views:msg:${old}:*`, count: 100 })
    cursor = nextCursor
    for (const key of keys) {
      const value = await kv.get(key)
      const newKey = `views:msg:${neo}:${key.split(':').pop()}`
      console.log(`  ${key}  →  ${newKey}  (${value})`)
      if (!DRY_RUN) await kv.set(newKey, value)
      count++
    }
  } while (cursor !== 0)

  console.log(`  message view keys: ${count}`)
}

async function main() {
  if (MIGRATIONS.length === 0) {
    console.error('No migrations defined — fill in the MIGRATIONS array at the top of the script.')
    process.exit(1)
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error('Missing KV env vars. Run: vercel env pull .env.local')
    console.error('Then: source .env.local && node migrate-views.mjs')
    process.exit(1)
  }

  console.log(`Running ${MIGRATIONS.length} migration(s)${DRY_RUN ? ' — DRY RUN, no writes' : ''}`)

  for (const [oldAddr, newAddr] of MIGRATIONS) {
    await migrateOne(oldAddr, newAddr)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
