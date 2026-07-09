// GET /api/account/funded?owner=0x...
// Returns markees the wallet has funded but does not own.
import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem } from 'viem'
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
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// Emitted by individual markee contracts when anyone adds funds
const FUNDS_ADDED_EVENT = parseAbiItem(
  'event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)'
)

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

  // Fetch all platform leaderboards
  const [sfData, ghData, oiData] = await Promise.all([
    fetch(`${origin}/api/superfluid/leaderboards`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/github/leaderboards`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${origin}/api/openinternet/leaderboards`).then(r => r.ok ? r.json() : null).catch(() => null),
  ])

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

  if (leaderboards.length === 0) return NextResponse.json({ funded: [] })

  const client = getClient()

  // Get all markee addresses from every leaderboard
  const markeeListResults = await chunkedMulticall(
    client,
    leaderboards.map(lb => ({
      address: lb.address as `0x${string}`,
      abi: LEADERBOARD_ABI,
      functionName: 'getMarkees' as const,
      args: [0n, 1000n] as const,
    })),
  )

  type Entry = { lbIndex: number; markeeAddress: `0x${string}` }
  const entries: Entry[] = []
  for (let i = 0; i < leaderboards.length; i++) {
    const addrs = (markeeListResults[i]?.result as string[]) ?? []
    for (const addr of addrs) {
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        entries.push({ lbIndex: i, markeeAddress: addr as `0x${string}` })
      }
    }
  }

  if (entries.length === 0) return NextResponse.json({ funded: [] })

  const allMarkeeAddresses = [...new Set(entries.map(e => e.markeeAddress))]

  // Query FundsAdded on all markee contracts filtered by addedBy == owner
  const fundsAddedLogs = await client.getLogs({
    address: allMarkeeAddresses,
    event: FUNDS_ADDED_EVENT,
    args: { addedBy: owner as `0x${string}` },
    fromBlock: 0n,
    toBlock: 'latest',
  }).catch(() => [])

  if (fundsAddedLogs.length === 0) return NextResponse.json({ funded: [] })

  // Aggregate total contributed by user per markee
  const markeeContribs = new Map<string, bigint>()
  for (const log of fundsAddedLogs) {
    const addr = log.address.toLowerCase()
    const amount = (log.args as { amount: bigint }).amount ?? 0n
    markeeContribs.set(addr, (markeeContribs.get(addr) ?? 0n) + amount)
  }

  const fundedAddrs = [...markeeContribs.keys()]

  // Filter out markees the user owns — those appear in "bought", not "funded"
  const ownerResults = await chunkedMulticall(
    client,
    fundedAddrs.map(addr => ({
      address: addr as `0x${string}`,
      abi: MARKEE_ABI,
      functionName: 'owner' as const,
    })),
  )

  const externalAddrs = fundedAddrs.filter((_, i) => {
    const markeeOwner = (ownerResults[i]?.result as string | undefined)?.toLowerCase()
    return markeeOwner !== owner
  })

  if (externalAddrs.length === 0) return NextResponse.json({ funded: [] })

  // Fetch message, name, totalFundsAdded for externally-funded markees
  const detailResults = await chunkedMulticall(
    client,
    externalAddrs.flatMap(addr => [
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'totalFundsAdded' as const },
    ]),
  )

  // Build markee → leaderboard lookup
  const markeeToLb = new Map<string, typeof leaderboards[0]>()
  for (const e of entries) {
    const key = e.markeeAddress.toLowerCase()
    if (!markeeToLb.has(key)) markeeToLb.set(key, leaderboards[e.lbIndex])
  }

  const funded = externalAddrs.map((addr, i) => {
    const b = i * 3
    const message = (detailResults[b]?.result as string) ?? ''
    const name = (detailResults[b + 1]?.result as string) ?? ''
    const totalFundsAdded = (detailResults[b + 2]?.result as bigint) ?? 0n
    const lb = markeeToLb.get(addr)
    const isTop = lb?.topMarkeeAddress?.toLowerCase() === addr
    return {
      address: addr,
      message,
      name,
      totalFundsAdded: totalFundsAdded.toString(),
      totalContributed: (markeeContribs.get(addr) ?? 0n).toString(),
      strategyId: lb?.address ?? '',
      strategyName: lb?.name ?? 'Unknown Leaderboard',
      isTop,
      topFundsRaw: lb?.topFundsAddedRaw ?? '0',
    }
  })

  return NextResponse.json({ funded })
}
