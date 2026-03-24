// app/api/github/traffic/route.ts
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'

const CACHE_TTL = 3600 // cache GitHub traffic for 1 hour

interface GitHubTrafficDay {
  timestamp: string
  count: number
  uniques: number
}

interface GitHubTrafficResponse {
  count: number
  uniques: number
  views: GitHubTrafficDay[]
}

// GET /api/github/traffic?address=0x...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')?.toLowerCase().trim()

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  // Check short-lived cache first
  const cacheKey = `views:github:${address}`
  const lastKey = `views:github:last:${address}`
  const cached = await kv.get<GitHubTrafficResponse>(cacheKey)
  if (cached) {
    return NextResponse.json({ ...cached, cached: true })
  }

  // Reverse-lookup: address → { owner, repo, githubUserId }
  // Written by register-markee/route.ts on each successful registration.
  // githubUserId is stored as a string (the uid cookie value) — not a number.
  const repoMeta = await kv.get<{ owner: string; repo: string; githubUserId: string }>(
    `github:contract:${address}`
  )
  if (!repoMeta) {
    return NextResponse.json({ error: 'No GitHub repo linked to this address' }, { status: 404 })
  }

  // Get stored OAuth token for the repo owner
  const userRecord = await kv.get<{ accessToken: string; login: string }>(
    `github:user:${repoMeta.githubUserId}`
  )
  if (!userRecord?.accessToken) {
    // Fall back to last-known value if token is gone
    const last = await kv.get<GitHubTrafficResponse>(lastKey)
    if (last) return NextResponse.json({ ...last, cached: true, stale: true })
    return NextResponse.json(
      { error: 'GitHub token not found — user may need to reconnect' },
      { status: 401 }
    )
  }

  // Hit GitHub Traffic API
  const ghRes = await fetch(
    `https://api.github.com/repos/${repoMeta.owner}/${repoMeta.repo}/traffic/views`,
    {
      headers: {
        Authorization: `Bearer ${userRecord.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!ghRes.ok) {
    const err = await ghRes.json().catch(() => ({}))
    // Fall back to last-known value on auth or API failure
    const last = await kv.get<GitHubTrafficResponse>(lastKey)
    if (last) return NextResponse.json({ ...last, cached: true, stale: true })
    if (ghRes.status === 403 || ghRes.status === 401) {
      return NextResponse.json(
        { error: 'GitHub token expired or permissions revoked — reconnect repo to refresh' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { error: 'GitHub API error', details: err },
      { status: ghRes.status }
    )
  }

  const traffic: GitHubTrafficResponse = await ghRes.json()

  // Cache result for 1 hour; also persist as last-known (no TTL)
  await Promise.all([
    kv.set(cacheKey, traffic, { ex: CACHE_TTL }),
    kv.set(lastKey, traffic),
  ])

  return NextResponse.json({ ...traffic, cached: false })
}
