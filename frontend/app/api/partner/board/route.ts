// GET /api/partner/board?slug=markee-cooperative[&fresh=1]
// A partner's v1.1 leaderboard (top 100 markees with message/name/owner/strategy), read on the server
// and shared by every viewer through the snapshot cache (30 s fresh). Only registered partner slugs
// are accepted, so callers cannot point this route at arbitrary contracts. ?fresh=1 is for
// post-transaction refreshes and is rate-limited per IP; during an RPC outage the last good payload
// is served with stale: true. A partner board that finished migrating is read from its successor,
// and leaderboardAddress in the payload tells the page which board to buy on.
import { NextRequest, NextResponse } from 'next/server'
import type { Address } from 'viem'
import { PARTNERS, type PartnerBoardSnapshot } from '@/lib/contracts/partners'
import { LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'
import { createStreamingClient } from '@/lib/streaming/client'
import { cachedChainRead } from '@/lib/server/cachedChainRead'
import { currentBoardOrSelf } from '@/lib/contracts/currentAddressCache'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TOP_LIMIT = 100n

async function loadPartnerBoard(leaderboard: Address): Promise<PartnerBoardSnapshot> {
  // The shared Base client: server-only key first, same chain as the rest of the app.
  const client = createStreamingClient()
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const [addresses, funds] = await client.readContract({
    address: leaderboard, abi: LeaderboardV11ABI, functionName: 'getTopMarkees', args: [TOP_LIMIT], blockNumber,
  }) as unknown as [Address[], bigint[]]
  const details = addresses.length
    ? await client.multicall({
        blockNumber,
        contracts: addresses.flatMap(address => [
          { address, abi: MarkeeABI, functionName: 'message' },
          { address, abi: MarkeeABI, functionName: 'name' },
          { address, abi: MarkeeABI, functionName: 'owner' },
          { address, abi: MarkeeABI, functionName: 'pricingStrategy' },
        ]),
      })
    : []
  const at = (i: number) => details[i]?.status === 'success' ? String(details[i].result) : undefined
  return {
    leaderboardAddress: leaderboard,
    markees: addresses.map((address, i) => ({
      address,
      message: at(i * 4) ?? '',
      name: at(i * 4 + 1) ?? '',
      owner: at(i * 4 + 2) ?? '',
      pricingStrategy: at(i * 4 + 3) ?? address,
      totalFundsAdded: (funds[i] ?? 0n).toString(),
    })),
  }
}

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug')
  const partner = PARTNERS.find(p => p.slug === slug)
  if (!partner?.leaderboardAddress) {
    return NextResponse.json({ error: 'Unknown partner leaderboard' }, { status: 404 })
  }
  // Follow a finished board migration to its successor (cached; falls back to the registry address).
  const leaderboard = await currentBoardOrSelf(partner.leaderboardAddress)
  return cachedChainRead(request, {
    scope: 'partner-board',
    key: leaderboard.toLowerCase(),
    load: () => loadPartnerBoard(leaderboard),
  })
}
