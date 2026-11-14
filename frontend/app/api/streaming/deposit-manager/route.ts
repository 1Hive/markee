// app/api/streaming/deposit-manager/route.ts
//
// Backs the Deposit Manager modal: a wallet's ETHx balance plus every stream it has open across ALL
// streaming boards (not just the one whose modal happened to be open). Reuses the O(1)
// backerMarkee(wallet) lookup /api/marketplace/positions already established, but also needs the
// live flow rate and the backed markee's message/name, which that endpoint doesn't fetch.

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, erc20Abi } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { internalOrigin, internalHeaders } from '@/lib/internal-origin'
import { underRateLimit, clientIp } from '@/lib/rate-limit'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { STREAMING_BASE, CFA_FORWARDER_ABI, BUFFER_PERIOD } from '@/lib/superfluid/streaming'
import { boardLabel, type LabelledBoard } from '@/lib/leaderboards/label'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_TTL = 20 // seconds -- shorter than positions' 60s since this drives a live balance countdown
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const MAX_MARKEES_PER_BOARD = 500
const RATE_WINDOW = 60
const RATE_MAX_MISSES = 10

const ETHX = STREAMING_BASE.ethx as `0x${string}`
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as `0x${string}`

interface StreamingBoard extends LabelledBoard {
  address: string
  markeeCount: number
}

export interface DepositManagerStream {
  boardAddress: string
  boardName: string
  markeeAddress: string
  message: string
  name: string
  rank: number
  isTop: boolean
  rateRaw: string
}

