// app/api/streaming/leaderboards/route.ts
//
// Enumerates streaming-priced boards (one vertical-agnostic StreamingLeaderboardFactory) and returns
// them normalized to the same row shape as the fixed-price vertical APIs, tagged strategy: 'streaming'.
// Ranking value is cumulative ETHx streamed into the board (getLogs integration of FlowUpdated),
// exposed as totalFundsRaw; effectiveRateRaw carries the current top wei/sec for the $/mo label.
// Inert (returns []) until NEXT_PUBLIC_STREAMING_FACTORY is configured.

import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { getStreamingBoardMeta } from '@/lib/streaming/boardMeta'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import type { Vertical } from '@/lib/strategy'
import { LeaderboardFactoryABI, StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'

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

function getClient() {
  // The streaming factory lives on whatever chain NEXT_PUBLIC_STREAMING_FACTORY was deployed to,
  // which is the chain NEXT_PUBLIC_BASE_RPC_URL points at (the same RPC every client-side streaming
  // hook reads). Prefer it so this server-side read sees the same factory; fall back to Alchemy/default.
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

// Superfluid CFA FlowUpdated — emitted on every open/update/close of a constant flow. Filtering by
// token (ETHx) + receiver (the board) captures every change to the board's total inflow rate.
const FLOW_UPDATED = parseAbiItem(
  'event FlowUpdated(address indexed token, address indexed sender, address indexed receiver, int96 flowRate, int256 totalSenderFlowRate, int256 totalReceiverFlowRate, bytes userData)',
)
const LOG_LOOKBACK_BLOCKS = 50_000n // ~1.15 days of Base blocks (streaming boards on the fork are fresh)
const LOG_CHUNK = 9_000n            // stay under provider getLogs range caps

// Cumulative ETHx streamed INTO a board = ∫ (board's total inflow rate) dt, reconstructed from the
// FlowUpdated history — the streaming analog of a fixed board's lump-sum "total raised". getLogs-based
// for now; swap to the Superfluid subgraph (streamedUntilUpdatedAt) later. Gross figure (Option-B losers
// stream in and are refunded net-zero, so it slightly overcounts; the subgraph will net it out).
//
// Returns the cumulative up to `nowTs` plus the current inflow rate (the last FlowUpdated segment's
// totalReceiverFlowRate) so a client can extrapolate the ticker forward: streamed + inflowRate·(now - nowTs).
async function totalStreamedInto(
  client: ReturnType<typeof getClient>,
  board: `0x${string}`,
  ethx: `0x${string}`,
  fromBlock: bigint,
  latestBlock: bigint,
  nowTs: bigint,
): Promise<{ streamed: bigint; inflowRate: bigint }> {
  const logs: any[] = []
  for (let start = fromBlock; start <= latestBlock; start += LOG_CHUNK + 1n) {
    const end = start + LOG_CHUNK < latestBlock ? start + LOG_CHUNK : latestBlock
    try {
      logs.push(...await client.getLogs({ event: FLOW_UPDATED, args: { token: ethx, receiver: board }, fromBlock: start, toBlock: end }))
    } catch {
      // provider range/limit hiccup on a chunk — best-effort until the subgraph lands
    }
  }
  if (logs.length === 0) return { streamed: 0n, inflowRate: 0n }
  logs.sort((a, b) => a.blockNumber === b.blockNumber ? (a.logIndex ?? 0) - (b.logIndex ?? 0) : (a.blockNumber < b.blockNumber ? -1 : 1))
  // Integrate over real block timestamps (a fork time-warp makes block number and wall-clock diverge).
  const blockNums = Array.from(new Set<bigint>(logs.map(l => l.blockNumber as bigint)))
  const blocks = await Promise.all(blockNums.map(bn => client.getBlock({ blockNumber: bn })))
  const tsOf = new Map<bigint, bigint>()
  blockNums.forEach((bn, i) => tsOf.set(bn, blocks[i].timestamp))
  let streamed = 0n
  for (let i = 0; i < logs.length; i++) {
    const rate = (logs[i].args.totalReceiverFlowRate ?? 0n) as bigint
    const startTs = tsOf.get(logs[i].blockNumber as bigint) ?? nowTs
    const endTs = i + 1 < logs.length ? (tsOf.get(logs[i + 1].blockNumber as bigint) ?? nowTs) : nowTs
    const dt = endTs - startTs
    if (rate > 0n && dt > 0n) streamed += rate * dt
  }
  const lastRate = (logs[logs.length - 1].args.totalReceiverFlowRate ?? 0n) as bigint
  return { streamed, inflowRate: lastRate > 0n ? lastRate : 0n }
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
      abi: LeaderboardFactoryABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }) as `0x${string}`[]

    if (addresses.length === 0) {
      const empty = { leaderboards: [] }
      await kv.set(CACHE_KEY, empty, { ex: CACHE_TTL })
      return NextResponse.json(empty, { headers: NO_CACHE })
    }

    const latestBlock = await client.getBlockNumber()
    // Snapshot timestamp the cumulative is integrated up to; the client extrapolates the live ticker
    // forward from here at each board's inflow rate.
    const streamedAt = Number((await client.getBlock({ blockNumber: latestBlock })).timestamp)
    const fromBlock = process.env.STREAMING_FROM_BLOCK
      ? BigInt(process.env.STREAMING_FROM_BLOCK)
      : (latestBlock > LOG_LOOKBACK_BLOCKS ? latestBlock - LOG_LOOKBACK_BLOCKS : 0n)
    const ETHX = STREAMING_BASE.ethx as `0x${string}`

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
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'markeeCount' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'beneficiaryAddress' as const },
      { address: addr, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])
    const metaResults = await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])

    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 5 + 4]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr ? [
        { address: addr, abi: MarkeeABI, functionName: 'message' as const },
        { address: addr, abi: MarkeeABI, functionName: 'name' as const },
      ] : []
    )
    const [markeeResults, metas, streamedByBoard] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      Promise.all(addresses.map(a => getStreamingBoardMeta(a))),
      Promise.all(addresses.map(a => totalStreamedInto(client, a, ETHX, fromBlock, latestBlock, BigInt(streamedAt)))),
    ])

    let markeeCallIndex = 0
    const leaderboards = addresses.map((addr, i) => {
      const b = i * 5
      const name        = (metaResults[b]?.result as string) ?? addr
      const streamed    = streamedByBoard[i]?.streamed ?? 0n
      const inflowRate  = streamedByBoard[i]?.inflowRate ?? 0n
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
        // totalFundsRaw = cumulative ETHx streamed into the board (getLogs) — the streaming analog of a
        // fixed board's lump-sum "total raised", so both rank on one cumulative-$ axis.
        totalFunds: formatEther(streamed),
        totalFundsRaw: streamed.toString(),
        // Live-ticker inputs: the cumulative above is measured at `streamedAt`; extrapolate forward at
        // `streamedRateRaw` (board's current total inflow, wei/sec) so the total ticks up between refetches.
        streamedRateRaw: inflowRate.toString(),
        streamedAt,
        markeeCount: Number(markeeCount),
        beneficiary,
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
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/leaderboards] error:', err)
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }
}
