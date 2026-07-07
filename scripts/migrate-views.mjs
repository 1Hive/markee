#!/usr/bin/env node
// scripts/migrate-views.mjs
//
// Copies Redis view counts from old Markee contract addresses to new ones.
// Loads pairs automatically from a migration results JSON file.
//
// Keys migrated:
//   views:total:{old}          → views:total:{new}  (INCRBY — safe to run multiple times)
//   views:msg:{old}:{msgHash}  → views:msg:{new}:{msgHash}
//
// Usage:
//   1. Dry run (no writes):
//      DRY_RUN=1 KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/migrate-views.mjs
//   2. Live run:
//      KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/migrate-views.mjs
//
// Get KV_REST_API_URL + KV_REST_API_TOKEN from:
//   Vercel dashboard → Storage → your KV store → .env.local tab

import { createClient } from '@vercel/kv'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

// ─── Load migration pairs ─────────────────────────────────────────────────────

const RESULTS_PATH = process.env.RESULTS_PATH ?? '/tmp/migration-sf-factory-results.json'

let results
try {
  results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'))
} catch (e) {
  console.error(`Could not read results file at ${RESULTS_PATH}: ${e.message}`)
  process.exit(1)
}

// Build flat list of all old→new markee pairs across all leaderboard migrations
const MIGRATIONS = results.migrations.flatMap(m =>
  m.newMarkees.map(pair => [pair.old, pair.new])
)

// ─── KV client ────────────────────────────────────────────────────────────────

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('Missing KV env vars.')
  console.error('  KV_REST_API_URL=...  KV_REST_API_TOKEN=...  node scripts/migrate-views.mjs')
  console.error('Get them from: Vercel dashboard → Storage → KV store → .env.local tab')
  process.exit(1)
}

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// ─── Migration logic ──────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === '1'

async function migrateOne(oldAddr, newAddr) {
  const old = oldAddr.toLowerCase()
  const neo = newAddr.toLowerCase()

  // Total views
  const total = await kv.get(`views:total:${old}`)
  const totalCount = Number(total ?? 0)

  if (totalCount > 0) {
    console.log(`  [${old}] views:total +${totalCount} → ${neo}`)
    if (!DRY_RUN) await kv.incrby(`views:total:${neo}`, totalCount)
  }

  // Per-message views — scan all matching keys
  let cursor = 0
  let msgCount = 0
  do {
    const [nextCursor, keys] = await kv.scan(cursor, { match: `views:msg:${old}:*`, count: 100 })
    cursor = nextCursor
    for (const key of keys) {
      const value = Number(await kv.get(key))
      if (value > 0) {
        const hash = key.split(':').pop()
        const newKey = `views:msg:${neo}:${hash}`
        console.log(`  [${old}] views:msg:...:${hash} +${value} → ${neo}`)
        if (!DRY_RUN) await kv.incrby(newKey, value)
        msgCount++
      }
    }
  } while (cursor !== 0)

  return { totalCount, msgCount }
}

async function main() {
  console.log(`migrate-views: ${MIGRATIONS.length} pairs from ${RESULTS_PATH}`)
  console.log(DRY_RUN ? 'DRY RUN — no writes\n' : 'LIVE — writing to KV\n')

  let pairsWithViews = 0
  let totalViewsMigrated = 0
  let totalMsgKeysMigrated = 0

  for (const [oldAddr, newAddr] of MIGRATIONS) {
    const { totalCount, msgCount } = await migrateOne(oldAddr, newAddr)
    if (totalCount > 0 || msgCount > 0) {
      pairsWithViews++
      totalViewsMigrated += totalCount
      totalMsgKeysMigrated += msgCount
    }
  }

  console.log(`\nDone.`)
  console.log(`  Pairs with views: ${pairsWithViews} / ${MIGRATIONS.length}`)
  console.log(`  Total views migrated: ${totalViewsMigrated}`)
  console.log(`  Message view keys migrated: ${totalMsgKeysMigrated}`)
  if (DRY_RUN) console.log(`  (dry run — no writes were made)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
