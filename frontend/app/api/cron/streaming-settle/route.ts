/**
 * Streaming settle — routes every backer's accrued RevNet share.
 *
 *   GET /api/cron/streaming-settle[?dryRun=1][&minPending=<wei>][&minBoardPending=<wei>][&maxFeeBps=<bps>]
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Backers come from the Superfluid subgraph (every sender that ever streamed into a board), owed
 * amounts from pendingSettlement on-chain. settle is permissionless and pays each backer's tokens to
 * that backer, so the keeper wallet only spends gas. Shares below minPending (default 0.0001 ETHx),
 * boards owed less than minBoardPending in total (default 0.01 ETHx), and settles whose fee is over
 * maxFeeBps of what they route (default 100, i.e. 1%) are left for a later run.
 */

import { NextRequest } from 'next/server'
import type { Address } from 'viem'
import { runSettler } from '@/lib/streaming/settler'
import { fetchBoardSenders } from '@/lib/streaming/subgraph'
import { STREAMING_FACTORY } from '@/lib/contracts/addresses'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import { handleKeeperRoute } from '@/lib/server/keeperRoute'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function bigintParam(req: NextRequest, name: string): bigint | undefined {
  const value = req.nextUrl.searchParams.get(name)
  return value && /^\d+$/.test(value) ? BigInt(value) : undefined
}

function handle(req: NextRequest) {
  return handleKeeperRoute(req, {
    name: 'streaming-settle',
    maxDuration,
    run: async ({ publicClient, walletClient }) => {
      const report = await runSettler({
        publicClient,
        walletClient,
        factory: STREAMING_FACTORY as Address,
        fetchBackers: boards => fetchBoardSenders(boards, STREAMING_BASE.ethx),
        minPending: bigintParam(req, 'minPending'),
        minBoardPending: bigintParam(req, 'minBoardPending'),
        maxFeeBps: bigintParam(req, 'maxFeeBps'),
        log: (m) => console.log('[streaming-settle]', m),
      })
      return {
        ...report,
        pending: report.pending.toString(),
        actions: report.actions.map(a => ({ ...a, amount: a.amount.toString() })),
      }
    },
  })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
