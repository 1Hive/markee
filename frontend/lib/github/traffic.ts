// GitHub's per-repo view traffic, read with the token of whoever linked the repo and cached for an
// hour. Shared by /api/github/traffic-multi and /api/boards/integrations.
//
// Every read here is per repo and never throws: a repo whose token is missing or unreadable, whose
// GitHub request fails or times out, or whose cache read fails comes back as null, so one broken repo
// never takes down a response that lists others.

import { kv } from '@vercel/kv'

const CACHE_TTL = 3600 // 1 hour, same as /api/github/traffic
// GitHub normally answers in well under a second; past this the repo's views are left out instead of
// holding up every other integration in the response.
const GITHUB_TIMEOUT_MS = 5_000

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
  const cached = await kv.get<RepoTraffic>(cacheKey).catch(() => null)
  if (cached) return cached

  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/traffic/views`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json() as { count?: number; uniques?: number }
    const traffic: RepoTraffic = { count: data.count ?? 0, uniques: data.uniques ?? 0 }
    // A failed cache write still returns the traffic it read.
    await kv.set(cacheKey, traffic, { ex: CACHE_TTL }).catch(() => {})
    return traffic
  } catch {
    return null
  }
}

/** A repo's traffic with the linker's token, or null if either can't be read. Never throws. */
export async function readRepoTraffic(repoFullName: string, linkedByUid: string): Promise<RepoTraffic | null> {
  try {
    const token = linkedByUid ? await getGithubToken(linkedByUid) : null
    return token ? await fetchRepoTraffic(repoFullName, token) : null
  } catch {
    return null
  }
}
