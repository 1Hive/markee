import { cachedListing } from '@/lib/leaderboards/cached'
// app/api/superfluid/leaderboards/route.ts
import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { BASE_MARKEE_EVENTS_FROM_BLOCK, BOARD_MIGRATORS, V14_FACTORIES } from '@/lib/contracts/addresses'
import { listVisibleBoards, originalBoard } from '@/lib/contracts/migration'
import type { BoostedMarkee } from '@/app/api/superfluid/boosted/route'
import { LeaderboardFactoryABI, LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'
import { resolveBoardOrigins } from '@/lib/leaderboards/resolveCreators'
import { isDisqualifiedBoard } from '@/lib/leaderboards/disqualified'
import { authorName } from '@/lib/moderation/author-name'

const BOOSTED_KEY = 'superfluid:s6:boosted'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_KEY = 'cache:superfluid:leaderboards'

// ─── Config ───────────────────────────────────────────────────────────────────

// v1.3 Superfluid factory
const SUPERFLUID_FACTORY_ADDRESS = '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as const
// v1.3 Superfluid leaderboard (migrated from v1.2 via migrate-to-v13.sh)
const SF_MIGRATION_LEADERBOARD = '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as `0x${string}`

// Scopes getLogs to just creation events instead of every log the factory has ever emitted
// (admin changes, fee changes, etc.) — verified against the deployed factory's ABI on Basescan.

// ─── Client ───────────────────────────────────────────────────────────────────

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } }, // prevent Next.js caching RPC responses
    ),
  })
}

// ─── Creator lookup via factory logs ─────────────────────────────────────────
// Creator is not stored in the contract — we derive it from the transaction
// that called createLeaderboard. Results are cached permanently in KV since
// creator never changes.


// ─── Handler ─────────────────────────────────────────────────────────────────

async function loadListing(request: Request) {
  try {

    const client = getClient()

    // Fetch S6 boosted list in parallel with factory call
    const boostedListPromise = kv.get<BoostedMarkee[]>(BOOSTED_KEY).then(b => b ?? [])

    const { boards: addresses, predecessorOf } = await listVisibleBoards(client, BOARD_MIGRATORS.SUPERFLUID, [SUPERFLUID_FACTORY_ADDRESS, V14_FACTORIES.SUPERFLUID])

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

    const [markeeResults, origins, boostedList] = await Promise.all([
      markeeCalls.length > 0
        ? chunkedMulticall(markeeCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : Promise.resolve([]),
      resolveBoardOrigins(client, addresses.map(a => originalBoard(a, predecessorOf)), {
        keyPrefix: 'sf',
        factories: [SUPERFLUID_FACTORY_ADDRESS, V14_FACTORIES.SUPERFLUID],
        fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
        logLabel: 'superfluid/leaderboards',
      }),
      boostedListPromise,
    ])

    const boostedAddrs = new Set(boostedList.map(b => b.address.toLowerCase()))

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
        // A name that looks like another wallet's address or ENS name is withheld (see authorName); the owner is not read here, so any address is.
        topMessageOwner = authorName(markeeResults[markeeCallIndex + 1]?.result as string) || null
        markeeCallIndex += 2
      }

      const addrLower = addr.toLowerCase()

      return {
        address: addr,
        migratedFrom: predecessorOf.get(addr.toLowerCase()) ?? null,
        name,
        totalFunds: formatEther(totalFunds),
        totalFundsRaw: totalFunds.toString(),
        markeeCount: Number(markeeCount),
        admin,
        beneficiary,
        creator: origins[i]?.creator ?? null,
        initialAdmin: origins[i]?.initialAdmin ?? null,
        minimumPrice: formatEther(minimumPrice),
        minimumPriceRaw: minimumPrice.toString(),
        topFundsAddedRaw: topFunds0.toString(),
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
      // Disqualified boards (lib/leaderboards/disqualified.ts) never count toward platform totals.
      if (!isDisqualifiedBoard(originalBoard(l.address, predecessorOf))) {
        totalFundsRaw += BigInt(l.totalFundsRaw)
      }
    }

    leaderboards.sort((a, b) => {
      const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    // Derive featuredMessage from the SF migration leaderboard entry
    const migrationEntry = leaderboards.find(
      l => originalBoard(l.address, predecessorOf).toLowerCase() === SF_MIGRATION_LEADERBOARD.toLowerCase()
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
    const successorOf = new Map([...predecessorOf].map(([successor, predecessor]) => [predecessor.toLowerCase(), successor]))
    const boostedLeaderboards = boostedList.map(b => {
      const lb = leaderboardMap.get(b.address.toLowerCase()) ?? leaderboardMap.get(successorOf.get(b.address.toLowerCase()) ?? '')
      return { ...b, leaderboard: lb ?? null }
    })

    const payload = {
      leaderboards,
      boostedLeaderboards,
      totalPlatformFunds: formatEther(totalFundsRaw),
      featuredMessage,
    }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (err) {
    console.error('[superfluid/leaderboards] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch leaderboards' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return cachedListing(request, CACHE_KEY, loadListing, { 'Cache-Control': 'no-store, no-cache, must-revalidate' })
}
