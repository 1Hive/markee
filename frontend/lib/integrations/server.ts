import 'server-only'
import { kv } from '@vercel/kv'
import { parseAbi, type Address } from 'viem'
import { getLinkedFilesBatch, type LinkedFile } from '@/lib/github/linkedFiles'
import { readRepoTraffic } from '@/lib/github/traffic'
import { getModerationClient } from '@/lib/moderation/server'
import { BOARD_MESSAGE_LIMIT } from '@/lib/streaming/listing'
import { lastSiteViewKey, normalizeHost } from '@/lib/views/host'
import { fileIntegrationKey, onePerDomain, pickFeatured, urlIntegrationKey, type BoardIntegrations } from '@/lib/integrations/featured'
import { fileSyncKey, type FileSyncStatus } from '@/lib/github/syncSchedule'

// The owner's pick, as an integration key. Absent means "most viewed".
export const featuredKvKey = (board: string) => `board:featured:${board.toLowerCase()}`

const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])
const MGET_CHUNK = 500

// A source that failed: logged, and replaced by `fallback` so the rest of the response still works.
function orFallback<T>(p: Promise<T>, fallback: T, what: string): Promise<T> {
  return p.catch(err => {
    console.warn(`[integrations] ${what} read failed`, err)
    return fallback
  })
}

// Counts by key. A chunk whose read fails leaves its keys out, so callers can tell "unknown" from 0.
async function mgetNumbers(keys: string[], what: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const chunks: string[][] = []
  for (let i = 0; i < keys.length; i += MGET_CHUNK) chunks.push(keys.slice(i, i + MGET_CHUNK))
  await Promise.all(chunks.map(async chunk => {
    const counts = await orFallback(kv.mget<(number | null)[]>(...chunk), null, what)
    if (counts) chunk.forEach((k, j) => out.set(k, Number(counts[j] ?? 0) || 0))
  }))
  return out
}

async function hgetallChunked(keys: string[]): Promise<(Record<string, unknown> | null)[]> {
  const out: (Record<string, unknown> | null)[] = []
  for (let i = 0; i < keys.length; i += MGET_CHUNK) {
    const pipeline = kv.pipeline()
    keys.slice(i, i + MGET_CHUNK).forEach(k => pipeline.hgetall(k))
    out.push(...await pipeline.exec<(Record<string, unknown> | null)[]>())
  }
  return out
}

// Stored as JSON; the KV client may already have parsed it.
function parseFileSync(raw: unknown): FileSyncStatus | null {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return v && typeof v === 'object' && typeof (v as FileSyncStatus).ok === 'boolean' && typeof (v as FileSyncStatus).at === 'number'
      ? { ok: (v as FileSyncStatus).ok, at: (v as FileSyncStatus).at, error: typeof (v as FileSyncStatus).error === 'string' ? (v as FileSyncStatus).error : undefined, permanent: (v as FileSyncStatus).permanent === true }
      : null
  } catch { return null }
}

