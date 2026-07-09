// app/api/admin/migrate-leaderboard-views/route.ts
//
// General-purpose per-markee view migration between two leaderboard versions.
// Matches old→new markees by position (same rank = same migrated markee).
// Validates the match with owner() before copying.
//
// Usage:
//   curl -L -H "x-admin-secret: $ADMIN_SECRET" \
//     "https://markee.xyz/api/admin/migrate-leaderboard-views?old=0x...&new=0x..."
//
// Copies views:total and views:msg (additive) for each matched pair.
// Safe to run once — do not re-run (INCRBY is not idempotent).

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

const LEADERBOARD_ABI = [{
  inputs: [{ name: 'limit', type: 'uint256' }],
  name: 'getTopMarkees',
  outputs: [
    { name: 'topAddresses', type: 'address[]' },
    { name: 'topFunds', type: 'uint256[]' },
  ],
  stateMutability: 'view',
  type: 'function',
}] as const

const MARKEE_ABI = [
  {
    inputs: [],
    name: 'message',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

function hashMessage(message: string): string {
  return createHash('md5').update(message.trim().toLowerCase()).digest('hex').slice(0, 8)
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const oldLeaderboard = searchParams.get('old')?.toLowerCase()
  const newLeaderboard = searchParams.get('new')?.toLowerCase()

  if (!oldLeaderboard || !newLeaderboard) {
    return NextResponse.json({ error: 'Required: ?old=0x...&new=0x...' }, { status: 400 })
  }

  // Fetch markee lists from both leaderboards
  const [oldResult, newResult] = await Promise.all([
    client.readContract({ address: oldLeaderboard as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees', args: [BigInt(50)] }),
    client.readContract({ address: newLeaderboard as `0x${string}`, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees', args: [BigInt(50)] }),
  ])

  const oldAddrs = (oldResult[0] as string[]).map(a => a.toLowerCase())
  const newAddrs = (newResult[0] as string[]).map(a => a.toLowerCase())
  const pairCount = Math.min(oldAddrs.length, newAddrs.length)

  // Batch-read owner + message from all old and new markees
  const oldCalls = oldAddrs.slice(0, pairCount).flatMap(addr => [
    { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'owner' as const },
    { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
  ])
  const newOwnerCalls = newAddrs.slice(0, pairCount).map(addr => ({
    address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'owner' as const,
  }))

  const [oldCallResults, newOwnerResults] = await Promise.all([
    client.multicall({ contracts: oldCalls, allowFailure: true }),
    client.multicall({ contracts: newOwnerCalls, allowFailure: true }),
  ])

  const results: Array<{
    position: number
    oldAddr: string
    newAddr: string
    ownerMatch: boolean
    copied: string[]
    skipped: string[]
    error?: string
  }> = []

  await Promise.all(Array.from({ length: pairCount }, async (_, i) => {
    const oldAddr = oldAddrs[i]
    const newAddr = newAddrs[i]
    const entry = { position: i + 1, oldAddr, newAddr, ownerMatch: false, copied: [] as string[], skipped: [] as string[] }
    results[i] = entry

    const oldOwner = oldCallResults[i * 2]
    const oldMsg = oldCallResults[i * 2 + 1]
    const newOwner = newOwnerResults[i]

    // Validate owner match
    if (oldOwner.status === 'success' && newOwner.status === 'success') {
      entry.ownerMatch = (oldOwner.result as string).toLowerCase() === (newOwner.result as string).toLowerCase()
      if (!entry.ownerMatch) {
        entry.skipped.push(`owner mismatch: ${oldOwner.result} vs ${newOwner.result}`)
        return
      }
    }

    // Migrate views:total
    const oldTotal = await kv.get<number>(`views:total:${oldAddr}`)
    if (!oldTotal) {
      entry.skipped.push('views:total (no source data)')
    } else {
      const added = await kv.incrby(`views:total:${newAddr}`, oldTotal)
      entry.copied.push(`views:total (+${oldTotal} → now ${added})`)
    }

    // Migrate views:msg
    if (oldMsg.status !== 'success' || !oldMsg.result) {
      entry.skipped.push('views:msg (could not read message)')
      return
    }
    const msgHash = hashMessage(oldMsg.result as string)
    const oldMsgViews = await kv.get<number>(`views:msg:${oldAddr}:${msgHash}`)
    if (!oldMsgViews) {
      entry.skipped.push(`views:msg:${msgHash} (no source data)`)
    } else {
      const added = await kv.incrby(`views:msg:${newAddr}:${msgHash}`, oldMsgViews)
      entry.copied.push(`views:msg:${msgHash} (+${oldMsgViews} → now ${added})`)
    }
  }))

  return NextResponse.json({ ok: true, oldLeaderboard, newLeaderboard, results })
}
