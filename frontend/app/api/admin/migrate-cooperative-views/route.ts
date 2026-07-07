// app/api/admin/migrate-cooperative-views/route.ts
//
// One-time KV migration: copies views:total:{old_markee} to views:total:{new_markee}
// for all markees that moved from the v0.1 TopDawg Cooperative to the v1.3 Cooperative.
// Matching is by owner() — both old and new markee contracts belong to the same wallet.
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

// v0.1 TopDawg Cooperative markee contracts (hardcoded — contract view functions revert)
const OLD_MARKEES: `0x${string}`[] = [
  '0xdbbb9b6a6a29815aba82ff61878da5e6bbd12c36',
  '0x456d35e37c3163dd661dd6ba044a6abee1b61dcc',
  '0xb28b3af1c153a06ee24f209e142778b84e085978',
  '0x517677cf68b2ec7dc311263755567fc1249f45c0',
  '0x3b6cd27bf95f33f61954b24c929e89d76656ef17',
  '0x19eb906febe8d3c2a90730ba483c5b60b2d0faa7',
  '0x94edcc8b6d905b53097e0dcdf30e64a1c1439102',
]

// v1.3 Cooperative leaderboard (new markee contracts)
const NEW_COOPERATIVE = '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}`

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

    // 1. Get new markees from v1.3 Cooperative
    const newTopResult = await client.readContract({
      address: NEW_COOPERATIVE,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [1000n],
    }) as readonly [`0x${string}`[], bigint[]]

    const newMarkees = newTopResult[0] as `0x${string}`[]

    // 2. Multicall owner() on both old and new markees
    const ownerCalls = [
      ...OLD_MARKEES.map(addr => ({ address: addr, abi: MARKEE_ABI, functionName: 'owner' as const })),
      ...newMarkees.map(addr => ({ address: addr, abi: MARKEE_ABI, functionName: 'owner' as const })),
    ]
    const ownerResults = await chunkedMulticall(client, ownerCalls as Parameters<typeof client.multicall>[0]['contracts'])

    const ownerToOld = new Map<string, string>()
    for (let i = 0; i < OLD_MARKEES.length; i++) {
      const owner = ownerResults[i]?.result as string | undefined
      if (owner) ownerToOld.set(owner.toLowerCase(), OLD_MARKEES[i].toLowerCase())
    }

    const ownerToNew = new Map<string, string>()
    for (let i = 0; i < newMarkees.length; i++) {
      const owner = ownerResults[OLD_MARKEES.length + i]?.result as string | undefined
      if (owner) ownerToNew.set(owner.toLowerCase(), newMarkees[i].toLowerCase())
    }

    // 3. Build matched pairs, then batch-fetch all KV values in one mget
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
      if ((newViews ?? 0) >= oldViews) {
        skipped++
        details[owner] = `skipped — ${newAddr} already has ${newViews} (≥ old ${oldViews})`
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
      oldMarkeeCount: OLD_MARKEES.length,
      newMarkeeCount: newMarkees.length,
      matchedCount: matched.length,
      details,
    })
  } catch (err: any) {
    console.error('[migrate-cooperative-views] error:', err)
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
