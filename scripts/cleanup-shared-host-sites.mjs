// One-off cleanup of oi:meta site lists (2026-11-25).
//
// 1. Removes webhook.site pages that were attached as "verified sites" through the SDK's
//    sites/verify endpoint before it refused shared-content hosts.
// 2. Writes the hardcoded partner sites (PARTNER_META in app/api/openinternet/leaderboards/route.ts)
//    into the partner boards' v1.4 oi:meta, so every reader agrees with the listing.
//
// Dry run by default; pass --apply to write. Needs KV_REST_API_URL and KV_REST_API_TOKEN for the
// production store in the environment. Each write is compare-and-set against the value it read, so a
// board changed in between is reported and left alone; rerun to pick it up.
//
//   cd scripts && node cleanup-shared-host-sites.mjs            # show what would change
//   cd scripts && node cleanup-shared-host-sites.mjs --apply    # write it

import { kv } from '@vercel/kv'
import { randomUUID } from 'node:crypto'

const APPLY = process.argv.includes('--apply')

const PROBE = 'https://webhook.site/d21b2946-3aab-4141-af95-b979b31d0c15'
const PLAN = [
  { name: 'SUPERMARKEE', board: '0xc35f77c544d48a0cad03d707303d0c11b7ba512f', remove: [PROBE] },
  { name: 'Gardens Community', board: '0x5b3c796450b872b9907aaf95d58f101cbad8ad6d', remove: [PROBE] },
  { name: 'Frog & Goose', board: '0x03f91588106dfa1c0eb0d852632792cc9aa3d54b', remove: [PROBE] },
  {
    name: 'Gardens', board: '0xe6fdab2ed2ee833b39d37504940a66695fb12f0b', remove: [PROBE],
    partner: { logoUrl: '/partners/gardens.png', siteUrl: 'https://app.gardens.fund', urls: ['https://app.gardens.fund'] },
  },
  {
    name: 'Markee Cooperative', board: '0x61c23c277a398b938c0be04fb27a36563d28b5d8',
    remove: ['https://webhook.site/b93c218c-53ab-4c00-9c6c-5691d4afae67', 'https://webhook.site/18a54d58-cc82-4c6c-be9d-88d20088e736'],
    partner: { logoUrl: '/markee-logo.png', siteUrl: 'https://markee.xyz', urls: ['https://markee.xyz'] },
  },
  {
    name: 'Clawchemy', board: '0xeabfe2812f35e6c7874711d7a9cc007b9823bebd', remove: [],
    partner: { logoUrl: '/partners/clawchemy.png', siteUrl: 'https://clawchemy.xyz', urls: ['https://clawchemy.xyz'] },
  },
]

// The leading character keeps the reply from being JSON, so the client hands back the exact string.
const READ = `local v=redis.call('GET',KEYS[1]); if not v then return '0' end; return '1'..v`
const CAS = `local v=redis.call('GET',KEYS[1]) or ''; if v~=ARGV[1] then return 'changed' end; redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL'); return 'ok'`
const CACHES = [
  'cache:openinternet:leaderboards', 'cache:forsale:leaderboards', 'cache:streaming:leaderboards', 'cache:ecosystem:leaderboards',
  ...['openinternet', 'forsale', 'streaming'].map(p => `sdk:snapshots:v1:listings:cache:${p}:leaderboards`),
]

function nextMeta(existing, { remove, partner }) {
  const current = Array.isArray(existing.verifiedUrls) ? existing.verifiedUrls : existing.verifiedUrl ? [existing.verifiedUrl] : []
  const kept = current.filter(u => !remove.includes(u) && !(partner?.urls ?? []).includes(u))
  const urls = [...(partner?.urls ?? []), ...kept]
  return {
    ...existing,
    ...(partner ? { logoUrl: existing.logoUrl ?? partner.logoUrl, siteUrl: existing.siteUrl ?? partner.siteUrl } : {}),
    verifiedUrls: urls,
    verifiedUrl: urls[0] ?? null,
    // Same as an owner removing their last site in /api/openinternet/meta.
    status: urls.length ? 'verified' : 'pending',
  }
}

let wrote = 0
for (const step of PLAN) {
  const key = `oi:meta:${step.board}`
  const reply = String(await kv.eval(READ, [key], []))
  const raw = reply.startsWith('1') ? reply.slice(1) : ''
  const existing = raw ? JSON.parse(raw) : {}
  const next = nextMeta(existing, step)
  const before = existing.verifiedUrls ?? (existing.verifiedUrl ? [existing.verifiedUrl] : [])
  if (JSON.stringify(next) === raw) { console.log(`= ${step.name} (${step.board}) already clean`); continue }
  console.log(`${APPLY ? '*' : '~'} ${step.name} (${step.board})\n    before: ${JSON.stringify(before)}\n    after:  ${JSON.stringify(next.verifiedUrls)}  status=${next.status}${step.partner ? `  logo=${next.logoUrl}` : ''}`)
  if (!APPLY) continue
  const result = await kv.eval(CAS, [key], [raw, JSON.stringify(next)])
  if (result === 'ok') wrote++
  else console.warn(`    skipped: ${key} changed since it was read; rerun`)
}

if (APPLY && wrote > 0) {
  await kv.set('sdk:snapshots:generation', randomUUID())
  await Promise.all(CACHES.map(k => kv.del(k)))
  console.log(`\nWrote ${wrote} board(s); cleared listing and SDK snapshot caches.`)
} else if (!APPLY) {
  console.log('\nDry run. Rerun with --apply to write.')
}
