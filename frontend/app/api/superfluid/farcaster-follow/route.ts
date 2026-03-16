/**
 * POST /api/superfluid/farcaster-follow
 *
 * Verifies that the given wallet address has a Farcaster account that follows
 * Markee, then awards 1 point. Uses the follower's FID as uniqueId so:
 *   - Unfollowing and re-following never re-awards points
 *   - The Superfluid API's own dedup enforces this at the campaign level
 *
 * Requires:
 *   NEYNAR_API_KEY         — from https://neynar.com
 *   MARKEE_FARCASTER_FID   — Markee's Farcaster numeric FID (find at warpcast.com/markee)
 *
 * Body: { account: '0x...' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { pushEvent } from '@/lib/superfluid/points'

export const dynamic = 'force-dynamic'

const NEYNAR_BASE = 'https://api.neynar.com/v2/farcaster'

// ─── Neynar helpers ───────────────────────────────────────────────────────────

async function getFidForAddress(address: string): Promise<number | null> {
  const res = await fetch(
    `${NEYNAR_BASE}/user/bulk-by-address?addresses=${address.toLowerCase()}`,
    { headers: { 'x-api-key': process.env.NEYNAR_API_KEY! } }
  )
  if (!res.ok) return null

  const data = await res.json()
  // Response: { [address]: [{ fid, ... }] }
  const users = data[address.toLowerCase()]
  if (!users || users.length === 0) return null
  return users[0].fid as number
}

async function doesFidFollowMarkee(fid: number): Promise<boolean> {
  const markeeFid = process.env.MARKEE_FARCASTER_FID
  if (!markeeFid) throw new Error('MARKEE_FARCASTER_FID is not set')

  // Check if `fid` (potential follower) appears in Markee's followers
  const res = await fetch(
    `${NEYNAR_BASE}/followers?fid=${markeeFid}&viewer_fid=${fid}&limit=1`,
    { headers: { 'x-api-key': process.env.NEYNAR_API_KEY! } }
  )
  if (!res.ok) return false

  const data = await res.json()
  // If the viewer_fid follows, Neynar includes viewer_context.following = true
  // Alternatively: check if fid appears in the followers list
  const users: Array<{ fid: number }> = data?.users ?? []
  return users.some((u) => u.fid === fid)
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { account } = body

    if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) {
      return NextResponse.json({ message: 'Invalid or missing wallet address' }, { status: 400 })
    }

    if (!process.env.NEYNAR_API_KEY) {
      console.error('[farcaster-follow] NEYNAR_API_KEY is not set')
      return NextResponse.json({ message: 'Server configuration error' }, { status: 500 })
    }

    // ── Check KV cache first (avoid Neynar calls for already-claimed wallets) ─
    // Note: this is a belt-and-suspenders guard. The primary dedup is the
    // Superfluid API's uniqueId mechanism (FID as uniqueId).
    const kvKey = `superfluid:follow:${account.toLowerCase()}`
    const alreadyClaimed = await kv.get(kvKey).catch(() => null)
    if (alreadyClaimed) {
      return NextResponse.json({ success: true, message: 'Already claimed', alreadyClaimed: true })
    }

    // ── Look up FID for this wallet ───────────────────────────────────────────
    const fid = await getFidForAddress(account)
    if (!fid) {
      return NextResponse.json(
        { success: false, message: 'No Farcaster account found for this wallet address' },
        { status: 200 }
      )
    }

    // ── Verify they follow Markee ─────────────────────────────────────────────
    const isFollowing = await doesFidFollowMarkee(fid)
    if (!isFollowing) {
      return NextResponse.json(
        { success: false, message: 'This Farcaster account does not follow Markee' },
        { status: 200 }
      )
    }

    // ── Push the point event (1 point, FID as uniqueId) ───────────────────────
    const result = await pushEvent({
      event: 'FARCASTER_FOLLOW',
      account,
      points: 1,
      uniqueId: `fid:${fid}`, // FID-scoped uniqueId prevents re-award if they unfollow/refollow
    })

    if (!result.success) {
      console.error('[farcaster-follow] Push failed:', result.error)
      return NextResponse.json({ success: false, message: result.error }, { status: 200 })
    }

    // ── Cache in KV so repeat calls skip Neynar entirely ─────────────────────
    await kv.set(kvKey, fid, { ex: 60 * 60 * 24 * 365 }).catch(() => null) // 1 year TTL

    return NextResponse.json({
      success: true,
      points: 1,
      pushRequestId: result.pushRequestId,
    })
  } catch (e: any) {
    console.error('[farcaster-follow] Exception:', e)
    return NextResponse.json({ message: 'Internal error' }, { status: 500 })
  }
}
