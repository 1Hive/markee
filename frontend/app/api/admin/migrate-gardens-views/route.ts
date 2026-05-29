// app/api/admin/migrate-gardens-views/route.ts
//
// Migrates per-markee view counts (views:total + views:msg) from the
// v1.0 TopDawg Gardens strategy to the v1.3 Gardens leaderboard.
//
// Old markee addresses were found by scanning MarkeeCreated events from:
//   0x346419315740F085Ba14cA7239D82105a9a2BDBE (Gardens v1.0 TopDawg strategy)
//
// Old→new pairs are matched by owner(). Additive (INCRBY).
//
// Usage:
//   curl -L -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/migrate-gardens-views
//
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

// Old markee addresses from Gardens v1.0 TopDawg strategy (MarkeeCreated event scan)
const OLD_MARKEES: `0x${string}`[] = [
  '0xec5bcf4c83e57f58e00829e63707522453f7580f',
  '0x40137b1ed3e80749dbc452f97d7c17aece8cfb15',
  '0xaef0b09c9f426b7af010eaa41a6d841ebc8b5c5c',
  '0xf2ee77d4b60b4bde7ffc794d7d3b5a35fb51236a',
  '0x5454379837f52b857ab7045579d82ebcf0426f4f',
  '0xd68d0cb0c68719a1546d05bf7c76d4c14154c79e',
  '0x14f0908d12e8766a69da00792575926e9da3a7f7',
]

const GARDENS_V13 = '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' as `0x${string}`

function hashMessage(message: string): string {
  return createHash('md5').update(message.trim().toLowerCase()).digest('hex').slice(0, 8)
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get new markees from v1.3 Gardens leaderboard
  const newResult = await client.readContract({
    address: GARDENS_V13,
    abi: LEADERBOARD_ABI,
    functionName: 'getTopMarkees',
    args: [BigInt(50)],
  })
  const newAddrs = (newResult[0] as string[]).map(a => a.toLowerCase()) as `0x${string}`[]

  // Multicall: owner + message from old markees, owner from new markees
  const [oldResults, newOwnerResults] = await Promise.all([
    client.multicall({
      contracts: OLD_MARKEES.flatMap(addr => [
        { address: addr, abi: MARKEE_ABI, functionName: 'owner' as const },
        { address: addr, abi: MARKEE_ABI, functionName: 'message' as const },
      ]),
      allowFailure: true,
    }),
    client.multicall({
      contracts: newAddrs.map(addr => ({
        address: addr, abi: MARKEE_ABI, functionName: 'owner' as const,
      })),
      allowFailure: true,
    }),
  ])

  // Build owner → new markee address map
  const ownerToNew = new Map<string, string>()
  for (let i = 0; i < newAddrs.length; i++) {
    const r = newOwnerResults[i]
    if (r.status === 'success' && r.result) {
      ownerToNew.set((r.result as string).toLowerCase(), newAddrs[i].toLowerCase())
    }
  }

  const results: Record<string, { oldAddr: string; newAddr: string | null; copied: string[]; skipped: string[] }> = {}

  await Promise.all(OLD_MARKEES.map(async (oldAddr, i) => {
    const lowerOld = oldAddr.toLowerCase()
    const ownerResult = oldResults[i * 2]
    const msgResult = oldResults[i * 2 + 1]
    const entry = { oldAddr: lowerOld, newAddr: null as string | null, copied: [] as string[], skipped: [] as string[] }
    results[lowerOld] = entry

    if (ownerResult.status !== 'success' || !ownerResult.result) {
      entry.skipped.push('could not read owner()')
      return
    }
    const owner = (ownerResult.result as string).toLowerCase()
    const newAddr = ownerToNew.get(owner)
    if (!newAddr) {
      entry.skipped.push(`no matching new markee for owner ${owner}`)
      return
    }
    entry.newAddr = newAddr

    // Migrate views:total
    const oldTotal = await kv.get<number>(`views:total:${lowerOld}`)
    if (!oldTotal) {
      entry.skipped.push('views:total (no source data)')
    } else {
      const added = await kv.incrby(`views:total:${newAddr}`, oldTotal)
      entry.copied.push(`views:total (+${oldTotal} → now ${added})`)
    }

    // Migrate views:msg
    if (msgResult.status !== 'success' || !msgResult.result) {
      entry.skipped.push('views:msg (could not read message)')
      return
    }
    const msgHash = hashMessage(msgResult.result as string)
    const oldMsgViews = await kv.get<number>(`views:msg:${lowerOld}:${msgHash}`)
    if (!oldMsgViews) {
      entry.skipped.push(`views:msg:${msgHash} (no source data)`)
    } else {
      const added = await kv.incrby(`views:msg:${newAddr}:${msgHash}`, oldMsgViews)
      entry.copied.push(`views:msg:${msgHash} (+${oldMsgViews} → now ${added})`)
    }
  }))

  return NextResponse.json({ ok: true, results })
}
