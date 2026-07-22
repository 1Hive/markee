/**
 * Streaming keeper — heals on-chain ranking lag and flushes RevNet settlement.
 *
 * Vercel cron calls it on a schedule (a periodic poll, not an event trigger: the decay/decrease
 * that staled the title fires no tx and no event), sending the platform's cron secret:
 *
 *   GET /api/cron/streaming-keeper
 *   Authorization: Bearer <CRON_SECRET>
 *
 * For each streaming board the factory knows about it calls claimTop when the live #1
 * (getTopMarkees[0]) has drifted from the enforced topMarkee (a decay/decrease the inflow
 * callbacks can't auto-heal), and settle() to flush each backer's accrued RevNet share. Both
 * are permissionless and money-safe, so the signer is a throwaway gas-funded hot wallet.
 *
 * KEEPER_PRIVATE_KEY (hot wallet) is the only var this route owns; auth, RPC and the log-scan
 * start reuse CRON_SECRET, NEXT_PUBLIC_BASE_RPC_URL/ALCHEMY_BASE_URL and STREAMING_FROM_BLOCK.
 * Inert unless NEXT_PUBLIC_STREAMING_FACTORY is set (STREAMING_ENABLED).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { runKeeper } from '@/lib/streaming/keeper'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// One signer, one nonce sequence: overlapping runs would collide.
const LOCK_KEY = 'streaming:keeper:lock'
const LOCK_TTL = maxDuration + 30

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer === secret || req.headers.get('x-keeper-secret') === secret
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!STREAMING_ENABLED) {
    return NextResponse.json({ ok: true, skipped: 'streaming disabled' })
  }

  // The factory lives on whatever chain NEXT_PUBLIC_BASE_RPC_URL points at (the same RPC the client
  // streaming hooks read), so prefer it and fall back to Alchemy.
  const rpc = process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL
  if (!rpc) return NextResponse.json({ error: 'no rpc configured' }, { status: 500 })

  const key = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const publicClient = createPublicClient({ chain: base, transport: http(rpc) })
  let walletClient: ReturnType<typeof createWalletClient> | undefined
  let account: Address | undefined

  if (!dryRun) {
    if (!key) return NextResponse.json({ error: 'no signer configured' }, { status: 500 })
    const signer = privateKeyToAccount(key)
    account = signer.address
    walletClient = createWalletClient({ account: signer, chain: base, transport: http(rpc) })
  }

  const locked = dryRun || await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: LOCK_TTL }) === 'OK'
  if (!locked) return NextResponse.json({ ok: true, skipped: 'previous run still in flight' })

  try {
    const report = await runKeeper({
      publicClient,
      walletClient,
      account,
      factory: STREAMING_FACTORY as Address,
      log: (m) => console.log('[streaming-keeper]', m),
    })
    return NextResponse.json({ ok: true, dryRun, ...report })
  } catch (e) {
    const detail = e instanceof Error ? e.message.split('\n')[0] : String(e)
    console.error('[streaming-keeper] run failed:', detail)
    return NextResponse.json({ error: detail }, { status: 500 })
  } finally {
    if (!dryRun) await kv.del(LOCK_KEY)
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
