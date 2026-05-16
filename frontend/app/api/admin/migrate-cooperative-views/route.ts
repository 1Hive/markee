// app/api/admin/migrate-cooperative-views/route.ts
//
// One-time KV migration: copies views:total:{old_markee} to views:total:{new_markee}
// for all markees that moved from the v0.1 TopDawg Cooperative to the v1.3 Cooperative.
// Matching is by owner() — both old and new markee contracts belong to the same wallet.
//
// Old markee addresses come from MarkeeCreated event logs (contract view functions revert
// because some underlying markee contracts are no longer callable).
//
// Usage:
//   curl -X POST -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/migrate-cooperative-views
//
// Safe to re-run — only writes if old has views and new is empty.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// v0.1 TopDawg Cooperative strategy (old markee contracts)
const OLD_COOPERATIVE = '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a' as `0x${string}`
// v1.3 Cooperative leaderboard (new markee contracts)
const NEW_COOPERATIVE = '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}`

// Old strategy ABI — reads the markees[] array length and individual entries
// (getMarkees/getTopMarkees revert because some underlying markee contracts are broken;
//  markeeCount + markees(index) are simpler and don't call external contracts)
const OLD_STRATEGY_ABI = [
  {
    inputs: [],
    name: 'markeeCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'markees',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const LEADERBOARD_ABI = [
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org', {
      fetchOptions: { cache: 'no-store' },
    }),
  })
}

const CHUNK_SIZE = 50
async function chunkedMulticall(client: ReturnType<typeof getClient>, contracts: Parameters<typeof client.multicall>[0]['contracts']) {
  const results = []
  for (let i = 0; i < contracts.length; i += CHUNK_SIZE) {
    const chunk = contracts.slice(i, i + CHUNK_SIZE) as Parameters<typeof client.multicall>[0]['contracts']
    const chunkResults = await client.multicall({ contracts: chunk })
    results.push(...chunkResults)
  }
  return results
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = getClient()

    // 1. Read all old markee addresses from the public markees[] array.
    //    getMarkees/getTopMarkees revert on this contract; markeeCount() + markees(index)
    //    are simpler view functions that don't call external contracts so they succeed.
    const count = await client.readContract({
      address: OLD_COOPERATIVE,
      abi: OLD_STRATEGY_ABI,
      functionName: 'markeeCount',
    }) as bigint

    const indexCalls = Array.from({ length: Number(count) }, (_, i) => ({
      address: OLD_COOPERATIVE,
      abi: OLD_STRATEGY_ABI,
      functionName: 'markees' as const,
      args: [BigInt(i)] as [bigint],
    }))
    const indexResults = await chunkedMulticall(client, indexCalls as Parameters<typeof client.multicall>[0]['contracts'])
    const oldMarkees = indexResults
      .map(r => r?.result as `0x${string}` | undefined)
      .filter((a): a is `0x${string}` => !!a)

    // 2. Get new markees from v1.3 Cooperative
    const newTopResult = await client.readContract({
      address: NEW_COOPERATIVE,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [1000n],
    }) as readonly [`0x${string}`[], bigint[]]

    const newMarkees = newTopResult[0] as `0x${string}`[]

    // 3. Multicall owner() on both old and new markees
    const ownerCalls = [
      ...oldMarkees.map(addr => ({ address: addr, abi: MARKEE_ABI, functionName: 'owner' as const })),
      ...newMarkees.map(addr => ({ address: addr, abi: MARKEE_ABI, functionName: 'owner' as const })),
    ]
    const ownerResults = await chunkedMulticall(client, ownerCalls as Parameters<typeof client.multicall>[0]['contracts'])

    const ownerToOld = new Map<string, string>()
    for (let i = 0; i < oldMarkees.length; i++) {
      const owner = ownerResults[i]?.result as string | undefined
      if (owner) ownerToOld.set(owner.toLowerCase(), oldMarkees[i].toLowerCase())
    }

    const ownerToNew = new Map<string, string>()
    for (let i = 0; i < newMarkees.length; i++) {
      const owner = ownerResults[oldMarkees.length + i]?.result as string | undefined
      if (owner) ownerToNew.set(owner.toLowerCase(), newMarkees[i].toLowerCase())
    }

    // 4. Build matched pairs, then batch-fetch all KV values in one mget
    type Pair = { owner: string; oldAddr: string; newAddr: string }
    const matched: Pair[] = []
    let noNewMarkee = 0

    for (const [owner, oldAddr] of ownerToOld) {
      const newAddr = ownerToNew.get(owner)
      if (!newAddr) { noNewMarkee++; continue }
      matched.push({ owner, oldAddr, newAddr })
    }

    const kvKeys = matched.flatMap(p => [`views:total:${p.oldAddr}`, `views:total:${p.newAddr}`])
    const kvValues = kvKeys.length > 0 ? await kv.mget<(number | null)[]>(...kvKeys) : []

    let copied = 0
    let skipped = 0
    let noOldViews = 0
    const details: Record<string, string> = {}

    const writes: Promise<unknown>[] = []
    for (let i = 0; i < matched.length; i++) {
      const { owner, oldAddr, newAddr } = matched[i]
      const oldViews = kvValues[i * 2] ?? null
      const newViews = kvValues[i * 2 + 1] ?? null

      if (!oldViews) { noOldViews++; continue }
      if (newViews) {
        skipped++
        details[owner] = `skipped — ${newAddr} already has ${newViews}`
        continue
      }

      writes.push(kv.set(`views:total:${newAddr}`, oldViews))
      copied++
      details[owner] = `copied ${oldViews} → ${newAddr}`
    }
    await Promise.all(writes)

    return NextResponse.json({
      ok: true,
      copied,
      skipped,
      noNewMarkee,
      noOldViews,
      oldMarkeeCount: oldMarkees.length,
      newMarkeeCount: newMarkees.length,
      matchedCount: matched.length,
      details,
    })
  } catch (err: any) {
    console.error('[migrate-cooperative-views] error:', err)
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
