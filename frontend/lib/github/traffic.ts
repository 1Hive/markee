// GitHub's per-repo view traffic, read with the token of whoever linked the repo and cached for an
// hour. Shared by /api/github/traffic-multi and /api/boards/integrations.

import { kv } from '@vercel/kv'

const CACHE_TTL = 3600 // 1 hour, same as /api/github/traffic

export interface RepoTraffic {
  count: number
  uniques: number
}

export async function getGithubToken(uid: string): Promise<string | null> {
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

export async function fetchRepoTraffic(repoFullName: string, token: string): Promise<RepoTraffic | null> {
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
