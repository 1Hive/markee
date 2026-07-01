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
import { imputeEffectiveRate } from '@/lib/strategy'
import { STREAMING_ENABLED } from '@/lib/contracts/addresses'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:ecosystem:leaderboards'
const CACHE_TTL = 60 // seconds

// Excluded from totalPlatformFunds — leaderboards with clearly recycled/gamed ETH
const GAMED_ADDRESSES = new Set([
  '0x1b4eb52953d865e0dde1c856c2ead826581e2904',
  '0xb5451c1cb790367d0ddbcbf1249de22b9014ecdc',
  '0x4e413915c0c1d86084e8dcb36d4dec6b66b45a24',
  '0x762c0484599d6a75636cc8cffd9fcb23793dc582',
  '0x8578915859912888407f72f102761b7d21b2e702',
  '0x566f89accd7e6a497e7b4c9f7992f1fe67e564cb',
  '0x1be900ecc09edd0590db88723dbcb3b1fea22fe3',
  '0xe3ee8c369dc37e478bc4b0e7fbbecce5f1dc089f',
  '0x097b06f778ae2fb32a9a4251ccf04fdbebf3733c',
  '0x774d8d9ce01151fc5189c13e362f5061dab0fd8f',
  '0x122140b7714a2aa4507d7742a28d0fd71117a729',
  '0x4ad89044f5f3f324935747a4bce7ba7954d2aaa4',
  '0xc936a036b7727865a696398de30f616be98e266b',
])

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

    // Add bypass header so internal fetches work on protected preview deployments
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    const internalHeaders: HeadersInit = bypassSecret
      ? { 'x-vercel-protection-bypass': bypassSecret }
      : {}

    // Fetch all three platform APIs in parallel
    const [oiRes, githubRes, sfRes] = await Promise.all([
      fetch(`${origin}/api/openinternet/leaderboards${bustParam}`, { cache: 'no-store', headers: internalHeaders }),
      fetch(`${origin}/api/github/leaderboards${bustParam}`, { cache: 'no-store', headers: internalHeaders }),
      fetch(`${origin}/api/superfluid/leaderboards${bustParam}`, { cache: 'no-store', headers: internalHeaders }),
    ])

    const [oiData, githubData, sfData] = await Promise.all([
      oiRes.ok ? oiRes.json() : { leaderboards: [] },
      githubRes.ok ? githubRes.json() : { leaderboards: [] },
      sfRes.ok ? sfRes.json() : { leaderboards: [] },
    ])

    // Streaming boards (vertical-agnostic) are already tagged with their platform + strategy by the
    // streaming API. Only fetched when the streaming factory is configured.
    const streamData = STREAMING_ENABLED
      ? await fetch(`${origin}/api/streaming/leaderboards${bustParam}`, { cache: 'no-store', headers: internalHeaders })
          .then(r => r.ok ? r.json() : { leaderboards: [] })
          .catch(() => ({ leaderboards: [] }))
      : { leaderboards: [] }

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

    // The SF migration leaderboard is a partner leaderboard (migrated from v0.1 TopDawg),
    // not a Superfluid project. Treat it as a verified website entry so it appears in
    // the Verified section alongside Cooperative, Gardens, and Clawchemy.
    const SF_MIGRATION = '0xaa37d049dfbfc07f9e8526a4a9bde418df9f1b79'
    const sfLeaderboards = (sfData.leaderboards ?? []).map((l: any) => {
      if (l.address.toLowerCase() === SF_MIGRATION) {
        return {
          ...l,
          platform: 'website',
          status: 'verified',
          verifiedUrl: 'https://campaigns.superfluid.org',
          verifiedUrls: ['https://campaigns.superfluid.org'],
          logoUrl: l.logoUrl ?? '/partners/superfluid.png',
        }
      }
      return {
        ...l,
        platform: 'superfluid',
        status: undefined,
        verifiedUrl: undefined,
      }
    })

    const streamLeaderboards = (streamData.leaderboards ?? [])

    // Every row carries a strategy (fixed-price unless the streaming API tagged it) and an
    // effectiveRateRaw (wei/sec) yardstick: streaming reads it on-chain, fixed-price imputes it from
    // cumulative funds so both strategies rank on one axis.
    const leaderboards = [...oiLeaderboards, ...githubLeaderboards, ...sfLeaderboards, ...streamLeaderboards]
      .map((l: any) => {
        const strategy = l.strategy === 'streaming' ? 'streaming' : 'fixed'
        const effectiveRateRaw = strategy === 'streaming'
          ? (l.effectiveRateRaw ?? '0')
          : imputeEffectiveRate(BigInt(l.totalFundsRaw ?? '0')).toString()
        return { ...l, strategy, effectiveRateRaw, gamed: GAMED_ADDRESSES.has(l.address?.toLowerCase()) }
      })

    // Sort descending by cumulative funds — fixed boards' lump-sum total, streaming boards' total
    // streamed-in (getLogs). One cumulative-$ axis across strategies.
    leaderboards.sort((a: any, b: any) => {
      const aTotal = BigInt(a.totalFundsRaw ?? '0')
      const bTotal = BigInt(b.totalFundsRaw ?? '0')
      return bTotal > aTotal ? 1 : bTotal < aTotal ? -1 : 0
    })

    // Compute aggregate total across all platforms, excluding gamed leaderboards
    const totalFundsWei = leaderboards.reduce(
      (sum: bigint, l: any) =>
        GAMED_ADDRESSES.has(l.address?.toLowerCase()) ? sum : sum + BigInt(l.totalFundsRaw ?? '0'),
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
