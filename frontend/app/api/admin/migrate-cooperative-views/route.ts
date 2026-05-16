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

// v0.1 TopDawg Cooperative strategy (old markee contracts)
const OLD_COOPERATIVE = '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a' as `0x${string}`
// v1.3 Cooperative leaderboard (new markee contracts)
const NEW_COOPERATIVE = '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}`

const OLD_STRATEGY_ABI = [
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getMarkees',
    outputs: [{ name: 'result', type: 'address[]' }],
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

  const client = getClient()

  // 1. Fetch all markee addresses from both contracts
  const [oldMarkees, newTopResult] = await Promise.all([
    client.readContract({
      address: OLD_COOPERATIVE,
      abi: OLD_STRATEGY_ABI,
      functionName: 'getMarkees',
      args: [0n, 1000n],
    }) as Promise<`0x${string}`[]>,
    client.readContract({
      address: NEW_COOPERATIVE,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [1000n],
    }) as Promise<readonly [`0x${string}`[], bigint[]]>,
  ])

  const newMarkees = newTopResult[0] as `0x${string}`[]

  // 2. Multicall owner() on all markees from both contracts
  const ownerCalls = [
    ...oldMarkees.map(addr => ({ address: addr, abi: MARKEE_ABI, functionName: 'owner' as const })),
    ...newMarkees.map(addr => ({ address: addr, abi: MARKEE_ABI, functionName: 'owner' as const })),
  ]

  const ownerResults = await chunkedMulticall(client, ownerCalls as Parameters<typeof client.multicall>[0]['contracts'])

  // 3. Build owner → address maps
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

  // 4. For each matched owner, copy views:total if old has data and new is empty
  let copied = 0
  let skipped = 0
  let noNewMarkee = 0
  let noOldViews = 0
  const details: Record<string, string> = {}

  for (const [owner, oldAddr] of ownerToOld) {
    const newAddr = ownerToNew.get(owner)
    if (!newAddr) {
      noNewMarkee++
      continue
    }

    const oldKey = `views:total:${oldAddr}`
    const newKey = `views:total:${newAddr}`
    const [oldViews, newViews] = await Promise.all([
      kv.get<number>(oldKey),
      kv.get<number>(newKey),
    ])

    if (!oldViews) {
      noOldViews++
      continue
    }

    if (newViews) {
      skipped++
      details[owner] = `skipped — ${newAddr} already has ${newViews}`
      continue
    }

    await kv.set(newKey, oldViews)
    copied++
    details[owner] = `copied ${oldViews} → ${newAddr}`
  }

  return NextResponse.json({
    ok: true,
    copied,
    skipped,
    noNewMarkee,
    noOldViews,
    oldMarkeeCount: oldMarkees.length,
    newMarkeeCount: newMarkees.length,
    details,
  })
}
