// GET /api/embed/[address]
// Returns the current top message for a leaderboard. CORS-open so any site
// can poll it. KV-cached for 60 s; bust with ?bust=1. A message its board's
// moderators flagged comes back with `flagged: true` and its text and author
// blanked, since this feeds other sites (markee.xyz-only flags don't apply).
// Moderation is evaluated on every response, separately from cached financial/display data.
// A migrated legacy board serves its successor's data; `address` echoes the
// requested address and `currentAddress` names the board the data came from.
import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { moderateEmbed } from '@/lib/moderation/embed'
import { currentBoardOrSelf } from '@/lib/contracts/currentAddressCache'

export const dynamic = 'force-dynamic'

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [
      { name: 'topAddresses', type: 'address[]' },
      { name: 'topFunds',     type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message',         outputs: [{ name: '', type: 'string'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name',            outputs: [{ name: '', type: 'string'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

type EmbedPayload = { topMarkeeAddress: string | null; message: string; name: string; flagged: boolean; [key: string]: unknown }

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', {
      fetchOptions: { cache: 'no-store' },
    }),
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  const address = params.address.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400, headers: CORS })
  }

  const bust = req.nextUrl.searchParams.get('bust') === '1'
  const rpc = getClient()
  const board = (await currentBoardOrSelf(address as `0x${string}`, rpc)).toLowerCase()
  const CACHE_KEY = `cache:embed:${board}`
  const forRequest = (payload: EmbedPayload) => ({ ...payload, address, currentAddress: board })

  if (!bust) {
    const cached = await kv.get<EmbedPayload>(CACHE_KEY).catch(() => null)
    if (cached) {
      return NextResponse.json(await moderateEmbed(forRequest(cached)), { headers: { ...CORS, 'X-Cache': 'HIT' } })
    }
  }

  const addr = board as `0x${string}`

  const [leaderboardName, topResult] = await Promise.all([
    rpc.readContract({ address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' }).catch(() => ''),
    rpc.readContract({ address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees', args: [1n] }).catch(() => null),
  ])

  const topMarkeeAddress: string | null = (topResult as any)?.[0]?.[0] ?? null
  const topFundsRaw: string = (((topResult as any)?.[1]?.[0] as bigint) ?? 0n).toString()

  let message         = ''
  let name            = ''
  let totalFundsAdded = '0'
  let flagged         = false

  const ZERO = '0x0000000000000000000000000000000000000000'
  if (topMarkeeAddress && topMarkeeAddress !== ZERO) {
    const mAddr = topMarkeeAddress as `0x${string}`
    const [msg, nm, funds] = await Promise.all([
      rpc.readContract({ address: mAddr, abi: MARKEE_ABI, functionName: 'message'         }).catch(() => ''),
      rpc.readContract({ address: mAddr, abi: MARKEE_ABI, functionName: 'name'            }).catch(() => ''),
      rpc.readContract({ address: mAddr, abi: MARKEE_ABI, functionName: 'totalFundsAdded' }).catch(() => 0n),
    ])
    message         = flagged ? '' : msg as string
    name            = flagged ? '' : nm  as string
    totalFundsAdded = (funds as bigint).toString()
  }

  const payload = {
    address: board,
    leaderboardName: leaderboardName as string,
    topMarkeeAddress: topMarkeeAddress ?? null,
    topFundsRaw,
    message,
    name,
    flagged,
    totalFundsAdded,
    updatedAt: new Date().toISOString(),
  }

  await kv.set(CACHE_KEY, payload, { ex: 60 }).catch(() => {})

  return NextResponse.json(await moderateEmbed(forRequest(payload)), { headers: { ...CORS, 'X-Cache': 'MISS' } })
}
