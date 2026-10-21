// app/api/github/traffic-multi/route.ts
//
// Per-repo view traffic for every distinct repo linked to a board -- /api/github/traffic only ever
// reports one repo (the single github:contract:{address} reverse-lookup, overwritten on each new
// registration), which can't rank multiple linked repos by views. This reads getLinkedFiles(address)
// directly instead, fetches each unique repo's traffic with whichever linker's token registered it,
// and skips (rather than fails) any repo whose token is missing/expired -- this powers a "sort by
// views" display, not the canonical view-count-crediting path that /api/github/traffic also does.

import { NextRequest, NextResponse } from 'next/server'
import { getLinkedFiles } from '@/lib/github/linkedFiles'
import { getGithubToken, fetchRepoTraffic, type RepoTraffic } from '@/lib/github/traffic'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const RATE_WINDOW = 60
const RATE_MAX = 30

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
