// app/api/admin/migrate-oi-creators/route.ts
//
// One-time KV fix: OI v1.3 leaderboards created by migration scripts have
// creator:oi:{address} pointing to the migration EOA instead of the beneficiary.
// This endpoint reads all addresses from the v1.3 OI factory, fetches each
// contract's beneficiaryAddress() on-chain, and overwrites the KV entries.
//
// Usage (run once after deploy):
//   curl -X POST -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/migrate-oi-creators

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const OI_V13_FACTORY = '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c' as const

const FACTORY_ABI = [
  {
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    name: 'getLeaderboards',
    outputs: [{ name: 'result', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const LEADERBOARD_ABI = [
  {
    inputs: [],
    name: 'beneficiaryAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org'),
  })

  const addresses = await client.readContract({
    address: OI_V13_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getLeaderboards',
    args: [0n, 1000n],
  }) as `0x${string}`[]

  if (!addresses.length) {
    return NextResponse.json({ ok: true, updated: 0, failed: 0, total: 0 })
  }

  // Fetch all beneficiary addresses in batches of 50
  const CHUNK = 50
  const beneficiaries: (string | null)[] = []
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK)
    const results = await client.multicall({
      contracts: chunk.map(addr => ({
        address: addr,
        abi: LEADERBOARD_ABI,
        functionName: 'beneficiaryAddress' as const,
      })),
    })
    for (const r of results) {
      beneficiaries.push(r.status === 'success' ? (r.result as string).toLowerCase() : null)
    }
  }

  let updated = 0
  let failed = 0
  await Promise.all(addresses.map((addr, i) => {
    const b = beneficiaries[i]
    if (!b) { failed++; return null }
    updated++
    return kv.set(`creator:oi:${addr.toLowerCase()}`, b)
  }).filter(Boolean))

  return NextResponse.json({ ok: true, updated, failed, total: addresses.length })
}
