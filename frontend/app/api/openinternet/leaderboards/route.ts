// app/api/openinternet/leaderboards/route.ts
//
// Returns a unified list of "website" leaderboards:
//   1. LeaderboardFactory contracts (OpenInternet factory) — fetched via RPC
//   2. Legacy TopDawg partner strategy contracts — fetched via subgraph
//
// KV keys used:
//   creator:oi:{address}   — creator address for factory leaderboards (permanent)
//   oi:meta:{address}      — { logoUrl, siteUrl, verifiedUrl, status } for factory leaderboards

import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:openinternet:leaderboards'
const CACHE_TTL = 60 // seconds

const OI_FACTORY_ADDRESS = '0x3f9f7C070f03167C0A90Ee7C2c5863d6F15F7E6D' as const

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE ||
  process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_STUDIO

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ─── Hardcoded legacy TopDawg partner metadata ────────────────────────────────
// These partners use legacy TopDawg strategy contracts (not the factory).
// verified = has a live public URL; status is set accordingly.

const LEGACY_PARTNERS = [
  {
    slug: 'markee-cooperative',
    name: 'Markee Cooperative',
    strategyAddress: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a',
    logoUrl: '/markee-logo.png',
    siteUrl: 'https://markee.xyz',
    verifiedUrl: 'https://markee.xyz',
    status: 'verified' as const,
    isCooperative: true,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'gardens',
    name: 'Gardens',
    strategyAddress: '0x346419315740F085Ba14cA7239D82105a9a2BDBE',
    logoUrl: '/partners/gardens.png',
    siteUrl: 'https://app.gardens.fund',
    verifiedUrl: 'https://app.gardens.fund',
    status: 'verified' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'bread-cooperative',
    name: 'Bread Cooperative',
    strategyAddress: '0x05A40489965B355e0404c05134dA68626a5a927c',
    logoUrl: '/partners/breadcoop.png',
    siteUrl: null,
    verifiedUrl: null,
    status: 'pending' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'revnets',
    name: 'RevNets',
    strategyAddress: '0xe68CbEf87B710B379654Dfd3c0BEC8779bBCcEbB',
    logoUrl: '/partners/revnets.png',
    siteUrl: null,
    verifiedUrl: null,
    status: 'pending' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'juicebox',
    name: 'Juicebox',
    strategyAddress: '0x2a84960367832039C188C75FD6D6D5f2E8F640e2',
    logoUrl: '/partners/juicebox.png',
    siteUrl: null,
    verifiedUrl: null,
    status: 'pending' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'giveth',
    name: 'Giveth',
    strategyAddress: '0x00A60bA8351a69EF8d10F6c9b2b0E03aDE2E7431',
    logoUrl: '/partners/giveth.png',
    siteUrl: null,
    verifiedUrl: null,
    status: 'pending' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'flow-state',
    name: 'Flow State',
    strategyAddress: '0x24512EE8E5f9138e2Bfca0c8253e7525035f4989',
    logoUrl: '/partners/flowstate.png',
    siteUrl: null,
    verifiedUrl: null,
    status: 'pending' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'superfluid',
    name: 'Superfluid',
    strategyAddress: '0x7A6CE4d457AC1A31513BDEFf924FF942150D293E',
    logoUrl: '/partners/superfluid.png',
    siteUrl: 'https://campaigns.superfluid.org',
    verifiedUrl: 'https://campaigns.superfluid.org',
    status: 'verified' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
  {
    slug: 'clawchemy',
    name: 'Clawchemy',
    strategyAddress: '0x89e608223BEc645227f11d8241e8175A9A95597E',
    logoUrl: '/partners/clawchemy.png',
    siteUrl: 'https://clawchemy.xyz/',
    verifiedUrl: 'https://clawchemy.xyz/',
    status: 'verified' as const,
    isCooperative: false,
    percentToBeneficiary: 10000,
  },
] as const

// ─── ABIs ─────────────────────────────────────────────────────────────────────

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
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Client ───────────────────────────────────────────────────────────────────

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

// ─── Subgraph: batch fetch all legacy partner data ────────────────────────────

interface LegacySubgraphData {
  totalFundsRaised: string
  totalMarkeesCreated: string
  topMessage: string | null
  topMessageOwner: string | null
  topMarkeeAddress: string | null
  topFundsAddedRaw: string
}

async function fetchLegacyPartnerData(): Promise<(LegacySubgraphData | null)[]> {
  if (!SUBGRAPH_URL) return LEGACY_PARTNERS.map(() => null)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const graphToken = process.env.GRAPH_TOKEN || process.env.NEXT_PUBLIC_GRAPH_TOKEN
  if (graphToken) headers['Authorization'] = `Bearer ${graphToken}`

  // Build a batch GraphQL query using aliases for each partner
  const markeeFields = `
    totalFundsRaised
    totalMarkeesCreated
    markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1) {
      id
      message
      totalFundsAdded
      owner { id }
    }
  `
  const aliases = LEGACY_PARTNERS.map((p, i) => {
    const id = p.strategyAddress.toLowerCase()
    const typeName = p.isCooperative ? 'topDawgStrategy' : 'topDawgPartnerStrategy'
    return `p${i}: ${typeName}(id: "${id}") { ${markeeFields} }`
  }).join('\n')

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const json = await res.json()
    const data = json.data ?? {}

    return LEGACY_PARTNERS.map((_, i) => {
      const d = data[`p${i}`]
      if (!d) return null
      const top = d.markees?.[0]
      return {
        totalFundsRaised: d.totalFundsRaised ?? '0',
        totalMarkeesCreated: d.totalMarkeesCreated ?? '0',
        topMessage: top?.message ?? null,
        topMessageOwner: top?.owner?.id ?? null,
        topMarkeeAddress: top?.id ?? null,
        topFundsAddedRaw: top?.totalFundsAdded ?? '0',
      }
    })
  } catch (e: any) {
    console.error('[openinternet/leaderboards] subgraph error:', e.message)
    return LEGACY_PARTNERS.map(() => null)
  }
}

