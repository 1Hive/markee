// app/api/streaming/leaderboards/route.ts
//
// Enumerates streaming-priced boards (one vertical-agnostic StreamingLeaderboardFactory) and returns
// them normalized to the same row shape as the fixed-price vertical APIs, tagged strategy: 'streaming'.
// totalFundsRaw is what the board raised (subgraph inflow net of GDA refunds, plus lump sums carried
// over by a migrated board); effectiveRateRaw is the current top wei/sec for the $/mo label.
// Inert (returns []) until NEXT_PUBLIC_STREAMING_FACTORY is configured.

import { NextResponse } from 'next/server'
import { formatEther } from 'viem'
import { kv } from '@vercel/kv'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { createStreamingClient } from '@/lib/streaming/client'
import { getStreamingBoardMeta } from '@/lib/streaming/boardMeta'
import { fetchBoardTotals } from '@/lib/streaming/subgraph'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import { VERTICAL_PLATFORM, verticalFromPlatform, type Vertical } from '@/lib/strategy'
import { StreamingLeaderboardFactoryABI, StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { getLinkedFilesBatch, type LinkedFile } from '@/lib/github/linkedFiles'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:streaming:leaderboards'
const CACHE_TTL = 60 // seconds
// Served when the totals source fails: stale beats wrong for the headline number.
const LAST_GOOD_KEY = 'cache:streaming:leaderboards:lastgood'
const LAST_GOOD_TTL = 7 * 24 * 60 * 60
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: Request) {
  if (!STREAMING_ENABLED) {
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }

  const params = new URL(request.url).searchParams
  // ?address= narrows the response to one board so a board page does not download the whole
  // listing; the full payload is still what gets computed and cached.
  const only = params.get('address')?.toLowerCase() ?? null
  const respond = (payload: { leaderboards: unknown[] } & Record<string, unknown>) =>
    NextResponse.json(
      only
        ? { ...payload, leaderboards: payload.leaderboards.filter(l =>
            (l as { address?: string }).address?.toLowerCase() === only) }
        : payload,
      { headers: NO_CACHE },
    )

  try {
    const bust = params.get('bust') === '1'
    if (!bust) {
      const cached = await kv.get<{ leaderboards: unknown[] }>(CACHE_KEY)
      if (cached) return respond(cached)
    }

    const client = createStreamingClient()
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
      return respond(empty)
    }

    const streamedAt = Number((await client.getBlock()).timestamp)
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
    const MARKEE_CALLS_PER_BOARD = 2
    // Each board's offset into markeeResults, derived from which boards contributed calls, so the
    // mapping below cannot drift if the call shape changes.
    const markeeResultBase: number[] = []
    {
      let next = 0
      for (const addr of topMarkeeAddresses) {
        markeeResultBase.push(next)
        if (addr) next += MARKEE_CALLS_PER_BOARD
      }
    }
    // The placement each board was created for: on-chain platform tag first, off-chain record for the
    // boards created before the factory carried tags.
    const platformCalls = addresses.map(addr => ({
      address: factory, abi: StreamingLeaderboardFactoryABI, functionName: 'boardPlatform' as const, args: [addr],
    }))

    // Same KV record the fixed open-internet listing reads: logo, site and verified URLs are stored
    // per board address regardless of pricing strategy, so streaming boards render with them too.
    const oiMetaKeys = addresses.map(a => `oi:meta:${a.toLowerCase()}`)
    const [markeeResults, platformResults, metas, totalsByBoard, oiMetas, linkedFilesPerAddr] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      chunkedMulticall(platformCalls as Parameters<typeof client.multicall>[0]['contracts']),
      Promise.all(addresses.map(a => getStreamingBoardMeta(a))),
      fetchBoardTotals(addresses, ETHX, BigInt(streamedAt)),
      kv.mget<({ logoUrl?: string; siteUrl?: string; verifiedUrl?: string; verifiedUrls?: string[]; status?: string } | null)[]>(...oiMetaKeys),
      // "Served On" falls back to a verified GitHub link when there's no verifiedUrl -- same
      // address-keyed github:markee:{address} KV namespace every other listing route reads.
      getLinkedFilesBatch(addresses),
    ])

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
        const m = markeeResultBase[i]
        topMessage      = (markeeResults[m]?.result as string) || null
        topMessageOwner = (markeeResults[m + 1]?.result as string) || null
      }

      const taggedPlatform = (platformResults[i]?.result as [string, string] | undefined)?.[0]
      const vertical: Vertical = verticalFromPlatform(taggedPlatform) ?? metas[i]?.vertical ?? 'openinternet'
      const oiMeta = oiMetas[i]
      const linkedFiles: LinkedFile[] = linkedFilesPerAddr[i] ?? []

      return {
        address: addr,
        name,
        // The listings read leaderboardName for labels and letter avatars; mirror name into it.
        leaderboardName: name,
        logoUrl: oiMeta?.logoUrl ?? null,
        siteUrl: oiMeta?.siteUrl ?? null,
        verifiedUrl: oiMeta?.verifiedUrl ?? null,
        verifiedUrls: Array.isArray(oiMeta?.verifiedUrls) ? oiMeta.verifiedUrls : oiMeta?.verifiedUrl ? [oiMeta.verifiedUrl] : [],
        status: oiMeta?.status === 'verified' ? 'verified' as const : 'pending' as const,
        linkedFiles,
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
    return respond(payload)
  } catch (err) {
    console.error('[streaming/leaderboards] error:', err)
    const lastGood = await kv.get<{ leaderboards: unknown[] }>(LAST_GOOD_KEY).catch(() => null)
    if (lastGood) return respond({ ...lastGood, stale: true })
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }
}
