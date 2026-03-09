// frontend/app/api/github/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

// GitHub platform factory — deployed on Base
const GITHUB_FACTORY_ADDRESS = '0x9df259De9dF51143e27d062f3B84Ed8D9AaCc3aA' as const

const client = createPublicClient({ chain: base, transport: http() })

const FACTORY_ABI = [
  {
    inputs: [],
    name: 'leaderboardCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
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
  {
    inputs: [],
    name: 'leaderboardName',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalLeaderboardFunds',
    outputs: [{ name: 'total', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'markeeCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'admin',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minimumPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [
      { name: 'topAddresses', type: 'address[]' },
      { name: 'topFunds', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  {
    inputs: [],
    name: 'message',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export async function GET() {
  try {
    const count = await client.readContract({
      address: GITHUB_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'leaderboardCount',
    })

    if (count === 0n) {
      return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0' })
    }

    const addresses = await client.readContract({
      address: GITHUB_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'getLeaderboards',
      args: [0n, count],
    })

    // Batch read all leaderboard metadata in one multicall
    const metaResults = await client.multicall({
      contracts: addresses.flatMap(addr => [
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
      ]),
    })

    // Parse metadata (6 results per leaderboard)
    const leaderboardMeta = addresses.map((addr, i) => {
      const b = i * 6
      return {
        address: addr,
        name: metaResults[b].status === 'success' ? (metaResults[b].result as string) : '',
        totalFundsRaw: metaResults[b + 1].status === 'success' ? (metaResults[b + 1].result as bigint) : 0n,
        markeeCount: metaResults[b + 2].status === 'success' ? Number(metaResults[b + 2].result as bigint) : 0,
        admin: metaResults[b + 3].status === 'success' ? (metaResults[b + 3].result as string) : '',
        minimumPrice: metaResults[b + 4].status === 'success' ? (metaResults[b + 4].result as bigint) : 0n,
        topMarkeeAddress:
          metaResults[b + 5].status === 'success'
            ? ((metaResults[b + 5].result as [string[], bigint[]])[0][0] ?? null)
            : null,
        topFundsRaw:
          metaResults[b + 5].status === 'success'
            ? ((metaResults[b + 5].result as [string[], bigint[]])[1][0] ?? 0n)
            : 0n,
      }
    })

    // Fetch top message for each leaderboard that has one
    const topMarkeeAddresses = leaderboardMeta
      .map(l => l.topMarkeeAddress)
      .filter(Boolean) as string[]

    const messageResults =
      topMarkeeAddresses.length > 0
        ? await client.multicall({
            contracts: topMarkeeAddresses.flatMap(addr => [
              { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
              { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' as const },
            ]),
          })
        : []

    // Build address → message map
    const messageMap: Record<string, { message: string; name: string }> = {}
    topMarkeeAddresses.forEach((addr, i) => {
      const b = i * 2
      messageMap[addr] = {
        message: messageResults[b]?.status === 'success' ? (messageResults[b].result as string) : '',
        name: messageResults[b + 1]?.status === 'success' ? (messageResults[b + 1].result as string) : '',
      }
    })

    // Assemble final leaderboards
    const leaderboardAddresses = leaderboardMeta.map(l => l.address.toLowerCase())

    // Batch-fetch verified repo metadata from KV for all leaderboards
    const kvKeys = leaderboardAddresses.map(a => `github:markee:${a}`)
    const kvResults = kvKeys.length > 0
      ? await kv.mget<string[]>(...kvKeys)
      : []

    const repoMetaMap: Record<string, {
      repoFullName: string
      repoOwner: string
      repoName: string
      repoAvatarUrl: string
      repoHtmlUrl: string
      filePath: string
    } | null> = {}

    leaderboardAddresses.forEach((addr, i) => {
      const raw = kvResults[i]
      if (raw) {
        try {
          repoMetaMap[addr] = typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch {
          repoMetaMap[addr] = null
        }
      } else {
        repoMetaMap[addr] = null
      }
    })

    const leaderboards = leaderboardMeta.map(l => {
      const repoMeta = repoMetaMap[l.address.toLowerCase()] ?? null
      return {
        address: l.address,
        name: l.name,
        totalFunds: formatEther(l.totalFundsRaw),
        totalFundsRaw: l.totalFundsRaw.toString(),
        markeeCount: l.markeeCount,
        admin: l.admin,
        minimumPrice: formatEther(l.minimumPrice),
        minimumPriceRaw: l.minimumPrice.toString(),
        topMessage: l.topMarkeeAddress ? (messageMap[l.topMarkeeAddress]?.message ?? null) : null,
        topMessageOwner: l.topMarkeeAddress ? (messageMap[l.topMarkeeAddress]?.name ?? null) : null,
        topFundsAddedRaw: l.topFundsRaw.toString(),
        // Verified repo metadata — null if not yet linked via OAuth
        repoFullName: repoMeta?.repoFullName ?? null,
        repoOwner: repoMeta?.repoOwner ?? null,
        repoName: repoMeta?.repoName ?? null,
        repoAvatarUrl: repoMeta?.repoAvatarUrl ?? null,
        repoHtmlUrl: repoMeta?.repoHtmlUrl ?? null,
        filePath: repoMeta?.filePath ?? null,
        repoVerified: repoMeta !== null,
      }
    })

    // Sort by totalFunds descending
    leaderboards.sort((a, b) => {
      const aF = BigInt(a.totalFundsRaw)
      const bF = BigInt(b.totalFundsRaw)
      return bF > aF ? 1 : bF < aF ? -1 : 0
    })

    const totalPlatformFunds = formatEther(
      leaderboardMeta.reduce((sum, l) => sum + l.totalFundsRaw, 0n)
    )

    return NextResponse.json({ leaderboards, totalPlatformFunds })
  } catch (error) {
    console.error('[GitHub Leaderboards]', error)
    return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0', error: String(error) }, { status: 500 })
  }
}
