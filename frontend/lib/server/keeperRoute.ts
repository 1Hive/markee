import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { logger } from '@/lib/server/logger'

// Every route signing with KEEPER_PRIVATE_KEY shares one nonce sequence, so they share one lock.
const LOCK_KEY = 'streaming:keeper:lock'
// Multicall reads span every board; give a slow RPC more than viem's 10s default.
const RPC_TIMEOUT_MS = 60_000

export interface KeeperClients {
  publicClient: PublicClient
  // Undefined on a dry run.
  walletClient?: WalletClient
  dryRun: boolean
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return bearer === secret || req.headers.get('x-keeper-secret') === secret
}

export async function handleKeeperRoute(
  req: NextRequest,
  opts: { name: string; maxDuration: number; run(clients: KeeperClients): Promise<object> },
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!STREAMING_ENABLED) {
    return NextResponse.json({ ok: true, skipped: 'streaming disabled' })
  }

  const rpc = process.env.ALCHEMY_BASE_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL
  if (!rpc) return NextResponse.json({ error: 'no rpc configured' }, { status: 500 })

  const key = process.env.KEEPER_PRIVATE_KEY
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const publicClient = createPublicClient({ chain: base, transport: http(rpc, { timeout: RPC_TIMEOUT_MS }) }) as PublicClient
  let walletClient: WalletClient | undefined

  if (!dryRun) {
    if (!key) return NextResponse.json({ error: 'no signer configured' }, { status: 500 })
    // Checked here rather than left to privateKeyToAccount: its throw carries the key material into
    // the error path, and every response out of this route is machine-read by the cron.
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      return NextResponse.json({ error: 'malformed signer configured' }, { status: 500 })
    }
    const signer = privateKeyToAccount(key as `0x${string}`)
    walletClient = createWalletClient({ account: signer, chain: base, transport: http(rpc, { timeout: RPC_TIMEOUT_MS }) })
  }

  const canProceed = dryRun || await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: opts.maxDuration + 30 }) === 'OK'
  if (!canProceed) return NextResponse.json({ ok: true, skipped: 'previous run still in flight' })

  try {
    const report = await opts.run({ publicClient, walletClient, dryRun })
    return NextResponse.json({ ok: true, dryRun, ...report })
  } catch (e) {
    // Full detail goes to the function logs only: viem errors embed the RPC URL (API key included)
    // and revert data, which don't belong in a response that dashboards may capture.
    await logger.error(`${opts.name} run failed`, e, { dryRun })
    return NextResponse.json({ error: `${opts.name} run failed, see function logs` }, { status: 500 })
  } finally {
    if (!dryRun) await kv.del(LOCK_KEY)
  }
}
