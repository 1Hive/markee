// app/api/github/traffic-multi/route.ts
//
// Per-repo view traffic for every distinct repo linked to a board -- /api/github/traffic only ever
// reports one repo (the single github:contract:{address} reverse-lookup, overwritten on each new
// registration), which can't rank multiple linked repos by views. This reads getLinkedFiles(address)
// directly instead, fetches each unique repo's traffic with whichever linker's token registered it,
// and skips (rather than fails) any repo whose token is missing/expired -- this powers a "sort by
// views" display, not the canonical view-count-crediting path that /api/github/traffic also does.

import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { getLinkedFiles } from '@/lib/github/linkedFiles'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const CACHE_TTL = 3600 // 1 hour, same as /api/github/traffic
const RATE_WINDOW = 60
const RATE_MAX = 30

interface RepoTraffic {
  count: number
  uniques: number
}

async function getGithubToken(uid: string): Promise<string | null> {
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

async function fetchRepoTraffic(repoFullName: string, token: string): Promise<RepoTraffic | null> {
  const cacheKey = `views:github:repo:${repoFullName.toLowerCase()}`
  const cached = await kv.get<RepoTraffic>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/traffic/views`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) return null
    const data = await res.json() as { count?: number; uniques?: number }
    const traffic: RepoTraffic = { count: data.count ?? 0, uniques: data.uniques ?? 0 }
    await kv.set(cacheKey, traffic, { ex: CACHE_TTL })
    return traffic
  } catch {
    return null
  }
}

// GET /api/github/traffic-multi?address=0x...
export async function GET(req: NextRequest) {
  if (!await underRateLimit('github:traffic-multi', clientIp(req), RATE_MAX, RATE_WINDOW)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(RATE_WINDOW) } })
  }
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')?.toLowerCase().trim()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const linkedFiles = await getLinkedFiles(address)
  const verified = linkedFiles.filter(f => f.verified)

  // One traffic fetch per unique repo, using whichever linker's token registered it first.
  const byRepo = new Map<string, string>() // repoFullName -> linkedByUid
  for (const f of verified) {
    if (!byRepo.has(f.repoFullName)) byRepo.set(f.repoFullName, f.linkedByUid)
  }

  const entries = await Promise.all(
    [...byRepo.entries()].map(async ([repoFullName, uid]) => {
      const token = await getGithubToken(uid)
      if (!token) return [repoFullName, null] as const
      const traffic = await fetchRepoTraffic(repoFullName, token)
      return [repoFullName, traffic] as const
    })
  )

  const result: Record<string, RepoTraffic> = {}
  for (const [repoFullName, traffic] of entries) {
    if (traffic) result[repoFullName] = traffic
  }

  return NextResponse.json({ repos: result })
}
