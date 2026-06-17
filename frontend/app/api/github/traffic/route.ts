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

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const rpcClient = createPublicClient({ chain: base, transport: http(process.env.ALCHEMY_BASE_URL ?? undefined) })

const LEADERBOARD_ABI = [{
  inputs: [{ name: 'limit', type: 'uint256' }],
  name: 'getTopMarkees',
  outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
  stateMutability: 'view',
  type: 'function',
}] as const

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
  let repoMeta = await kv.get<{ owner: string; repo: string; githubUserId: string }>(
    `github:contract:${address}`
  )

  // Fallback for Markees registered before github:contract: was written — derive from linked files.
  if (!repoMeta) {
    const { getLinkedFiles } = await import('@/lib/github/linkedFiles')
    const linkedFiles = await getLinkedFiles(address)
    const first = linkedFiles.find(f => f.verified) ?? linkedFiles[0]
    if (first) {
      repoMeta = { owner: first.repoOwner, repo: first.repoName, githubUserId: first.linkedByUid }
      // Backfill so future calls skip this lookup.
      await kv.set(`github:contract:${address}`, repoMeta, { ex: 60 * 60 * 24 * 365 * 5 })
    }
  }

  if (!repoMeta) {
    return NextResponse.json({ error: 'No GitHub repo linked to this address' }, { status: 404 })
  }

  // Get stored OAuth token for the repo owner
  // The callback route stores this value via JSON.stringify(), so KV may return
  // a raw string rather than a parsed object — handle both cases.
  const rawUserRecord = await kv.get(`github:user:${repoMeta.githubUserId}`)
  const userRecord = typeof rawUserRecord === 'string'
    ? JSON.parse(rawUserRecord) as { accessToken: string; login: string }
    : rawUserRecord as { accessToken: string; login: string } | null
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

  // Credit GitHub views to the top markee slot in KV view tracking.
  // Uses per-day granularity so we accumulate across the rolling 14-day window
  // without double-counting days we've already credited.
  let syncedViews: number | undefined
  if (traffic.views.length > 0) {
    try {
      const [topAddresses] = await rpcClient.readContract({
        address: address as `0x${string}`,
        abi: LEADERBOARD_ABI,
        functionName: 'getTopMarkees',
        args: [1n],
      })
      const topSlot = topAddresses[0]?.toLowerCase()
      if (topSlot) {
        const viewKey     = `views:total:${topSlot}`
        const creditedKey = `views:github:credited:${address}`

        // credited = { "2024-01-15": 42, ... } — counts already added to KV per day
        const credited = (await kv.get<Record<string, number>>(creditedKey)) ?? {}

        let newCredits = 0
        const updatedCredited = { ...credited }
        for (const day of traffic.views) {
          const date          = day.timestamp.split('T')[0]
          const alreadyCredited = credited[date] ?? 0
          const delta           = Math.max(0, day.count - alreadyCredited)
          if (delta > 0) {
            newCredits += delta
            updatedCredited[date] = day.count
          }
        }

        if (newCredits > 0) {
          const newTotal = await kv.incrby(viewKey, newCredits)
          syncedViews = newTotal
          // Keep credited map for 20 days — longer than GitHub's 14-day window so
          // we never re-credit days that have rolled off the window.
          await kv.set(creditedKey, updatedCredited, { ex: 60 * 60 * 24 * 20 })
        } else {
          syncedViews = (await kv.get<number>(viewKey)) ?? 0
        }
      }
    } catch (err) {
      console.error('[traffic] view sync error:', err)
    }
  }

  return NextResponse.json({ ...traffic, cached: false, ...(syncedViews !== undefined ? { syncedViews } : {}) })
}
