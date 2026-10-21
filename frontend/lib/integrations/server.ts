import 'server-only'
import { kv } from '@vercel/kv'
import { parseAbi, type Address } from 'viem'
import { getLinkedFilesBatch } from '@/lib/github/linkedFiles'
import { getGithubToken, fetchRepoTraffic } from '@/lib/github/traffic'
import { getModerationClient } from '@/lib/moderation/server'
import { BOARD_MESSAGE_LIMIT } from '@/lib/streaming/listing'
import { normalizeHost } from '@/lib/views/host'
import { fileIntegrationKey, urlIntegrationKey, type BoardIntegrations } from '@/lib/integrations/featured'

// The owner's pick, as an integration key. Absent means "most viewed".
export const featuredKvKey = (board: string) => `board:featured:${board.toLowerCase()}`

const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])
const MGET_CHUNK = 500

async function mgetNumbers(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (let i = 0; i < keys.length; i += MGET_CHUNK) {
    const chunk = keys.slice(i, i + MGET_CHUNK)
    const counts = await kv.mget<(number | null)[]>(...chunk)
    chunk.forEach((k, j) => out.set(k, Number(counts[j] ?? 0)))
  }
  return out
}

// Each board's verified integrations with their views, and which one is featured.
//
// A site's views add up across the board and every message on it: embeds report views under the
// message on top at the time, so the site keeps its views when the top message changes. A GitHub
// file's views are its repo's traffic, as on the board page.
export async function readBoardIntegrations(boardsIn: string[]): Promise<Record<string, BoardIntegrations>> {
  const boards = boardsIn.map(b => b.toLowerCase())
  if (boards.length === 0) return {}

  const [files, metas, choices] = await Promise.all([
    getLinkedFilesBatch(boards),
    kv.mget<({ verifiedUrls?: string[]; verifiedUrl?: string } | null)[]>(...boards.map(b => `oi:meta:${b}`)),
    kv.mget<(string | null)[]>(...boards.map(featuredKvKey)),
  ])
  const urlsOf = boards.map((_, i) => {
    const meta = metas[i]
    return meta?.verifiedUrls?.length ? meta.verifiedUrls : meta?.verifiedUrl ? [meta.verifiedUrl] : []
  })
  const filesOf = files.map(fs => fs.filter(f => f.verified))

  // Messages only matter for boards with sites. Legacy boards have no getTopMarkees and count by
  // board address alone.
  const withUrls = boards.filter((_, i) => urlsOf[i].length > 0)
  const tops = withUrls.length
    ? await getModerationClient().multicall({
        contracts: withUrls.map(address => ({ address: address as Address, abi: TOP_ABI, functionName: 'getTopMarkees' as const, args: [BigInt(BOARD_MESSAGE_LIMIT)] as const })),
      }).catch(() => [])
    : []
  const messagesOf = new Map(withUrls.map((b, i) => [b, ((tops[i]?.result?.[0] ?? []) as readonly string[]).map(a => a.toLowerCase())]))

  const urlKeys = boards.flatMap((b, i) => urlsOf[i].flatMap(url => {
    const host = normalizeHost(url)
    return host ? [b, ...(messagesOf.get(b) ?? [])].map(a => `views:url:${a}:${host}`) : []
  }))
  const urlCounts = await mgetNumbers([...new Set(urlKeys)])

  // One traffic read per repo (cached for an hour), with the token of whoever linked it.
  const repoLinker = new Map<string, string>()
  filesOf.flat().forEach(f => { if (!repoLinker.has(f.repoFullName)) repoLinker.set(f.repoFullName, f.linkedByUid) })
  const repoViews = new Map(await Promise.all([...repoLinker].map(async ([repo, uid]) => {
    const token = await getGithubToken(uid).catch(() => null)
    const traffic = token ? await fetchRepoTraffic(repo, token) : null
    return [repo, traffic?.count ?? 0] as const
  })))

  return Object.fromEntries(boards.map((b, i) => {
    const views: Record<string, number> = {}
    // Same order as the dashboard lists them: GitHub files, then sites. Ties go to the earlier one.
    filesOf[i].forEach(f => { views[fileIntegrationKey(f)] = repoViews.get(f.repoFullName) ?? 0 })
    urlsOf[i].forEach(url => {
      const host = normalizeHost(url)
      views[urlIntegrationKey(url)] = host
        ? [b, ...(messagesOf.get(b) ?? [])].reduce((sum, a) => sum + (urlCounts.get(`views:url:${a}:${host}`) ?? 0), 0)
        : 0
    })
    const keys = Object.keys(views)
    const choice = choices[i]
    const chosen = !!choice && keys.includes(choice)
    const featured = chosen ? choice : keys.reduce<string | null>((best, k) => best === null || views[k] > views[best] ? k : best, null)
    return [b, { featured, chosen, views }]
  }))
}
