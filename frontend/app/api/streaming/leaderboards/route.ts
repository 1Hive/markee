// app/api/streaming/leaderboards/route.ts
//
// Enumerates streaming-priced boards (one vertical-agnostic StreamingLeaderboardFactory) and returns
// them normalized to the same row shape as the fixed-price vertical APIs, tagged strategy: 'streaming'.
// The board's ranking value is effectiveRate (wei/sec, on-chain), exposed as effectiveRateRaw.
// Inert (returns []) until NEXT_PUBLIC_STREAMING_FACTORY is configured.

import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { getStreamingBoardMeta } from '@/lib/streaming/boardMeta'
import type { Vertical } from '@/lib/strategy'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:streaming:leaderboards'
const CACHE_TTL = 60 // seconds
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

// Placement -> the `platform` value the vertical listings use. Untagged boards fall back to website.
const VERTICAL_TO_PLATFORM: Record<Vertical, string> = {
  openinternet: 'website',
  github: 'github',
  superfluid: 'superfluid',
}

const FACTORY_ABI = [
  {
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    name: 'getLeaderboards',
    outputs: [{ name: 'result', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLeaderboardFunds', outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'beneficiaryAddress', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topRates', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

export async function GET(request: Request) {
  if (!STREAMING_ENABLED) {
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }

  try {
    const bust = new URL(request.url).searchParams.get('bust') === '1'
    if (!bust) {
      const cached = await kv.get<object>(CACHE_KEY)
      if (cached) return NextResponse.json(cached, { headers: NO_CACHE })
    }

    const client = getClient()
    const factory = STREAMING_FACTORY as `0x${string}`

    const addresses = await client.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }) as `0x${string}`[]

    if (addresses.length === 0) {
      const empty = { leaderboards: [] }
      await kv.set(CACHE_KEY, empty, { ex: CACHE_TTL })
      return NextResponse.json(empty, { headers: NO_CACHE })
    }

    const CHUNK_SIZE = 50
    async function chunkedMulticall(contracts: Parameters<typeof client.multicall>[0]['contracts']) {
      const results = []
      for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
        const chunk = contracts.slice(i, i + CHUNK_SIZE) as Parameters<typeof client.multicall>[0]['contracts']
        results.push(...await client.multicall({ contracts: chunk }))
      }
      return results
    }

    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'beneficiaryAddress' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])
    const metaResults = await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])

    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 5 + 4]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr ? [
        { address: addr, abi: MARKEE_ABI, functionName: 'message' as const },
        { address: addr, abi: MARKEE_ABI, functionName: 'name' as const },
      ] : []
    )
    const [markeeResults, metas] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      Promise.all(addresses.map(a => getStreamingBoardMeta(a))),
    ])

    let markeeCallIndex = 0
    const leaderboards = addresses.map((addr, i) => {
      const b = i * 5
      const name        = (metaResults[b]?.result as string) ?? addr
      const totalFunds  = (metaResults[b + 1]?.result as bigint) ?? 0n
      const markeeCount = (metaResults[b + 2]?.result as bigint) ?? 0n
      const beneficiary = (metaResults[b + 3]?.result as string) ?? ''
      const topResult   = metaResults[b + 4]?.result as [string[], bigint[]] | undefined
      const topRate     = topResult?.[1]?.[0] ?? 0n

      let topMessage: string | null = null
      let topMessageOwner: string | null = null
      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        markeeCallIndex += 2
      }

      const vertical = metas[i]?.vertical ?? 'openinternet'

      return {
        address: addr,
        name,
        platform: VERTICAL_TO_PLATFORM[vertical],
        strategy: 'streaming' as const,
        totalFunds: formatEther(totalFunds),
        totalFundsRaw: totalFunds.toString(),
        markeeCount: Number(markeeCount),
        beneficiary,
        // Streaming boards rank by wei/sec; expose it as effectiveRateRaw and reuse it as the
        // activity signal (topFundsAddedRaw > 0 && topMessage) the listings already filter on.
        effectiveRateRaw: topRate.toString(),
        topRateRaw: topRate.toString(),
        topFundsAddedRaw: topRate.toString(),
        topMessage,
        topMessageOwner,
        topMarkeeAddress: topMarkeeAddresses[i] ?? null,
      }
    })

    const payload = { leaderboards }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/leaderboards] error:', err)
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }
}