export interface DepositManagerDeposit {
  boardAddress: string
  boardName: string
  depositRaw: string
  reclaimableRaw: string
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
      return NextResponse.json({ error: 'wallet required' }, { status: 400, headers: NO_CACHE })
    }

    const bust = new URL(request.url).searchParams.get('bust') === '1'
    const cacheKey = `cache:streaming:deposit-manager:${wallet}`
    if (!bust) {
      const cached = await kv.get<{ ethxBalanceRaw: string; streams: DepositManagerStream[]; deposits?: DepositManagerDeposit[] }>(cacheKey)
      if (cached) return NextResponse.json(cached, { headers: NO_CACHE })
    }

    if (!await underRateLimit('streaming:deposit-manager', clientIp(request), RATE_MAX_MISSES, RATE_WINDOW)) {
      return NextResponse.json(
        { ethxBalanceRaw: '0', streams: [], error: 'rate_limited' },
        { status: 429, headers: { ...NO_CACHE, 'Retry-After': String(RATE_WINDOW) } },
      )
    }

    const origin = internalOrigin()
    const headers = internalHeaders()
    const boardData = await fetch(`${origin}/api/streaming/leaderboards`, { cache: 'no-store', headers })
      .then(r => r.ok ? r.json() : { leaderboards: [] })
      .catch(() => ({ leaderboards: [] }))
    const streamingBoards: StreamingBoard[] = boardData.leaderboards ?? []

    const client = getClient()
    const walletAddr = wallet as `0x${string}`

    const [ethxBalanceResult, backerResultsList, depositResults] = await Promise.all([
      client.readContract({ address: ETHX, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddr] }).catch(() => 0n),
      streamingBoards.length > 0 ? chunkedMulticall(client, streamingBoards.map(l => ({
        address: l.address as `0x${string}`, abi: StreamingLeaderboardABI, functionName: 'backerMarkee' as const, args: [walletAddr] as const,
      })) as Parameters<typeof client.multicall>[0]['contracts']) : Promise.resolve([]),
      streamingBoards.length > 0 ? chunkedMulticall(client, streamingBoards.map(l => ({
        address: l.address as `0x${string}`, abi: StreamingLeaderboardABI, functionName: 'backerDeposit' as const, args: [walletAddr] as const,
      })) as Parameters<typeof client.multicall>[0]['contracts']) : Promise.resolve([]),
    ])

    const backed = streamingBoards
      .map((l, i) => ({ l, backer: backerResultsList[i]?.result as `0x${string}` | undefined }))
      .filter((x): x is { l: StreamingBoard; backer: `0x${string}` } =>
        !!x.backer && x.backer !== '0x0000000000000000000000000000000000000000')

    let streams: DepositManagerStream[] = []
    if (backed.length > 0) {
      const [topResults, rateResults, messageResults, nameResults] = await Promise.all([
        chunkedMulticall(client, backed.map(({ l }) => ({
          address: l.address as `0x${string}`, abi: StreamingLeaderboardABI, functionName: 'getTopMarkees' as const,
          args: [BigInt(Math.min(l.markeeCount || MAX_MARKEES_PER_BOARD, MAX_MARKEES_PER_BOARD))] as const,
        })) as Parameters<typeof client.multicall>[0]['contracts']),
        chunkedMulticall(client, backed.map(({ l }) => ({
          address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate' as const, args: [ETHX, walletAddr, l.address as `0x${string}`] as const,
        })) as Parameters<typeof client.multicall>[0]['contracts']),
        chunkedMulticall(client, backed.map(({ backer }) => ({
          address: backer, abi: MarkeeABI, functionName: 'message' as const,
        })) as Parameters<typeof client.multicall>[0]['contracts']),
        chunkedMulticall(client, backed.map(({ backer }) => ({
          address: backer, abi: MarkeeABI, functionName: 'name' as const,
        })) as Parameters<typeof client.multicall>[0]['contracts']),
      ])

      streams = backed.map(({ l, backer }, i) => {
        const addrs = (topResults[i]?.result as [string[], bigint[]] | undefined)?.[0] ?? []
        const idx = addrs.findIndex(a => a.toLowerCase() === backer.toLowerCase())
        const rank = idx !== -1 ? idx + 1 : 0
        return {
          boardAddress: l.address,
          boardName: boardLabel(l, 'Streaming board'),
          markeeAddress: backer,
          message: (messageResults[i]?.result as string | undefined) ?? '',
          name: (nameResults[i]?.result as string | undefined) ?? '',
          rank,
          isTop: rank === 1,
          rateRaw: ((rateResults[i]?.result as bigint | undefined) ?? 0n).toString(),
        }
      }).filter(s => s.rank > 0) // dropped if the markee fell off the returned top-N window
    }

    const heldBoards = streamingBoards
      .map((l, i) => ({ l, deposit: (depositResults[i]?.result as bigint | undefined) ?? 0n, backer: backerResultsList[i]?.result as string | undefined }))
      .filter(x => x.deposit > 0n)
    const heldRates = heldBoards.length > 0 ? await chunkedMulticall(client, heldBoards.map(({ l }) => ({
      address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate' as const, args: [ETHX, walletAddr, l.address as `0x${string}`] as const,
    })) as Parameters<typeof client.multicall>[0]['contracts']) : []
    const deposits: DepositManagerDeposit[] = []
    heldBoards.forEach(({ l, deposit, backer }, i) => {
      const streaming = !!backer && backer !== '0x0000000000000000000000000000000000000000'
      const rateRead = heldRates[i]
      if (streaming && rateRead?.status !== 'success') return
      const rate = streaming ? (rateRead!.result as bigint) : 0n
      const required = rate > 0n ? rate * BUFFER_PERIOD : 0n
      deposits.push({
        boardAddress: l.address,
        boardName: boardLabel(l, 'Streaming board'),
        depositRaw: deposit.toString(),
        reclaimableRaw: (deposit > required ? deposit - required : 0n).toString(),
      })
    })

    const payload = { ethxBalanceRaw: (ethxBalanceResult as bigint).toString(), streams, deposits }
    await kv.set(cacheKey, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (err) {
    console.error('[streaming/deposit-manager] error:', err)
    return NextResponse.json({ ethxBalanceRaw: '0', streams: [], deposits: [] }, { status: 500, headers: NO_CACHE })
  }
}