// ─── Creator resolution for factory leaderboards ──────────────────────────────

async function resolveCreators(
  client: ReturnType<typeof getClient>,
  addresses: readonly `0x${string}`[],
): Promise<(string | null)[]> {
  const keys = addresses.map(a => `creator:oi:${a.toLowerCase()}`)
  const cached = await kv.mget<(string | null)[]>(...keys)

  const missingIndices = addresses.map((_, i) => i).filter(i => !cached[i])
  if (missingIndices.length === 0) return cached

  try {
    const logs = await client.getLogs({
      address: OI_FACTORY_ADDRESS,
      fromBlock: 0n,
      toBlock: 'latest',
    })

    const lbToTxHash = new Map<string, `0x${string}`>()
    for (const log of logs) {
      if (log.topics[1]) {
        const addr = (`0x${log.topics[1].slice(26)}`).toLowerCase()
        lbToTxHash.set(addr, log.transactionHash)
      }
    }

    const missingAddrs = missingIndices.map(i => addresses[i].toLowerCase())
    const hashes = [...new Set(missingAddrs.map(a => lbToTxHash.get(a)).filter((h): h is `0x${string}` => !!h))]
    const txs = await Promise.all(hashes.map(hash => client.getTransaction({ hash })))
    const txMap = new Map(txs.map(tx => [tx.hash.toLowerCase(), tx.from.toLowerCase()]))

    await Promise.all(missingIndices.map(i => {
      const addr = addresses[i].toLowerCase()
      const creator = txMap.get((lbToTxHash.get(addr) ?? '').toLowerCase())
      if (creator) {
        cached[i] = creator
        return kv.set(keys[i], creator) // permanent — creator never changes
      }
    }))
  } catch (e: any) {
    console.error('[openinternet/leaderboards] creator lookup error:', e.message)
  }

  return cached
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: NO_CACHE })
}