// Each board's verified integrations with their views, and which one is featured.
//
// A site's views add up across the board and every message on it: embeds report views under the
// message on top at the time, so the site keeps its views when the top message changes. A GitHub
// file's views are its repo's traffic, as on the board page.
//
// Every source is read on its own and none can fail the response: a site or repo whose views can't be
// read is listed in `unavailable` (views 0) and the others are served as usual. A failed read of the
// board's sites or GitHub files leaves that kind out; a failed sync-status read leaves out the badges.
export async function readBoardIntegrations(boardsIn: string[]): Promise<Record<string, BoardIntegrations>> {
  const boards = boardsIn.map(b => b.toLowerCase())
  if (boards.length === 0) return {}

  const [files, metas, choices] = await Promise.all([
    orFallback(getLinkedFilesBatch(boards), boards.map((): LinkedFile[] => []), 'linked files'),
    orFallback(kv.mget<({ verifiedUrls?: string[]; verifiedUrl?: string } | null)[]>(...boards.map(b => `oi:meta:${b}`)), boards.map(() => null), 'verified sites'),
    orFallback(kv.mget<(string | null)[]>(...boards.map(featuredKvKey)), boards.map(() => null), 'featured choices'),
  ])
  const urlsOf = boards.map((_, i) => {
    const meta = metas[i]
    return onePerDomain(meta?.verifiedUrls?.length ? meta.verifiedUrls : meta?.verifiedUrl ? [meta.verifiedUrl] : [], choices[i])
  })
  const filesOf = boards.map((_, i) => (files[i] ?? []).filter(f => f.verified))

  // Each GitHub file's last sync (lib/github/markeeSync.ts), for boards that have files. Only the
  // per-embed sync badges need it.
  const withFiles = boards.filter((_, i) => filesOf[i].length > 0)
  // Messages only matter for boards with sites. Legacy boards have no getTopMarkees and count by
  // board address alone; if the whole read fails, every site's views are unknown.
  const withUrls = boards.filter((_, i) => urlsOf[i].length > 0)
  const [syncHashes, tops] = await Promise.all([
    withFiles.length ? orFallback(hgetallChunked(withFiles.map(fileSyncKey)), [], 'sync status') : [],
    withUrls.length
      ? orFallback(getModerationClient().multicall({
          contracts: withUrls.map(address => ({ address: address as Address, abi: TOP_ABI, functionName: 'getTopMarkees' as const, args: [BigInt(BOARD_MESSAGE_LIMIT)] as const })),
        }), null, 'top messages')
      : [],
  ])
  const syncOf = new Map(withFiles.map((b, i) => [b, syncHashes[i]]))
  const messagesOf = new Map(withUrls.map((b, i) => [b, ((tops?.[i]?.result?.[0] ?? []) as readonly string[]).map(a => a.toLowerCase())]))
  const siteAddresses = (b: string) => [b, ...(messagesOf.get(b) ?? [])]

  const siteKeys = (keyOf: (address: string, host: string) => string) => [...new Set(boards.flatMap((b, i) => urlsOf[i].flatMap(url => {
    const host = normalizeHost(url)
    return host ? siteAddresses(b).map(a => keyOf(a, host)) : []
  })))]
  const urlViewKey = (a: string, host: string) => `views:url:${a}:${host}`
  // One traffic read per repo (cached for an hour), with the token of whoever linked it.
  const repoLinker = new Map<string, string>()
  filesOf.flat().forEach(f => { if (!repoLinker.has(f.repoFullName)) repoLinker.set(f.repoFullName, f.linkedByUid) })
  const [urlCounts, lastSeen, repoViews] = await Promise.all([
    mgetNumbers(siteKeys(urlViewKey), 'site views'),
    mgetNumbers(siteKeys(lastSiteViewKey), 'last site views'),
    Promise.all([...repoLinker].map(async ([repo, uid]) => [repo, await readRepoTraffic(repo, uid)] as const)).then(entries => new Map(entries)),
  ])

  return Object.fromEntries(boards.map((b, i) => {
    const views: Record<string, number> = {}
    const lastView: Record<string, number | null> = {}
    const unavailable: string[] = []
    // Same order as the dashboard lists them: GitHub files, then sites. Ties go to the earlier one.
    // Set only once a file has a sync record; boards without one carry no `sync` field.
    let sync: Record<string, FileSyncStatus> | undefined
    filesOf[i].forEach(f => {
      const key = fileIntegrationKey(f)
      const traffic = repoViews.get(f.repoFullName)
      views[key] = traffic?.count ?? 0
      if (!traffic) unavailable.push(key)
      const status = parseFileSync(syncOf.get(b)?.[key])
      if (status) (sync ??= {})[key] = status
    })
    urlsOf[i].forEach(url => {
      const key = urlIntegrationKey(url)
      const host = normalizeHost(url)
      const addrs = siteAddresses(b)
      const counts = host ? addrs.map(a => urlCounts.get(urlViewKey(a, host))) : []
      views[key] = counts.reduce<number>((sum, n) => sum + (n ?? 0), 0)
      if (tops === null || counts.some(n => n === undefined)) unavailable.push(key)
      const last = host ? Math.max(0, ...addrs.map(a => lastSeen.get(lastSiteViewKey(a, host)) ?? 0)) : 0
      lastView[key] = last || null
    })
    const { featured, chosen } = pickFeatured(views, choices[i], unavailable)
    return [b, {
      featured, chosen, views, lastView,
      ...(sync ? { sync } : {}),
      ...(unavailable.length ? { unavailable } : {}),
    }]
  }))
}
