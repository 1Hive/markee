// app/api/forsale/leaderboards/route.ts
//
// Enumerates the shared "For Sale" LeaderboardFactory -- the vertical-agnostic factory all future
// fixed-price creation goes through (mirrors how streaming/"For Rent" boards already aren't split by
// platform). Since this factory bakes no per-board platform tag (unlike streaming's boardPlatform),
// "Served On" for these boards is derived by the consumer from verification data (verifiedUrls /
// linkedFiles), both fetched here per address so the response is self-contained.
//
// KV keys used:
//   creator:fs:{address}   — creator address for factory leaderboards (permanent)
//   oi:meta:{address}      — { logoUrl, siteUrl, verifiedUrl, verifiedUrls, status } (shared KV
//                             namespace with the OpenInternet route -- verification is address-based,
//                             not factory-based)
//   github:markee:{address} — linked GitHub files (via getLinkedFiles), same shared namespace

import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { LeaderboardFactoryABI, LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'
import { FACTORIES, FOR_SALE_FACTORY_DEPLOY_BLOCK } from '@/lib/contracts/addresses'
import { getLinkedFilesBatch, type LinkedFile } from '@/lib/github/linkedFiles'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:forsale:leaderboards'
const CACHE_TTL = 60 // seconds

const FOR_SALE_FACTORY_ADDRESS = FACTORIES.FOR_SALE

// Scopes getLogs to just creation events instead of every log the factory has ever emitted.
const LEADERBOARD_CREATED_EVENT = parseAbiItem(
  'event LeaderboardCreated(address indexed leaderboardAddress, address indexed admin, address indexed beneficiaryAddress, string name, address seedMarkeeAddress)'
)

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

async function resolveCreators(
  client: ReturnType<typeof getClient>,
  addresses: readonly `0x${string}`[],
): Promise<(string | null)[]> {
  const keys = addresses.map(a => `creator:fs:${a.toLowerCase()}`)
  if (keys.length === 0) return []
  const cached = await kv.mget<(string | null)[]>(...keys)

  const missingIndices = addresses.map((_, i) => i).filter(i => !cached[i])
  if (missingIndices.length === 0) return cached

  try {
    const logs = await client.getLogs({
      address: FOR_SALE_FACTORY_ADDRESS,
      event: LEADERBOARD_CREATED_EVENT,
      fromBlock: FOR_SALE_FACTORY_DEPLOY_BLOCK,
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
    console.error('[forsale/leaderboards] creator lookup error:', e.message)
  }

  return cached
}

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
      address: FOR_SALE_FACTORY_ADDRESS,
      abi: LeaderboardFactoryABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }).then(r => r as `0x${string}`[]).catch(() => [] as `0x${string}`[])

    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LeaderboardV11ABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'markeeCount' as const },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'minimumPrice' as const },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'admin' as const },
      { address: addr, abi: LeaderboardV11ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])

    const metaResults = metaCalls.length > 0
      ? await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])
      : []

    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 6 + 5]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr ? [
        { address: addr, abi: MarkeeABI, functionName: 'message' as const },
        { address: addr, abi: MarkeeABI, functionName: 'name' as const },
        { address: addr, abi: MarkeeABI, functionName: 'owner' as const },
      ] : []
    )

    const metaKeys = addresses.map(a => `oi:meta:${a.toLowerCase()}`)
    const [markeeResults, creators, kvMetas, linkedFilesPerAddr] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      resolveCreators(client, addresses),
      addresses.length > 0
        ? kv.mget<({ logoUrl?: string; siteUrl?: string; verifiedUrl?: string; verifiedUrls?: string[]; status?: string } | null)[]>(...metaKeys)
        : Promise.resolve([]),
      getLinkedFilesBatch(addresses),
    ])

    // markeeCalls emits 3 calls per board but skips boards with no top markee, so each board's
    // offset into markeeResults counts only the boards before it that have one.
    const markeeResultOffsets: number[] = []
    for (let i = 0, offset = 0; i < topMarkeeAddresses.length; i++) {
      markeeResultOffsets.push(offset)
      if (topMarkeeAddresses[i]) offset += 3
    }

    const leaderboards = addresses.map((addr, i) => {
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
        const m = markeeResultOffsets[i]
        topMessage      = (markeeResults[m]?.result as string) || null
        topMessageOwner = (markeeResults[m + 1]?.result as string) || null
        topMarkeeOwner  = (markeeResults[m + 2]?.result as string) || null
      }

      const meta = kvMetas[i]
      const linkedFiles: LinkedFile[] = linkedFilesPerAddr[i] ?? []

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
        status: meta?.status === 'verified' ? 'verified' as const : 'pending' as const,
        linkedFiles,
        // Signals to /account and marketplace that this board needs a verified integration to count
        // as Active -- unlike the legacy per-vertical factories, there's no migration history to
        // exempt here since everything from this factory is a genuinely new creation.
        verificationGated: true,
      }
    })

    leaderboards.sort((a, b) => {
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    const totalFundsRaw = leaderboards.reduce((sum, l) => sum + BigInt(l.totalFundsRaw), 0n)

    const payload = {
      leaderboards,
      totalPlatformFunds: formatEther(totalFundsRaw),
    }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[forsale/leaderboards] error:', err)
    return NextResponse.json({ leaderboards: [] }, { headers: NO_CACHE })
  }
}
