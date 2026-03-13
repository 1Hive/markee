// app/api/github/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { getLinkedFiles, type LinkedFile } from '@/lib/github/linkedFiles'

const GITHUB_FACTORY_ADDRESS = '0x9df259De9dF51143e27d062f3B84Ed8D9AaCc3aA' as const

const client = createPublicClient({ chain: base, transport: http(process.env.RPC_URL_BASE ?? undefined) })

// ── ABIs ──────────────────────────────────────────────────────────────────────

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
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLeaderboardFunds', outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
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
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// ── GET /api/github/leaderboards ─────────────────────────────────────────────

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

    // Fetch all leaderboard addresses
    const addresses = await client.readContract({
      address: GITHUB_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'getLeaderboards',
      args: [0n, count],
    })

    if (!addresses || addresses.length === 0) {
      return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0' })
    }

    // Multicall — read on-chain metadata for each leaderboard
    const metaCalls = addresses.flatMap(addr => [
      { address: addr as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
      { address: addr as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
      { address: addr as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
      { address: addr as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
      { address: addr as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])

    const metaResults = await client.multicall({ contracts: metaCalls })

    // For each leaderboard, get the top markee address so we can read its message
    const topMarkeeAddresses: (string | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 6 + 5]?.result as [string[], bigint[]] | undefined
      return topResult?.[0]?.[0] ?? null
    })

    // Multicall — read top markee messages
    const markeeCalls = topMarkeeAddresses
      .filter((a): a is string => !!a)
      .flatMap(addr => [
        { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
        { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' as const },
        { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'totalFundsAdded' as const },
      ])

    const markeeResults = markeeCalls.length > 0
      ? await client.multicall({ contracts: markeeCalls })
      : []

    // Build a map: markeeAddress → { message, name, totalFundsAdded }
    const markeeMap = new Map<string, { message: string; name: string; totalFundsAdded: bigint }>()
    let markeeIdx = 0
    for (const addr of topMarkeeAddresses) {
      if (addr) {
        markeeMap.set(addr.toLowerCase(), {
          message: (markeeResults[markeeIdx]?.result as string) ?? '',
          name: (markeeResults[markeeIdx + 1]?.result as string) ?? '',
          totalFundsAdded: (markeeResults[markeeIdx + 2]?.result as bigint) ?? 0n,
        })
        markeeIdx += 3
      }
    }

    // Read KV linked files for all leaderboards in parallel
    const linkedFilesMap = await Promise.all(
      addresses.map(addr => getLinkedFiles(addr))
    )

    // Assemble leaderboard objects
    let totalPlatformFundsWei = 0n
    const leaderboards = addresses.map((addr, i) => {
      const base = i * 6
      const name = (metaResults[base]?.result as string) ?? ''
      const totalFundsWei = (metaResults[base + 1]?.result as bigint) ?? 0n
      const markeeCount = Number((metaResults[base + 2]?.result as bigint) ?? 0n)
      const admin = (metaResults[base + 3]?.result as string) ?? ''
      const minimumPrice = (metaResults[base + 4]?.result as bigint) ?? 0n
      const topResult = metaResults[base + 5]?.result as [string[], bigint[]] | undefined
      const topMarkeeAddr = topResult?.[0]?.[0]
      const topFundsRaw = topResult?.[1]?.[0] ?? 0n
      const topMarkee = topMarkeeAddr ? markeeMap.get(topMarkeeAddr.toLowerCase()) : undefined

      totalPlatformFundsWei += totalFundsWei

      const linkedFiles = linkedFilesMap[i]
      // Derive legacy compat fields from first verified file, or first file
      const primaryFile = linkedFiles.find(f => f.verified) ?? linkedFiles[0] ?? null

      return {
        address: addr,
        name,
        totalFunds: formatEther(totalFundsWei),
        totalFundsRaw: totalFundsWei.toString(),
        markeeCount,
        admin,
        minimumPrice: formatEther(minimumPrice),
        minimumPriceRaw: minimumPrice.toString(),
        topFundsAddedRaw: topFundsRaw.toString(),
        topMessage: topMarkee?.message || null,
        topMessageOwner: topMarkee?.name || null,
        // Multi-file array (new)
        linkedFiles,
        // Legacy single-file compat fields (derived from primary file)
        repoVerified: !!primaryFile?.verified,
        repoFullName: primaryFile?.repoFullName ?? null,
        repoOwner: primaryFile?.repoOwner ?? null,
        repoName: primaryFile?.repoName ?? null,
        repoAvatarUrl: primaryFile?.repoAvatarUrl ?? null,
        repoHtmlUrl: primaryFile?.repoHtmlUrl ?? null,
        filePath: primaryFile?.filePath ?? null,
      }
    })

    // Sort by totalFunds descending
    leaderboards.sort((a, b) => (a.totalFundsRaw > b.totalFundsRaw ? -1 : 1))

    return NextResponse.json({
      leaderboards,
      totalPlatformFunds: formatEther(totalPlatformFundsWei),
    })
  } catch (err) {
    console.error('[leaderboards] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
