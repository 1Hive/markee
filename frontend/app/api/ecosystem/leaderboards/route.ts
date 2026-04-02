// app/api/ecosystem/leaderboards/route.ts
//
// Aggregates all three platform leaderboards into a single unified list.
// Each leaderboard has a `platform` field: 'website' | 'github' | 'superfluid'
//
// Sections (determined by caller):
//   Top Verified Markees  — platform: 'website', status: 'verified', markeeCount > 0
//   Unverified Markees    — markeeCount > 0, not verified
//   Awaiting Activation   — markeeCount === 0

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { formatEther } from 'viem'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:ecosystem:leaderboards'
const CACHE_TTL = 60 // seconds

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: Request) {
  try {
    const bust = new URL(request.url).searchParams.get('bust') === '1'
    if (!bust) {
      const cached = await kv.get<object>(CACHE_KEY)
      if (cached) return NextResponse.json(cached, { headers: NO_CACHE })
    }

    const origin = new URL(request.url).origin
    const bustParam = bust ? '?bust=1' : ''

    // Fetch all three platform APIs in parallel
    const [oiRes, githubRes, sfRes] = await Promise.all([
      fetch(`${origin}/api/openinternet/leaderboards${bustParam}`, { cache: 'no-store' }),
      fetch(`${origin}/api/github/leaderboards${bustParam}`, { cache: 'no-store' }),
      fetch(`${origin}/api/superfluid/leaderboards${bustParam}`, { cache: 'no-store' }),
    ])

    const [oiData, githubData, sfData] = await Promise.all([
      oiRes.ok ? oiRes.json() : { leaderboards: [] },
      githubRes.ok ? githubRes.json() : { leaderboards: [] },
      sfRes.ok ? sfRes.json() : { leaderboards: [] },
    ])

    // Tag each with platform identifier
    const oiLeaderboards = (oiData.leaderboards ?? []).map((l: any) => ({
      ...l,
      platform: 'website',
    }))

    const githubLeaderboards = (githubData.leaderboards ?? []).map((l: any) => ({
      ...l,
      platform: 'github',
      status: undefined,
      verifiedUrl: undefined,
    }))

    const sfLeaderboards = (sfData.leaderboards ?? []).map((l: any) => ({
      ...l,
      platform: 'superfluid',
      status: undefined,
      verifiedUrl: undefined,
    }))

    const leaderboards = [...oiLeaderboards, ...githubLeaderboards, ...sfLeaderboards]

    // Sort descending by total funds
    leaderboards.sort((a: any, b: any) => {
      const aWei = BigInt(a.totalFundsRaw ?? '0')
      const bWei = BigInt(b.totalFundsRaw ?? '0')
      return bWei > aWei ? 1 : bWei < aWei ? -1 : 0
    })

    // Compute aggregate total across all platforms
    const totalFundsWei = leaderboards.reduce(
      (sum: bigint, l: any) => sum + BigInt(l.totalFundsRaw ?? '0'),
      0n,
    )

    const payload = {
      leaderboards,
      totalPlatformFunds: formatEther(totalFundsWei),
      counts: {
        website: oiLeaderboards.length,
        github: githubLeaderboards.length,
        superfluid: sfLeaderboards.length,
      },
    }

    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[ecosystem/leaderboards] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