export async function GET(request: Request) {
  try {
    const bust = new URL(request.url).searchParams.get('bust') === '1'
    if (!bust) {
      const cached = await kv.get<object>(CACHE_KEY)
      if (cached) return NextResponse.json(cached, { headers: NO_CACHE })
    }

    const client = getClient()

    const CHUNK_SIZE = 50
    async function chunkedMulticall(contracts: Parameters<typeof client.multicall>[0]['contracts']) {
      const results = []
      for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
        const chunk = contracts.slice(i, i + CHUNK_SIZE) as Parameters<typeof client.multicall>[0]['contracts']
        results.push(...await client.multicall({ contracts: chunk }))
      }
      return results
    }

    // Fetch factory addresses and legacy subgraph data in parallel
    const [factoryAddresses, legacyData] = await Promise.all([
      client.readContract({
        address: OI_FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getLeaderboards',
        args: [0n, 1000n],
      }) as Promise<`0x${string}`[]>,
      fetchLegacyPartnerData(),
    ])

    const addresses = factoryAddresses ?? []

    // Multicall for OI factory leaderboard metadata
    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])

    const metaResults = metaCalls.length > 0
      ? await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])
      : []

    // Top markee addresses for fetching messages
    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 6 + 5]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr ? [
        { address: addr, abi: MARKEE_ABI, functionName: 'message' as const },
        { address: addr, abi: MARKEE_ABI, functionName: 'name' as const },
        { address: addr, abi: MARKEE_ABI, functionName: 'owner' as const },
      ] : []
    )

    // Resolve creators, fetch markee messages, and read KV meta in parallel
    const metaKeys = addresses.map(a => `oi:meta:${a.toLowerCase()}`)
    const [markeeResults, creators, kvMetas] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      resolveCreators(client, addresses),
      addresses.length > 0
        ? kv.mget<({ logoUrl?: string; siteUrl?: string; verifiedUrl?: string; verifiedUrls?: string[]; status?: string } | null)[]>(...metaKeys)
        : Promise.resolve([]),
    ])

    // Assemble OI factory leaderboards
    let totalFundsRaw = 0n
    let markeeCallIndex = 0

    const factoryLeaderboards = addresses.map((addr, i) => {
      const b = i * 6
      const name          = (metaResults[b]?.result as string) ?? addr
      const totalFunds    = (metaResults[b + 1]?.result as bigint) ?? 0n
      const markeeCount   = (metaResults[b + 2]?.result as bigint) ?? 0n
      const minimumPrice  = (metaResults[b + 3]?.result as bigint) ?? 0n
      const admin         = (metaResults[b + 4]?.result as string) ?? ''
      const topResult     = metaResults[b + 5]?.result as [string[], bigint[]] | undefined
      const topFunds0     = topResult?.[1]?.[0] ?? 0n

      totalFundsRaw += totalFunds

      let topMessage: string | null = null
      let topMessageOwner: string | null = null
      let topMarkeeOwner: string | null = null
      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        topMarkeeOwner  = (markeeResults[markeeCallIndex + 2]?.result as string) || null
        markeeCallIndex += 3
      }

      const meta = kvMetas[i]
      return {
        address: addr,
        name,
        platform: 'website' as const,
        isLegacy: false,
        totalFunds: formatEther(totalFunds),
        totalFundsRaw: totalFunds.toString(),
        markeeCount: Number(markeeCount),
        admin,
        creator: creators[i] ?? null,
        minimumPrice: formatEther(minimumPrice),
        minimumPriceRaw: minimumPrice.toString(),
        topFundsAddedRaw: topFunds0.toString(),
        topMessage,
        topMessageOwner,
        topMarkeeOwner,
        topMarkeeAddress: topMarkeeAddresses[i] ?? null,
        logoUrl: meta?.logoUrl ?? null,
        siteUrl: meta?.siteUrl ?? null,
        verifiedUrl: meta?.verifiedUrl ?? null,
        verifiedUrls: Array.isArray(meta?.verifiedUrls) ? meta.verifiedUrls : meta?.verifiedUrl ? [meta.verifiedUrl] : [],
        status: (meta?.status as 'pending' | 'verified') ?? 'pending',
      }
    })

    // Assemble legacy TopDawg leaderboards
    const legacyLeaderboards = LEGACY_PARTNERS.map((partner, i) => {
      const d = legacyData[i]
      const totalFundsWei = BigInt(d?.totalFundsRaised ?? '0')
      totalFundsRaw += totalFundsWei
      return {
        address: partner.strategyAddress,
        name: partner.name,
        platform: 'website' as const,
        isLegacy: true,
        totalFunds: formatEther(totalFundsWei),
        totalFundsRaw: totalFundsWei.toString(),
        markeeCount: Number(d?.totalMarkeesCreated ?? 0),
        admin: null,
        creator: null,
        minimumPrice: '0',
        minimumPriceRaw: '0',
        topFundsAddedRaw: d?.topFundsAddedRaw ?? '0',
        topMessage: d?.topMessage ?? null,
        topMessageOwner: d?.topMessageOwner ?? null,
        topMarkeeAddress: d?.topMarkeeAddress ?? null,
        logoUrl: partner.logoUrl,
        siteUrl: partner.siteUrl,
        verifiedUrl: partner.verifiedUrl,
        status: partner.status,
        slug: partner.slug,
        isCooperative: partner.isCooperative,
        percentToBeneficiary: partner.percentToBeneficiary,
      }
    })

    const leaderboards = [...factoryLeaderboards, ...legacyLeaderboards]
    leaderboards.sort((a, b) => {
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    const payload = {
      leaderboards,
      totalPlatformFunds: formatEther(totalFundsRaw),
    }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[openinternet/leaderboards] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
