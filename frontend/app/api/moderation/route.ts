/**
 * Moderation API Route
 * 
 * GET  /api/moderation          → Returns all flagged markee keys
 * POST /api/moderation          → Flag or unflag a markee (global admin, or that markee's
 *                                  board's on-chain admin/creator -- see isAuthorized below)
 * 
 * Markee keys use the format: `{chainId}:{markeeId}` to support multi-chain.
 * 
 * Storage: Vercel KV (Upstash Redis) using a single Set for O(1) lookups.
 * 
 How to add to your site:
 *   - Drop this file into your app/api/moderation/route.ts
 *   - Ensure @vercel/kv is installed and KV_REST_API_URL + KV_REST_API_TOKEN are set
 *   - Update ADMIN_ADDRESSES in lib/moderation/config.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { verifyMessage, createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { ADMIN_ADDRESSES } from '@/lib/moderation/config'

const KV_KEY = 'moderation:flagged'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Every Markee contract (any strategy) stores the board that created it and exposes it here --
// lets us independently derive "which board does this markeeId actually belong to" from the
// markeeId alone, rather than trusting a client-supplied board address (which would otherwise let
// anyone pair an arbitrary markeeId with a board they themselves created to flag any message).
const PRICING_STRATEGY_ABI = [
  { inputs: [], name: 'pricingStrategy', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const
// Same selector on every board contract (LeaderboardV11ABI and StreamingLeaderboardABI both expose
// this), so one minimal fragment covers fixed and streaming boards alike.
const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

// ── Helpers ──────────────────────────────────────────────────────────

function isGlobalAdmin(address: string | null): boolean {
  if (!address) return false
  return ADMIN_ADDRESSES.some(
    (admin) => admin.toLowerCase() === address.toLowerCase()
  )
}

// Global admins can moderate anything. On top of that, a leaderboard's own on-chain admin() and its
// KV-cached creator (see lib/leaderboards/resolveCreators.ts -- permanent, keyed by platform prefix
// since it isn't known in advance which platform a given board belongs to) can moderate messages on
// their own board. Both on-chain reads and the KV lookup are independently derived from markeeId
// here, never trusted from the caller.
async function isAuthorized(adminAddress: string, markeeId: string): Promise<boolean> {
  if (isGlobalAdmin(adminAddress)) return true
  try {
    const client = getClient()
    const board = await client.readContract({
      address: markeeId as `0x${string}`, abi: PRICING_STRATEGY_ABI, functionName: 'pricingStrategy',
    })
    if (!board || board === ZERO_ADDRESS) return false
    const onChainAdmin = await client.readContract({
      address: board as `0x${string}`, abi: ADMIN_ABI, functionName: 'admin',
    })
    if (typeof onChainAdmin === 'string' && onChainAdmin.toLowerCase() === adminAddress.toLowerCase()) return true
    const boardLower = (board as string).toLowerCase()
    const creators = await kv.mget<(string | null)[]>(
      `creator:sf:${boardLower}`, `creator:gh:${boardLower}`, `creator:oi:${boardLower}`, `creator:fs:${boardLower}`,
    )
    return creators.some(c => c?.toLowerCase() === adminAddress.toLowerCase())
  } catch (err) {
    console.error('[moderation] authorization lookup error:', err)
    return false
  }
}

function markeeKey(chainId: number | string, markeeId: string): string {
  return `${chainId}:${markeeId}`
}

// ── GET: list all flagged keys ───────────────────────────────────────

export async function GET() {
  try {
    const flagged = await kv.smembers(KV_KEY)
    return NextResponse.json({ flagged: flagged ?? [] })
  } catch (error) {
    console.error('[moderation] GET error:', error)
    return NextResponse.json({ flagged: [] })
  }
}

// ── POST: flag or unflag ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { markeeId, chainId, action, adminAddress, signature, timestamp } = body as {
      markeeId: string
      chainId: number | string
      action: 'flag' | 'unflag'
      adminAddress: string
      signature: `0x${string}`
      timestamp: number
    }

    // Validate required fields
    if (!markeeId || !chainId || !action || !adminAddress || !signature || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Reject signatures older than 5 minutes
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }

    // Verify the caller actually controls the wallet they claim
    const message = `markee-moderation:${action}:${chainId}:${markeeId}:${timestamp}`
    const valid = await verifyMessage({ address: adminAddress as `0x${string}`, message, signature })
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    if (!(await isAuthorized(adminAddress, markeeId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const key = markeeKey(chainId, markeeId)

    if (action === 'flag') {
      await kv.sadd(KV_KEY, key)
    } else if (action === 'unflag') {
      await kv.srem(KV_KEY, key)
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "flag" or "unflag".' },
        { status: 400 }
      )
    }

    // Return updated list
    const flagged = await kv.smembers(KV_KEY)
    return NextResponse.json({ success: true, action, key, flagged: flagged ?? [] })
  } catch (error) {
    console.error('[moderation] POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
