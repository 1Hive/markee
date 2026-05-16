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

const OI_FACTORY_ADDRESSES = [
  '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c', // v1.3 — all OI leaderboards
] as const

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

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

// ─── Hardcoded partner meta ───────────────────────────────────────────────────
// These 4 leaderboards were migrated from v0.1 TopDawg contracts to v1.1.
// They live in the legacy OI factory but have no KV meta, so we hardcode
// verified status here rather than requiring a one-time KV write.

const PARTNER_META: Record<string, {
  logoUrl: string | null
  siteUrl: string
  verifiedUrl: string
  verifiedUrls: string[]
  status: 'verified'
}> = {
  '0x0590b56430426a38d0fa065b839c10d542e75ccd': { // Markee Cooperative (v1.3)
    logoUrl: '/markee-logo.png',
    siteUrl: 'https://markee.xyz',
    verifiedUrl: 'https://markee.xyz',
    verifiedUrls: ['https://markee.xyz'],
    status: 'verified',
  },
  '0x2768bc6e90266248bd8bcf5401c36d8049cdf671': { // Gardens (v1.3)
    logoUrl: '/partners/gardens.png',
    siteUrl: 'https://app.gardens.fund',
    verifiedUrl: 'https://app.gardens.fund',
    verifiedUrls: ['https://app.gardens.fund'],
    status: 'verified',
  },
  '0xdf4769a9593cb8e40d0409def2645651412a8a97': { // Clawchemy (v1.3)
    logoUrl: '/partners/clawchemy.png',
    siteUrl: 'https://clawchemy.xyz',
    verifiedUrl: 'https://clawchemy.xyz',
    verifiedUrls: ['https://clawchemy.xyz'],
    status: 'verified',
  },
}

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
    const logsPerFactory = await Promise.all(
      OI_FACTORY_ADDRESSES.map(addr => client.getLogs({ address: addr, fromBlock: 0n, toBlock: 'latest' }))
    )
    const logs = logsPerFactory.flat()

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

    const addresses = await client.readContract({
      address: OI_FACTORY_ADDRESSES[0],
      abi: FACTORY_ABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }).then(r => r as `0x${string}`[]).catch(() => [] as `0x${string}`[])

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

    let markeeCallIndex = 0

    const allLeaderboards = addresses.map((addr, i) => {
      const b = i * 6
      const name          = (metaResults[b]?.result as string) ?? addr
      const totalFunds    = (metaResults[b + 1]?.result as bigint) ?? 0n
      const markeeCount   = (metaResults[b + 2]?.result as bigint) ?? 0n
      const minimumPrice  = (metaResults[b + 3]?.result as bigint) ?? 0n
      const admin         = (metaResults[b + 4]?.result as string) ?? ''
      const topResult     = metaResults[b + 5]?.result as [string[], bigint[]] | undefined
      const topFunds0     = topResult?.[1]?.[0] ?? 0n

      let topMessage: string | null = null
      let topMessageOwner: string | null = null
      let topMarkeeOwner: string | null = null
      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        topMarkeeOwner  = (markeeResults[markeeCallIndex + 2]?.result as string) || null
        markeeCallIndex += 3
      }

      const kvMeta = kvMetas[i]
      const partnerMeta = PARTNER_META[addr.toLowerCase()]
      const meta = partnerMeta ?? kvMeta
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

    // Deduplicate: concurrent migration runs may have created identical copies.
    // Among entries sharing the same (name, admin), keep the first (canonical).
    const dedupeKey = new Set<string>()
    const leaderboards = allLeaderboards.filter(l => {
      const k = `${l.name.toLowerCase().trim()}|${l.admin.toLowerCase()}`
      if (dedupeKey.has(k)) return false
      dedupeKey.add(k)
      return true
    })

    let totalFundsRaw = 0n
    for (const l of leaderboards) totalFundsRaw += BigInt(l.totalFundsRaw)

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
