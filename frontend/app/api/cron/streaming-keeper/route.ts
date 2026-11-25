/**
 * Streaming keeper — heals on-chain ranking lag.
 *
 * Vercel cron calls it on a schedule (a periodic poll, not an event trigger: the decay/decrease
 * that staled the title fires no tx and no event), sending the platform's cron secret:
 *
 *   GET /api/cron/streaming-keeper
 *   Authorization: Bearer <CRON_SECRET>
 *
 * For every streaming board the factory knows about it calls claimTop wherever the live #1
 * (getTopMarkees[0]) has drifted from the enforced topMarkee (a decay/decrease/liquidation the
 * inflow callbacks can't auto-heal). claimTop is permissionless and money-safe, so the signer is a
 * throwaway gas-funded hot wallet. RevNet settlement runs separately in /api/cron/streaming-settle.
 *
 * Auth, signer, and the shared nonce lock live in lib/server/keeperRoute.
 * Inert unless NEXT_PUBLIC_STREAMING_FACTORY is set (STREAMING_ENABLED).
 */

import { NextRequest } from 'next/server'
import type { Address } from 'viem'
import { runKeeper } from '@/lib/streaming/keeper'
import { STREAMING_FACTORY } from '@/lib/contracts/addresses'
import { handleKeeperRoute } from '@/lib/server/keeperRoute'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function handle(req: NextRequest) {
  return handleKeeperRoute(req, {
    name: 'streaming-keeper',
    maxDuration,
    run: ({ publicClient, walletClient }) => runKeeper({
      publicClient,
      walletClient,
      factory: STREAMING_FACTORY as Address,
      log: (m) => console.log('[streaming-keeper]', m),
    }),
  })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
