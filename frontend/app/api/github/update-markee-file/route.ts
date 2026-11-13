// app/api/github/update-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { underRateLimit, clientIp } from '@/lib/rate-limit'
import { syncMarkeeFile } from '@/lib/github/markeeSync'

// @vercel/kv leaves fetch caching to Next, which would otherwise store (and can replay) KV reads.
export const dynamic = 'force-dynamic'

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { leaderboardAddress } = (body ?? {}) as { leaderboardAddress?: string }
  if (typeof leaderboardAddress !== 'string' || !isAddress(leaderboardAddress))
    return NextResponse.json({ error: 'Missing leaderboardAddress' }, { status: 400 })

  const normalizedAddress = leaderboardAddress.toLowerCase() as `0x${string}`
  const [ipAllowed, boardAllowed] = await Promise.all([
    underRateLimit('github-sync', clientIp(request), 10, 60),
    underRateLimit('github-sync-board', normalizedAddress, 30, 600),
  ])
  if (!ipAllowed || !boardAllowed)
    return NextResponse.json({ error: 'Too many sync requests, try again shortly' }, { status: 429 })
  const outcome = await syncMarkeeFile(normalizedAddress)
  return NextResponse.json(outcome.body, { status: outcome.status })
}
