// app/api/superfluid/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'

export const dynamic = 'force-dynamic'

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPERFLUID_FACTORY_ADDRESS = '0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d' as const

// Adjust this event ABI to match the actual LeaderboardFactory.sol event signature.
// Common pattern — verify against your deployed contract.
const FACTORY_EVENTS_ABI = [
  {
    type: 'event',
    name: 'LeaderboardCreated',
    inputs: [
      { name: 'leaderboard', type: 'address', indexed: true },
      { name: 'seedMarkee', type: 'address', indexed: true },
      { name: 'admin', type: 'address', indexed: false },
      { name: 'name', type: 'string', indexed: false },
    ],
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
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org'),
  })
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const client = getClient()

    // 1. Fetch all LeaderboardCreated events from the Superfluid factory
    const logs = await client.getLogs({
      address: SUPERFLUID_FACTORY_ADDRESS,
      event: FACTORY_EVENTS_ABI[0],
      fromBlock: 0n,
      toBlock: 'latest',
    })

    if (logs.length === 0) {
      return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0' })
    }

    // Extract leaderboard addresses from indexed topic[1]
    const addresses = logs.map(log => {
      // args.leaderboard from the parsed log
      return (log.args as { leaderboard?: string }).leaderboard as `0x${string}`
    }).filter(Boolean)

    if (addresses.length === 0) {
      return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0' })
    }

    // 2. Multicall to fetch metadata for each leaderboard
    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])

    const metaResults = await client.multicall({ contracts: metaCalls as Parameters<typeof client.multicall>[0]['contracts'] })

    // 3. For each leaderboard, pull the top markee address then fetch its message
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
      ? await client.multicall({ contracts: markeeCalls as Parameters<typeof client.multicall>[0]['contracts'] })
      : []

    // 4. Assemble response
    let totalFundsRaw = 0n
    let markeeCallIndex = 0

    const leaderboards = addresses.map((addr, i) => {
      const base = i * 6
      const name           = (metaResults[base]?.result as string) ?? addr
      const totalFunds     = (metaResults[base + 1]?.result as bigint) ?? 0n
      const markeeCount    = (metaResults[base + 2]?.result as bigint) ?? 0n
      const minimumPrice   = (metaResults[base + 3]?.result as bigint) ?? 0n
      const admin          = (metaResults[base + 4]?.result as string) ?? ''
      const topResult      = metaResults[base + 5]?.result as [string[], bigint[]] | undefined
      const topFunds0      = topResult?.[1]?.[0] ?? 0n

      totalFundsRaw += totalFunds

      let topMessage: string | null = null
      let topMessageOwner: string | null = null

      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) ?? null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) ?? null
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
        topMessage: topMessage || null,
        topMessageOwner: topMessageOwner || null,
      }
    })

    // Sort by total funds descending
    leaderboards.sort((a, b) => {
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    return NextResponse.json({
      leaderboards,
      totalPlatformFunds: formatEther(totalFundsRaw),
    })
  } catch (err) {
    console.error('[superfluid/leaderboards] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch leaderboards' }, { status: 500 })
  }
}
