// app/api/superfluid/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import type { BoostedMarkee } from '@/app/api/superfluid/boosted/route'
import { LeaderboardFactoryABI, LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'

const BOOSTED_KEY = 'superfluid:s6:boosted'
const BASELINE_PREFIX = 'superfluid:s6:baseline:'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:superfluid:leaderboards'
const CACHE_TTL = 60 // seconds

// ─── Config ───────────────────────────────────────────────────────────────────

// v1.3 Superfluid factory
const SUPERFLUID_FACTORY_ADDRESS = '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as const
// v1.3 Superfluid leaderboard (migrated from v1.2 via migrate-to-v13.sh)
const SF_MIGRATION_LEADERBOARD = '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as `0x${string}`

// Leaderboards excluded from totalPlatformFunds — clearly gamed with recycled ETH
const GAMED_LEADERBOARD_ADDRESSES = new Set([
  '0x1b4eb52953d865e0dde1c856c2ead826581e2904', // Vivek wants to play (120 ETH)
  '0xb5451c1cb790367d0ddbcbf1249de22b9014ecdc', // @betonbangers (85 ETH)
  '0x4e413915c0c1d86084e8dcb36d4dec6b66b45a24', // Banger (34 ETH)
  '0x762c0484599d6a75636cc8cffd9fcb23793dc582', // Aeshii (9 ETH)
  '0x8578915859912888407f72f102761b7d21b2e702', // My Sup Project (8 ETH)
  '0x566f89accd7e6a497e7b4c9f7992f1fe67e564cb', // Ggh (4 ETH)
  '0x1be900ecc09edd0590db88723dbcb3b1fea22fe3', // Gyralis is coming (2 ETH)
  '0xe3ee8c369dc37e478bc4b0e7fbbecce5f1dc089f', // Bfhh (2 ETH)
  '0x097b06f778ae2fb32a9a4251ccf04fdbebf3733c', // Bangerrrd (2 ETH)
  '0x774d8d9ce01151fc5189c13e362f5061dab0fd8f', // billionaire0x (2 ETH)
  '0x122140b7714a2aa4507d7742a28d0fd71117a729', // Jgfjj (2 ETH)
  '0x4ad89044f5f3f324935747a4bce7ba7954d2aaa4', // Gvv (2 ETH)
  '0xc936a036b7727865a696398de30f616be98e266b', // Sup (2 ETH)
])

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

// ─── Creator lookup via factory logs ─────────────────────────────────────────
// Creator is not stored in the contract — we derive it from the transaction
// that called createLeaderboard. Results are cached permanently in KV since
// creator never changes.

async function resolveCreators(
  client: ReturnType<typeof getClient>,
  addresses: readonly `0x${string}`[],
): Promise<(string | null)[]> {
  const keys = addresses.map(a => `creator:sf:${a.toLowerCase()}`)
  const cached = await kv.mget<(string | null)[]>(...keys)

  const missingIndices = addresses.map((_, i) => i).filter(i => !cached[i])
  if (missingIndices.length === 0) return cached

  try {
    const logs = await client.getLogs({
      address: SUPERFLUID_FACTORY_ADDRESS,
      fromBlock: 0n,
      toBlock: 'latest',
    })

    // topics[1] = leaderboard address (first indexed param in the factory event)
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
        return kv.set(keys[i], creator) // no TTL — creator never changes
      }
    }))
  } catch (e: any) {
    console.error('[superfluid/leaderboards] creator lookup error:', e.message)
  }

  return cached
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

    // Fetch S6 boosted list and any stored baselines in parallel with factory call
    const boostedListPromise = kv.get<BoostedMarkee[]>(BOOSTED_KEY).then(b => b ?? [])

    const addresses = await client.readContract({
      address: SUPERFLUID_FACTORY_ADDRESS,
      abi: LeaderboardFactoryABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }) as `0x${string}`[]

    if (addresses.length === 0) {
      return NextResponse.json({ leaderboards: [], totalPlatformFunds: '0', featuredMessage: null }, {
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

    // 2. Multicall — fetch metadata for each leaderboard (7 calls per address)
    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LeaderboardV11ABI, functionName: 'leaderboardName' as const },        // b+0
      { address: addr, abi: LeaderboardV11ABI, functionName: 'totalLeaderboardFunds' as const },  // b+1
      { address: addr, abi: LeaderboardV11ABI, functionName: 'markeeCount' as const },            // b+2
      { address: addr, abi: LeaderboardV11ABI, functionName: 'minimumPrice' as const },           // b+3
      { address: addr, abi: LeaderboardV11ABI, functionName: 'admin' as const },                  // b+4
      { address: addr, abi: LeaderboardV11ABI, functionName: 'beneficiaryAddress' as const },     // b+5
      { address: addr, abi: LeaderboardV11ABI, functionName: 'getTopMarkees' as const, args: [1n] }, // b+6
    ])

    const metaResults = await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])

    // 3. Extract top markee addresses, then fetch their messages
    const topMarkeeAddresses: (`0x${string}` | null)[] = addresses.map((_, i) => {
      const topResult = metaResults[i * 7 + 6]?.result as [string[], bigint[]] | undefined
      return (topResult?.[0]?.[0] ?? null) as `0x${string}` | null
    })

    const markeeCalls = topMarkeeAddresses.flatMap(addr =>
      addr
        ? [
            { address: addr, abi: MarkeeABI, functionName: 'message' as const },
            { address: addr, abi: MarkeeABI, functionName: 'name' as const },
          ]
        : []
    )

    const [markeeResults, creators, boostedList] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      resolveCreators(client, addresses),
      boostedListPromise,
    ])

    const boostedAddrs = new Set(boostedList.map(b => b.address.toLowerCase()))

    // Fetch baselines for any address that has one stored
    const baselineKeys = addresses.map(a => `${BASELINE_PREFIX}${a.toLowerCase()}`)
    const baselineValues = await kv.mget<(string | null)[]>(...baselineKeys)
    const baselineMap = new Map<string, bigint>()
    addresses.forEach((addr, i) => {
      const val = baselineValues[i]
      if (val) baselineMap.set(addr.toLowerCase(), BigInt(val))
    })

    // 4. Assemble response
    let markeeCallIndex = 0

    const allLeaderboards = addresses.map((addr, i) => {
      const b = i * 7
      const name         = (metaResults[b]?.result as string) ?? addr
      const totalFunds   = (metaResults[b + 1]?.result as bigint) ?? 0n
      const markeeCount  = (metaResults[b + 2]?.result as bigint) ?? 0n
      const minimumPrice = (metaResults[b + 3]?.result as bigint) ?? 0n
      const admin        = (metaResults[b + 4]?.result as string) ?? ''
      const beneficiary  = (metaResults[b + 5]?.result as string) ?? ''
      const topResult    = metaResults[b + 6]?.result as [string[], bigint[]] | undefined
      const topFunds0    = topResult?.[1]?.[0] ?? 0n

      let topMessage: string | null = null
      let topMessageOwner: string | null = null

      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        markeeCallIndex += 2
      }

      const addrLower = addr.toLowerCase()
      const baseline = baselineMap.get(addrLower) ?? 0n
      const adjustedTopFunds = topFunds0 > baseline ? topFunds0 - baseline : 0n
      const adjustedTotalFunds = totalFunds > baseline ? totalFunds - baseline : 0n

      return {
        address: addr,
        name,
        totalFunds: formatEther(adjustedTotalFunds),
        totalFundsRaw: adjustedTotalFunds.toString(),
        markeeCount: Number(markeeCount),
        admin,
        beneficiary,
        creator: creators[i] ?? null,
        minimumPrice: formatEther(minimumPrice),
        minimumPriceRaw: minimumPrice.toString(),
        topFundsAddedRaw: adjustedTopFunds.toString(),
        topMessage,
        topMessageOwner,
        topMarkeeAddress: topMarkeeAddresses[i] ?? null,
        boosted: boostedAddrs.has(addrLower),
      }
    })

    // Deduplicate: concurrent migration runs may have created identical copies in the
    // v1.3 factory. Among entries sharing the same (name, beneficiary), keep the first
    // (lowest factory index = canonical migrated one). beneficiaryAddress is used instead
    // of admin because some duplicate copies had setAdmin fail, leaving different admin values.
    const dedupeKey = new Set<string>()
    const leaderboards = allLeaderboards.filter(l => {
      const k = `${l.name.toLowerCase().trim()}|${l.beneficiary.toLowerCase()}`
      if (dedupeKey.has(k)) return false
      dedupeKey.add(k)
      return true
    })

    let totalFundsRaw = 0n
    for (const l of leaderboards) {
      if (!GAMED_LEADERBOARD_ADDRESSES.has(l.address.toLowerCase())) {
        totalFundsRaw += BigInt(l.totalFundsRaw)
      }
    }

    leaderboards.sort((a, b) => {
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    // Derive featuredMessage from the SF migration leaderboard entry
    const migrationEntry = leaderboards.find(
      l => l.address.toLowerCase() === SF_MIGRATION_LEADERBOARD.toLowerCase()
    )
    const featuredMessage = migrationEntry?.topMessage ? {
      message: migrationEntry.topMessage,
      owner: migrationEntry.topMessageOwner ?? '',
      totalFundsAdded: migrationEntry.topFundsAddedRaw,
      totalFunds: migrationEntry.totalFundsRaw,
      markeeCount: migrationEntry.markeeCount,
    } : null

    // Build boostedLeaderboards: ordered by the boostedList order, with full metadata merged in
    const leaderboardMap = new Map(leaderboards.map(l => [l.address.toLowerCase(), l]))
    const boostedLeaderboards = boostedList.map(b => {
      const lb = leaderboardMap.get(b.address.toLowerCase())
      return { ...b, leaderboard: lb ?? null }
    })

    const payload = {
      leaderboards,
      boostedLeaderboards,
      totalPlatformFunds: formatEther(totalFundsRaw),
      featuredMessage,
    }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('[superfluid/leaderboards] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch leaderboards' }, { status: 500 })
  }
}
