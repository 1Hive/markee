// app/api/superfluid/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:superfluid:leaderboards'
const CACHE_TTL = 60 // seconds

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPERFLUID_FACTORY_ADDRESS = '0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d' as const
const LEGACY_TOPDAWG_ADDRESS = '0x7a6ce4d457ac1a31513bdeff924ff942150d293e'

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE ||
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_STUDIO

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
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Client ───────────────────────────────────────────────────────────────────

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } }, // prevent Next.js caching RPC responses
    ),
  })
}

// ─── Featured message (legacy TopDawg via subgraph) ───────────────────────────

async function fetchFeaturedMessage() {
  if (!SUBGRAPH_URL) return null

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const graphToken = process.env.GRAPH_TOKEN || process.env.NEXT_PUBLIC_GRAPH_TOKEN
  if (graphToken) headers['Authorization'] = `Bearer ${graphToken}`

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `{
          topDawgPartnerStrategy(id: "${LEGACY_TOPDAWG_ADDRESS}") {
            totalFundsRaised
            totalMarkeesCreated
          }
          markees(
            where: { pricingStrategy: "${LEGACY_TOPDAWG_ADDRESS}" }
            orderBy: totalFundsAdded
            orderDirection: desc
            first: 1
          ) {
            message
            totalFundsAdded
            owner { id }
          }
        }`,
      }),
    })
    const json = await res.json()
    const m = json.data?.markees?.[0]
    const strategy = json.data?.topDawgPartnerStrategy
    if (!m?.message) return null
    return {
      message: m.message as string,
      owner: (m.owner?.id ?? '') as string,
      totalFundsAdded: (m.totalFundsAdded ?? '0') as string,
      totalFunds: (strategy?.totalFundsRaised ?? '0') as string,
      markeeCount: Number(strategy?.totalMarkeesCreated ?? 0),
    }
  } catch (e: any) {
    console.error('[superfluid/leaderboards] featured message error:', e.message)
    return null
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const bust = new URL(request.url).searchParams.get('bust') === '1'
    if (!bust) {
      const cached = await kv.get<object>(CACHE_KEY)
      if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
    }

    const client = getClient()

    // Run leaderboard RPC calls and featured message subgraph fetch in parallel
    const [addresses, featuredMessage] = await Promise.all([
      client.readContract({
        address: SUPERFLUID_FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getLeaderboards',
        args: [0n, 1000n],
      }) as Promise<`0x${string}`[]>,
      fetchFeaturedMessage(),
    ])

    if (!addresses || addresses.length === 0) {
      return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0', featuredMessage }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      })
    }

    // Chunk multicalls into batches of 50 to avoid Alchemy limits
    const CHUNK_SIZE = 50
    async function chunkedMulticall(contracts: Parameters<typeof client.multicall>[0]['contracts']) {
      const results = []
      for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
        const chunk = contracts.slice(i, i + CHUNK_SIZE) as Parameters<typeof client.multicall>[0]['contracts']
        const chunkResults = await client.multicall({ contracts: chunk })
        results.push(...chunkResults)
      }
      return results
    }

    // 2. Multicall — fetch metadata for each leaderboard
    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])

    const metaResults = await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])

    // 3. Extract top markee addresses, then fetch their messages
    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 6 + 5]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr
        ? [
            { address: addr, abi: MARKEE_ABI, functionName: 'message' as const },
            { address: addr, abi: MARKEE_ABI, functionName: 'name' as const },
          ]
        : []
    )

    const markeeResults = markeeCalls.length > 0
      ? await chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
      : []

    // 4. Assemble response
    let totalFundsRaw = 0n
    let markeeCallIndex = 0

    const leaderboards = addresses.map((addr, i) => {
      const b = i * 6
      const name         = (metaResults[b]?.result as string) ?? addr
      const totalFunds   = (metaResults[b + 1]?.result as bigint) ?? 0n
      const markeeCount  = (metaResults[b + 2]?.result as bigint) ?? 0n
      const minimumPrice = (metaResults[b + 3]?.result as bigint) ?? 0n
      const admin        = (metaResults[b + 4]?.result as string) ?? ''
      const topResult    = metaResults[b + 5]?.result as [string[], bigint[]] | undefined
      const topFunds0    = topResult?.[1]?.[0] ?? 0n

      totalFundsRaw += totalFunds

      let topMessage: string | null = null
      let topMessageOwner: string | null = null

      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        markeeCallIndex += 2
      }

      return {
        address: addr,
        name,
        totalFunds: formatEther(totalFunds),
        totalFundsRaw: totalFunds.toString(),
        markeeCount: Number(markeeCount),
        admin,
        minimumPrice: formatEther(minimumPrice),
        minimumPriceRaw: minimumPrice.toString(),
        topFundsAddedRaw: topFunds0.toString(),
        topMessage,
        topMessageOwner,
      }
    })

    leaderboards.sort((a, b) => {
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    const payload = { leaderboards, totalPlatformFunds: formatEther(totalFundsRaw), featuredMessage }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('[superfluid/leaderboards] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch leaderboards' }, { status: 500 })
  }
}
