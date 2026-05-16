// app/api/superfluid/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'cache:superfluid:leaderboards'
const CACHE_TTL = 60 // seconds

// ─── Config ───────────────────────────────────────────────────────────────────

// v1.2 Superfluid factory
const SUPERFLUID_FACTORY_ADDRESS = '0x72AB2bf7A691Dc331bC0736050A02E7F3a82d352' as const
// v1.1 Superfluid factory — still queried for the 108 user-created leaderboards not migrated to v1.2
const SF_LEGACY_FACTORY_ADDRESS = '0x1E1b0C22e2C6C7b46ABb0F25231c7eecD4f0A2d8' as const
// v1.2 Superfluid leaderboard (migrated from v1.1 via migrate-to-v12-eoa.sh)
const SF_MIGRATION_LEADERBOARD = '0x2EfF03c0cB4c09583462adEA1abbCeE92b52a742' as `0x${string}`
// v1.1 addresses that were migrated to v1.2 — exclude from legacy factory results to avoid duplicates
const SF_MIGRATED_V11 = new Set([
  '0xaec94b5fc02c3b7c3aedd79522bc0c62309486a7', // Gardens 🌱 → now 0x5dCD5003...
])

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
] as const

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

    const [v12Addresses, legacyAddresses] = await Promise.all([
      client.readContract({
        address: SUPERFLUID_FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getLeaderboards',
        args: [0n, 1000n],
      }) as Promise<`0x${string}`[]>,
      client.readContract({
        address: SF_LEGACY_FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getLeaderboards',
        args: [0n, 1000n],
      }).catch(() => []) as Promise<`0x${string}`[]>,
    ])

    // Combine v1.2 factory children with legacy factory, excluding addresses already migrated to v1.2
    const addresses = [
      ...(v12Addresses ?? []),
      ...(legacyAddresses ?? []).filter(a => !SF_MIGRATED_V11.has(a.toLowerCase())),
    ]

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

    // 2. Multicall — fetch metadata for each leaderboard
    const metaCalls = addresses.flatMap(addr => [
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
      { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [1n] },
    ])

    const metaResults = await chunkedMulticall(metaCalls as Parameters<typeof client.multicall>[0]['contracts'])

    // 3. Extract top markee addresses, then fetch their messages
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

    const [markeeResults, creators] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      resolveCreators(client, addresses),
    ])

    // 4. Assemble response
    let totalFundsRaw = 0n
    let markeeCallIndex = 0

    const leaderboards = addresses.map((addr, i) => {
      const b = i * 6
      const name         = (metaResults[b]?.result as string) ?? addr
      const totalFunds   = (metaResults[b + 1]?.result as bigint) ?? 0n
      const markeeCount  = (metaResults[b + 2]?.result as bigint) ?? 0n
      const minimumPrice = (metaResults[b + 3]?.result as bigint) ?? 0n
      const admin        = (metaResults[b + 4]?.result as string) ?? ''
      const topResult    = metaResults[b + 5]?.result as [string[], bigint[]] | undefined
      const topFunds0    = topResult?.[1]?.[0] ?? 0n

      totalFundsRaw += totalFunds

      let topMessage: string | null = null
      let topMessageOwner: string | null = null

      if (topMarkeeAddresses[i]) {
        topMessage      = (markeeResults[markeeCallIndex]?.result as string) || null
        topMessageOwner = (markeeResults[markeeCallIndex + 1]?.result as string) || null
        markeeCallIndex += 2
      }

      return {
        address: addr,
        name,
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
        topMarkeeAddress: topMarkeeAddresses[i] ?? null,
      }
    })

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

    const payload = { leaderboards, totalPlatformFunds: formatEther(totalFundsRaw), featuredMessage }
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('[superfluid/leaderboards] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch leaderboards' }, { status: 500 })
  }
}
