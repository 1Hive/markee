// app/api/marketplace/positions/route.ts
//
// Computes a wallet's rank on every board in the marketplace, so the "Rank" column can be sorted --
// sorting has to happen before pagination, which means every row's rank has to be known up front, not
// lazily per rendered row. Two very different costs per board:
//
//   Streaming: backerMarkee(wallet) is O(1) (a direct mapping), so only getTopMarkees is needed on top
//   to find that markee's rank.
//
//   Fixed: there's no equivalent "which markee does this wallet own" mapping, so the only way to find
//   a wallet's rank is to enumerate getTopMarkees and read owner() on every returned markee. Capped to
//   each board's own markeeCount (from the ecosystem listing) rather than a flat large limit.
//
// Cached per-wallet in KV for a short window since this is a genuinely heavier read than the other
// listing endpoints.

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { underRateLimit, clientIp } from '@/lib/rate-limit'
import { LeaderboardV11ABI, StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_TTL = 60 // seconds
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const MAX_MARKEES_PER_BOARD = 500

// The per-wallet cache above bounds repeat cost for one wallet, but the endpoint is unauthenticated
// and the wallet is caller-supplied, so cycling addresses walks straight past it into a full RPC
// fan-out every time (every board's getTopMarkees, plus owner() on every markee of every fixed
// board). Cache misses are therefore also metered per IP.
const RATE_WINDOW = 60 // seconds
const RATE_MAX_MISSES = 10

interface EcosystemLeaderboard {
  address: string
  strategy?: 'fixed' | 'streaming'
  markeeCount: number
}

interface Position {
  rank: number
  markeeAddress: string
  fundedRaw?: string
}

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

const CHUNK_SIZE = 50
async function chunkedMulticall(client: ReturnType<typeof getClient>, contracts: Parameters<typeof client.multicall>[0]['contracts']) {
  const results = []
  for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
    results.push(...await client.multicall({ contracts: contracts.slice(i, i + CHUNK_SIZE) as typeof contracts }))
  }
  return results
}

export async function GET(request: NextRequest) {
  try {
    const wallet = new URL(request.url).searchParams.get('wallet')?.toLowerCase()
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400 })
    }

    const cacheKey = `cache:marketplace:positions:${wallet}`
    const cached = await kv.get<{ positions: Record<string, Position> }>(cacheKey)
    if (cached) return NextResponse.json(cached, { headers: NO_CACHE })

    if (!await underRateLimit('marketplace:positions', clientIp(request), RATE_MAX_MISSES, RATE_WINDOW)) {
      return NextResponse.json(
        { positions: {}, error: 'rate_limited' },
        { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(RATE_WINDOW) } },
      )
    }

    const origin = internalOrigin()
    const headers = internalHeaders()
    const ecoData = await fetch(`${origin}/api/ecosystem/leaderboards`, { cache: 'no-store', headers })
      .then(r => r.ok ? r.json() : { leaderboards: [] })
      .catch(() => ({ leaderboards: [] }))
    const leaderboards: EcosystemLeaderboard[] = ecoData.leaderboards ?? []

    const client = getClient()
    const walletAddr = wallet as `0x${string}`
    const positions: Record<string, Position> = {}

    const streamingBoards = leaderboards.filter(l => l.strategy === 'streaming')
    const fixedBoards = leaderboards.filter(l => l.strategy !== 'streaming')

    // ── Streaming: O(1) backerMarkee lookup, then find that markee's rank ──────────
    if (streamingBoards.length > 0) {
      const backerCalls = streamingBoards.map(l => ({
        address: l.address as `0x${string}`, abi: StreamingLeaderboardABI, functionName: 'backerMarkee' as const, args: [walletAddr] as const,
      }))
      const backerResults = await chunkedMulticall(client, backerCalls as Parameters<typeof client.multicall>[0]['contracts'])

      const backed = streamingBoards
        .map((l, i) => ({ l, backer: backerResults[i]?.result as `0x${string}` | undefined }))
        .filter((x): x is { l: EcosystemLeaderboard; backer: `0x${string}` } =>
          !!x.backer && x.backer !== '0x0000000000000000000000000000000000000000')

      if (backed.length > 0) {
        const topCalls = backed.map(({ l }) => ({
          address: l.address as `0x${string}`, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const,
          args: [BigInt(Math.min(l.markeeCount || MAX_MARKEES_PER_BOARD, MAX_MARKEES_PER_BOARD))] as const,
        }))
        const topResults = await chunkedMulticall(client, topCalls as Parameters<typeof client.multicall>[0]['contracts'])

        backed.forEach(({ l, backer }, i) => {
          const addrs = (topResults[i]?.result as [string[], bigint[]] | undefined)?.[0] ?? []
          const idx = addrs.findIndex(a => a.toLowerCase() === backer.toLowerCase())
          if (idx !== -1) positions[l.address.toLowerCase()] = { rank: idx + 1, markeeAddress: backer }
        })
      }
    }

    // ── Fixed: no O(1) shortcut -- enumerate getTopMarkees + owner() per markee ────
    if (fixedBoards.length > 0) {
      const topCalls = fixedBoards.map(l => ({
        address: l.address as `0x${string}`, abi: LeaderboardV11ABI, functionName: 'getTopMarkees' as const,
        args: [BigInt(Math.min(l.markeeCount || MAX_MARKEES_PER_BOARD, MAX_MARKEES_PER_BOARD))] as const,
      }))
      const topResults = await chunkedMulticall(client, topCalls as Parameters<typeof client.multicall>[0]['contracts'])

      const perBoardAddrs = fixedBoards.map((_, i) => (topResults[i]?.result as [string[], bigint[]] | undefined)?.[0] ?? [])
      const perBoardFunds = fixedBoards.map((_, i) => (topResults[i]?.result as [string[], bigint[]] | undefined)?.[1] ?? [])

      const ownerCalls = perBoardAddrs.flatMap(addrs =>
        addrs.map(a => ({ address: a as `0x${string}`, abi: MarkeeABI, functionName: 'owner' as const }))
      )
      // Relies on multicall's default allowFailure: true. A markee whose owner() reverts comes back
      // as { status: 'failure' } and drops out of the rank below, rather than throwing and costing
      // every other board its position.
      const ownerResults = ownerCalls.length > 0
        ? await chunkedMulticall(client, ownerCalls as Parameters<typeof client.multicall>[0]['contracts'])
        : []

      let cursor = 0
      fixedBoards.forEach((l, bi) => {
        const addrs = perBoardAddrs[bi]
        const funds = perBoardFunds[bi]
        const owners = addrs.map(() => (ownerResults[cursor++]?.result as string | undefined))
        const rankIdx = owners.findIndex(o => o?.toLowerCase() === wallet)
        if (rankIdx !== -1) {
          positions[l.address.toLowerCase()] = {
            rank: rankIdx + 1,
            markeeAddress: addrs[rankIdx],
            fundedRaw: funds[rankIdx]?.toString(),
          }
        }
      })
    }

    const payload = { positions }
    await kv.set(cacheKey, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[marketplace/positions] error:', err)
    return NextResponse.json({ positions: {} }, { headers: NO_CACHE })
  }
}
