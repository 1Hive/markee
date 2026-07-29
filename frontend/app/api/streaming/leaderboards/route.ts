// app/api/streaming/leaderboards/route.ts
//
// Enumerates streaming-priced boards (one vertical-agnostic StreamingLeaderboardFactory) and returns
// them normalized to the same row shape as the fixed-price vertical APIs, tagged strategy: 'streaming'.
// totalFundsRaw is what the board raised (subgraph inflow net of GDA refunds, plus lump sums carried
// over by a migrated board); effectiveRateRaw is the current top wei/sec for the $/mo label.
// Inert (returns []) until NEXT_PUBLIC_STREAMING_FACTORY is configured.

import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { getStreamingBoardMeta } from '@/lib/streaming/boardMeta'
import { fetchBoardTotals } from '@/lib/streaming/subgraph'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import { VERTICAL_PLATFORM, verticalFromPlatform, type Vertical } from '@/lib/strategy'
import { StreamingLeaderboardFactoryABI, StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:streaming:leaderboards'
const CACHE_TTL = 60 // seconds
// Served when the totals source fails: stale beats wrong for the headline number.
const LAST_GOOD_KEY = 'cache:streaming:leaderboards:lastgood'
const LAST_GOOD_TTL = 7 * 24 * 60 * 60
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

function getClient() {
  // The streaming factory lives on whatever chain NEXT_PUBLIC_STREAMING_FACTORY was deployed to,
  // which is the chain NEXT_PUBLIC_BASE_RPC_URL points at (the same RPC every client-side streaming
  // hook reads). Prefer it so this server-side read sees the same factory; fall back to Alchemy/default.
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org',
      { batch: true, fetchOptions: { cache: 'no-store' } },
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
      abi: StreamingLeaderboardFactoryABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }) as `0x${string}`[]

    if (addresses.length === 0) {
      const empty = { leaderboards: [] }
      await kv.set(CACHE_KEY, empty, { ex: CACHE_TTL })
      return NextResponse.json(empty, { headers: NO_CACHE })
    }

    const latestBlock = await client.getBlockNumber()
    const streamedAt = Number((await client.getBlock({ blockNumber: latestBlock })).timestamp)
    const ETHX = STREAMING_BASE.ethx as `0x${string}`

    const CHUNK_SIZE = 50
    async function chunkedMulticall(contracts: Parameters<typeof client.multicall>[0]['contracts']) {
      const chunks = []
      for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
        chunks.push(contracts.slice(i, i + CHUNK_SIZE) as Parameters<typeof client.multicall>[0]['contracts'])
      }
      const results = await Promise.all(chunks.map(chunk => client.multicall({ contracts: chunk })))
      return results.flat()
    }

    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'markeeCount' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'beneficiaryAddress' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'admin' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])
    const CALLS_PER_BOARD = 6
    const metaResults = await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])

    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * CALLS_PER_BOARD + 5]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr ? [
        { address: addr, abi: MarkeeABI, functionName: 'message' as const },
        { address: addr, abi: MarkeeABI, functionName: 'name' as const },
      ] : []
    )
    // The placement each board was created for: on-chain platform tag first, off-chain record for the
    // boards created before the factory carried tags.
    const platformCalls = addresses.map(addr => ({
      address: factory, abi: StreamingLeaderboardFactoryABI, functionName: 'boardPlatform' as const, args: [addr],
    }))

    const [markeeResults, platformResults, metas, totalsByBoard] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      chunkedMulticall(platformCalls as Parameters<typeof client.multicall>[0]['contracts']),
      Promise.all(addresses.map(a => getStreamingBoardMeta(a))),
      fetchBoardTotals(addresses, ETHX, BigInt(streamedAt)),
    ])

    let markeeCallIndex = 0
    const leaderboards = addresses.map((addr, i) => {
      const b = i * CALLS_PER_BOARD
      const name        = (metaResults[b]?.result as string) ?? addr
      const totals      = totalsByBoard.get(addr.toLowerCase())
      const streamed    = totals?.raised ?? 0n
      const raisedRate  = totals?.raisedRate ?? 0n
      // Lump sums a migrated board carries over: totalLeaderboardFunds sums each Markee's
      // totalFundsAdded, which the streaming board only ever reads, so it never overlaps the streamed
      // inflow. Without it a board migrated in place reads as having raised nothing.
      const legacy      = (metaResults[b + 1]?.result as bigint) ?? 0n
      const raised      = streamed + legacy

      const markeeCount = (metaResults[b + 2]?.result as bigint) ?? 0n
      const beneficiary = (metaResults[b + 3]?.result as string) ?? ''
      const admin       = (metaResults[b + 4]?.result as string) ?? ''
      const topResult   = metaResults[b + 5]?.result as [string[], bigint[]] | undefined
      const topRate     = topResult?.[1]?.[0] ?? 0n

      let topMessage: string | null = null
      let topMessageOwner: string | null = null
      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        markeeCallIndex += 2
      }

      const taggedPlatform = (platformResults[i]?.result as [string, string] | undefined)?.[0]
      const vertical: Vertical = verticalFromPlatform(taggedPlatform) ?? metas[i]?.vertical ?? 'openinternet'

      return {
        address: addr,
        name,
        platform: VERTICAL_PLATFORM[vertical],
        strategy: 'streaming' as const,
        // Streamed inflow minus GDA refunds (non-#1 backers get refunded, so gross would overstate it),
        // plus any lump sums the board carried over from a migration.
        totalFunds: formatEther(raised),
        totalFundsRaw: raised.toString(),
        // Measured at `streamedAt`; the client ticks forward at this rate.
        streamedRateRaw: raisedRate.toString(),
        streamedAt,
        markeeCount: Number(markeeCount),
        beneficiary,
        admin,
        // effectiveRateRaw = current top wei/sec (the $/mo "price to change"); topFundsAddedRaw reuses it
        // as the activity signal (topFundsAddedRaw > 0 && topMessage) the listings filter on.
        effectiveRateRaw: topRate.toString(),
        topRateRaw: topRate.toString(),
        topFundsAddedRaw: topRate.toString(),
        topMessage,
        topMessageOwner,
        topMarkeeAddress: topMarkeeAddresses[i] ?? null,
      }
    })

    const payload = { leaderboards }
    await Promise.all([
      kv.set(CACHE_KEY, payload, { ex: CACHE_TTL }),
      kv.set(LAST_GOOD_KEY, payload, { ex: LAST_GOOD_TTL }),
    ])
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/leaderboards] error:', err)
    const lastGood = await kv.get<{ leaderboards: unknown[] }>(LAST_GOOD_KEY).catch(() => null)
    if (lastGood) return NextResponse.json({ ...lastGood, stale: true }, { headers: NO_CACHE })
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }
}
