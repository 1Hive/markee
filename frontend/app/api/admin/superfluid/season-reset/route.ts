/**
 * GET /api/admin/superfluid/season-reset
 *
 * Snapshots each leaderboard's current topFundsAddedRaw as a Season 6 baseline.
 * The leaderboards API subtracts these baselines from displayed values, making
 * all signs appear to start at 0 ETH for the new season.
 *
 * The Superfluid DAO leaderboard (SF_MIGRATION_LEADERBOARD) is excluded —
 * its historical funds carry over.
 *
 * Also resets the cron's block pointer so S6 points accumulation starts fresh.
 *
 * Usage:
 *   curl -H "x-admin-secret: $ADMIN_SECRET" https://markee.xyz/api/admin/superfluid/season-reset
 *
 * Safe to run once. Re-running overwrites baselines with current values.
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPERFLUID_FACTORY = '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as `0x${string}`
const SF_MIGRATION_LEADERBOARD = '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79'.toLowerCase()

const BASELINE_PREFIX = 'superfluid:s6:baseline:'
const KV_RPC_LAST_BLOCK = 'superfluid:cron:rpcLastBlock'
const KV_SF_MIG_LAST_BLOCK = 'superfluid:cron:sfMigLastBlock'
const CACHE_KEY = 'cache:superfluid:leaderboards'

const FACTORY_ABI = [{
  inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
  name: 'getLeaderboards',
  outputs: [{ name: 'result', type: 'address[]' }],
  stateMutability: 'view',
  type: 'function',
}] as const

const LEADERBOARD_ABI = [{
  inputs: [{ name: 'limit', type: 'uint256' }],
  name: 'getTopMarkees',
  outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
  stateMutability: 'view',
  type: 'function',
}] as const

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-admin-secret')
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org'),
  })

  const addresses = await client.readContract({
    address: SUPERFLUID_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getLeaderboards',
    args: [0n, 1000n],
  }) as `0x${string}`[]

  const toSnapshot = addresses.filter(a => a.toLowerCase() !== SF_MIGRATION_LEADERBOARD)

  // Multicall getTopMarkees(1) for each leaderboard
  const calls = toSnapshot.map(addr => ({
    address: addr,
    abi: LEADERBOARD_ABI,
    functionName: 'getTopMarkees' as const,
    args: [1n] as const,
  }))

  const CHUNK = 50
  const results: any[] = []
  for (let i = 0; i < calls.length; i += CHUNK) {
    const chunk = calls.slice(i, i + CHUNK)
    const res = await client.multicall({ contracts: chunk, allowFailure: true })
    results.push(...res)
  }

  const snapshotResults: Record<string, { topFundsRaw: string; topFundsEth: string }> = {}
  const kvPairs: [string, string][] = []

  for (let i = 0; i < toSnapshot.length; i++) {
    const addr = toSnapshot[i].toLowerCase()
    const result = results[i]
    const topFunds = result?.status === 'success'
      ? ((result.result as [string[], bigint[]])?.[1]?.[0] ?? 0n)
      : 0n
    const topFundsStr = topFunds.toString()
    snapshotResults[addr] = { topFundsRaw: topFundsStr, topFundsEth: formatEther(topFunds) }
    kvPairs.push([`${BASELINE_PREFIX}${addr}`, topFundsStr])
  }

  // Write all baselines in parallel
  await Promise.all(kvPairs.map(([key, value]) => kv.set(key, value)))

  // Reset cron block pointers to latest block so S6 starts fresh
  const latestBlock = await client.getBlockNumber()
  await Promise.all([
    kv.set(KV_RPC_LAST_BLOCK, latestBlock.toString()),
    kv.set(KV_SF_MIG_LAST_BLOCK, latestBlock.toString()),
    kv.del(CACHE_KEY),
  ])

  return NextResponse.json({
    ok: true,
    snapshotted: toSnapshot.length,
    excluded: [SF_MIGRATION_LEADERBOARD],
    seasonStartBlock: latestBlock.toString(),
    baselines: snapshotResults,
  })
}
