// GET /api/account/messages?owner=0x...
// Returns all v1.1+ markees owned by a given wallet across all leaderboards.
// Legacy TopDawg markees are handled by the client via the subgraph.
import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const owner = searchParams.get('owner')?.toLowerCase()
  if (!owner || !/^0x[0-9a-f]{40}$/.test(owner)) {
    return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
  }

  // Fetch all platform leaderboards (uses their cached responses where available)
  const [sfData, ghData, oiData] = await Promise.all([
    fetch(`${origin}/api/superfluid/leaderboards`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/github/leaderboards`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/openinternet/leaderboards`).then(r => r.ok ? r.json() : null).catch(() => null),
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

  if (leaderboards.length === 0) {
    return NextResponse.json({ messages: [] })
  }

  const client = getClient()

  // Get all markee addresses from every leaderboard (getMarkees reverts on legacy contracts — that's fine)
  const markeeListCalls = leaderboards.map(lb => ({
    address: lb.address as `0x${string}`,
    abi: LEADERBOARD_ABI,
    functionName: 'getMarkees' as const,
    args: [0n, 1000n] as const,
  }))
  const markeeListResults = await chunkedMulticall(client, markeeListCalls)

  // Flat list of { lbIndex, markeeAddress } for all markees across all leaderboards
  const entries: { lbIndex: number; markeeAddress: `0x${string}` }[] = []
  for (let i = 0; i < leaderboards.length; i++) {
    const addrs = (markeeListResults[i]?.result as string[]) ?? []
    for (const addr of addrs) {
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        entries.push({ lbIndex: i, markeeAddress: addr as `0x${string}` })
      }
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ messages: [] })
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

  if (owned.length === 0) {
    return NextResponse.json({ messages: [] })
  }

  // Fetch details for owned markees
  const detailResults = await chunkedMulticall(
    client,
    owned.flatMap(e => [
      { address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'totalFundsAdded' as const },
      { address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'message' as const },
      { address: e.markeeAddress, abi: MARKEE_ABI, functionName: 'name' as const },
    ]),
  )

  const messages = owned.map((e, i) => {
    const b = i * 3
    const lb = leaderboards[e.lbIndex]
    const totalFundsAdded = (detailResults[b]?.result as bigint) ?? 0n
    const message = (detailResults[b + 1]?.result as string) ?? ''
    const name = (detailResults[b + 2]?.result as string) ?? ''
    const isTop = lb.topMarkeeAddress?.toLowerCase() === e.markeeAddress.toLowerCase()
    return {
      address: e.markeeAddress,
      message,
      name,
      totalFundsAdded: totalFundsAdded.toString(),
      strategyId: lb.address,
      strategyName: lb.name,
      isTop,
      topFundsRaw: lb.topFundsAddedRaw ?? '0',
    }
  })

  return NextResponse.json({ messages })
}
