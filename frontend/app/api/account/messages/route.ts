// GET /api/account/messages?owner=0x...
// Returns all v1.1+ markees owned by a given wallet across all leaderboards.
// Legacy TopDawg markees are handled by the client via the subgraph.
import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import { fetchBackerPositions } from '@/lib/streaming/subgraph'

export const dynamic = 'force-dynamic'

const LEADERBOARD_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'offset', type: 'uint256' },
      { internalType: 'uint256', name: 'limit', type: 'uint256' },
    ],
    name: 'getMarkees',
    outputs: [{ name: 'result', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

const ZERO = '0x0000000000000000000000000000000000000000'

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', {
      fetchOptions: { cache: 'no-store' },
    }),
  })
}

async function chunkedMulticall(
  client: ReturnType<typeof getClient>,
  contracts: Parameters<typeof client.multicall>[0]['contracts'],
) {
  const CHUNK = 50
  const results = []
  for (let i = 0; i < contracts.length; i += CHUNK) {
    const slice = contracts.slice(i, i + CHUNK) as Parameters<typeof client.multicall>[0]['contracts']
    results.push(...await client.multicall({ contracts: slice }))
  }
  return results
}

async function fetchStreamingOwned(
  client: ReturnType<typeof getClient>,
  owner: string,
  origin: string,
  headers: HeadersInit,
) {
  const data = await fetch(`${origin}/api/streaming/leaderboards`, { headers })
    .then(r => r.ok ? r.json() : null).catch(() => null)

  const boards: Array<{ address: string; name: string; topMarkeeAddress: string | null; topFundsAddedRaw: string }> =
    (data?.leaderboards ?? []).filter((lb: any) => lb.markeeCount > 0)
  if (boards.length === 0) return []

  // Find this owner's markee on each streaming board
  const backerResults = await chunkedMulticall(
    client,
    boards.map(lb => ({
      address: lb.address as `0x${string}`,
      abi: StreamingLeaderboardABI,
      functionName: 'backerMarkee' as const,
      args: [owner as `0x${string}`] as const,
    })),
  )

  const candidates = boards
    .map((lb, i) => ({ lb, markee: (backerResults[i]?.result as string | undefined)?.toLowerCase() }))
    .filter((b): b is { lb: typeof boards[0]; markee: string } =>
      !!b.markee && b.markee !== ZERO)

  if (candidates.length === 0) return []

  const [detailResults, positions] = await Promise.all([
    chunkedMulticall(
      client,
      candidates.flatMap(b => [
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'owner' as const },
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'totalFundsAdded' as const },
        { address: b.markee as `0x${string}`, abi: MarkeeABI, functionName: 'message' as const },
      ]),
    ),
    fetchBackerPositions(
      owner,
      candidates.map(b => b.lb.address),
      STREAMING_BASE.ethx,
      BigInt(Math.floor(Date.now() / 1000)),
    ).catch(() => new Map<string, { contributed: bigint; rate: bigint }>()),
  ])

  return candidates
    .map((b, i) => {
      const o = i * 3
      const markeeOwner = (detailResults[o]?.result as string | undefined)?.toLowerCase()
      if (markeeOwner !== owner) return null
      const totalFundsAdded = (detailResults[o + 1]?.result as bigint) ?? 0n
      const message = (detailResults[o + 2]?.result as string) ?? ''
      const isTop = b.lb.topMarkeeAddress?.toLowerCase() === b.markee
      const pos = positions.get(b.lb.address.toLowerCase())
      return {
        address: b.markee,
        message,
        name: '',
        totalFundsAdded: totalFundsAdded.toString(),
        strategyId: b.lb.address,
        strategyName: b.lb.name ?? 'Unknown Leaderboard',
        isTop,
        topFundsRaw: b.lb.topFundsAddedRaw ?? '0',
        strategy: 'streaming' as const,
        rank: isTop ? 1 : null,
        flowRateRaw: (pos?.rate ?? 0n).toString(),
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = internalOrigin()
  const owner = searchParams.get('owner')?.toLowerCase()
  if (!owner || !/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
  }

  // Fetch all platform leaderboards (uses their cached responses where available)
  const headers = internalHeaders()
  const [sfData, ghData, oiData] = await Promise.all([
    fetch(`${origin}/api/superfluid/leaderboards`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/github/leaderboards`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/openinternet/leaderboards`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  // Only include leaderboards that have at least one markee
  const leaderboards: Array<{
    address: string
    name: string
    topMarkeeAddress: string | null
    topFundsAddedRaw: string
  }> = [
    ...(sfData?.leaderboards ?? []),
    ...(ghData?.leaderboards ?? []),
    ...(oiData?.leaderboards ?? []),
  ].filter((lb: any) => lb.markeeCount > 0)

  const client = getClient()

  // Get all markee addresses from every leaderboard
  const markeeListResults = leaderboards.length > 0
    ? await chunkedMulticall(
        client,
        leaderboards.map(lb => ({
          address: lb.address as `0x${string}`,
          abi: LEADERBOARD_ABI,
          functionName: 'getMarkees' as const,
          args: [0n, 1000n] as const,
        })),
      )
    : []

  // Build rank maps: leaderboard index → (markeeAddr → rank 1-based)
  // getMarkees returns addresses sorted descending by totalFundsAdded
  const lbRankMaps = new Map<number, Map<string, number>>()
  const entries: { lbIndex: number; markeeAddress: `0x${string}` }[] = []
  for (let i = 0; i < leaderboards.length; i++) {
    const addrs = (markeeListResults[i]?.result as string[]) ?? []
    const ranks = new Map<string, number>()
    let rank = 1
    for (const addr of addrs) {
      if (addr && addr !== ZERO) {
        entries.push({ lbIndex: i, markeeAddress: addr as `0x${string}` })
        ranks.set(addr.toLowerCase(), rank++)
      }
    }
    lbRankMaps.set(i, ranks)
  }

  if (entries.length === 0) {
    const streamingMsgs = await fetchStreamingOwned(client, owner, origin, headers).catch(() => [])
    return NextResponse.json({ messages: streamingMsgs })
  }

  // Multicall owner() on all markees
  const ownerResults = await chunkedMulticall(
    client,
    entries.map(e => ({ address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'owner' as const })),
  )

  // Keep only markees owned by the requested wallet
  const owned = entries.filter((_, i) => {
    const o = (ownerResults[i]?.result as string | undefined)?.toLowerCase()
    return o === owner
  })

  const detailResults = owned.length > 0
    ? await chunkedMulticall(
        client,
        owned.flatMap(e => [
          { address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'totalFundsAdded' as const },
          { address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'message' as const },
          { address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'name' as const },
        ]),
      )
    : []

  const messages = owned.map((e, i) => {
    const b = i * 3
    const lb = leaderboards[e.lbIndex]
    const totalFundsAdded = (detailResults[b]?.result as bigint) ?? 0n
    const message = (detailResults[b + 1]?.result as string) ?? ''
    const name = (detailResults[b + 2]?.result as string) ?? ''
    const isTop = lb.topMarkeeAddress?.toLowerCase() === e.markeeAddress.toLowerCase()
    const rank = lbRankMaps.get(e.lbIndex)?.get(e.markeeAddress.toLowerCase()) ?? 1
    return {
      address: e.markeeAddress,
      message,
      name,
      totalFundsAdded: totalFundsAdded.toString(),
      strategyId: lb.address,
      strategyName: lb.name,
      isTop,
      topFundsRaw: lb.topFundsAddedRaw ?? '0',
      strategy: 'fixed' as const,
      rank,
      flowRateRaw: '0',
    }
  })

  const streamingMsgs = await fetchStreamingOwned(client, owner, origin, headers).catch(() => [])

  return NextResponse.json({ messages: [...messages, ...streamingMsgs] })
}
