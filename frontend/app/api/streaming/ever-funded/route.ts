// app/api/streaming/ever-funded/route.ts
//
// Which of a streaming board's markees have ever actually been backed. createMarkee happens before
// the stream is opened (a separate approve + batchCall), so an abandoned or failed flow leaves a
// real markee contract on-chain with a real message but zero rate and zero history -- indistinguishable
// from a message whose stream is just current unfunded/never-had-a-bid by looking at current state
// alone. BackerUpdated is emitted every time a backer's flow rate to a markee changes, so a markee
// that has never appeared in one has genuinely never received a single payment; that's the signal
// used to drop dead-on-arrival markees from the leaderboard rather than showing them as "inactive".
// Ever-funded is monotonic (a markee can never become un-funded), so results accumulate in a
// permanent KV record with a scanned-to block checkpoint -- each cache miss only scans new blocks.

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, isAddress, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
const CACHE_TTL = 60 // seconds
const REORG_SAFETY_BLOCKS = 100n

const STREAM_BACKER_UPDATED = parseAbiItem(
  'event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)'
)

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org', { fetchOptions: { cache: 'no-store' } }),
  })
}

export async function GET(request: NextRequest) {
  const board = new URL(request.url).searchParams.get('board')?.toLowerCase().trim()
  if (!board || !isAddress(board)) {
    return NextResponse.json({ error: 'Valid board address is required' }, { status: 400, headers: NO_CACHE })
  }

  const cacheKey = `cache:streaming:ever-funded:${board}`
  const cached = await kv.get<{ markees: string[] }>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: NO_CACHE })

  const permanentKey = `streaming:everfunded:${board}`

  try {
    const client = getClient()
    const stored = await kv.get<{ markees: string[]; scannedTo: string }>(permanentKey)
    const fromBlock = stored ? BigInt(stored.scannedTo) + 1n : BASE_MARKEE_EVENTS_FROM_BLOCK
    const latestBlock = await client.getBlockNumber()

    const markeeSet = new Set(stored?.markees ?? [])
    if (latestBlock >= fromBlock) {
      const logs = await client.getLogs({
        address: board as `0x${string}`,
        event: STREAM_BACKER_UPDATED,
        fromBlock,
        toBlock: latestBlock,
      })
      for (const log of logs) {
        const markee = log.args.markee?.toLowerCase()
        if (markee) markeeSet.add(markee)
      }
      const scannedTo = latestBlock - REORG_SAFETY_BLOCKS
      if (!stored || scannedTo > BigInt(stored.scannedTo)) {
        await kv.set(permanentKey, { markees: [...markeeSet], scannedTo: scannedTo.toString() })
      }
    }

    const payload = { markees: [...markeeSet] }
    await kv.set(cacheKey, payload, { ex: CACHE_TTL })
    return NextResponse.json(payload, { headers: NO_CACHE })
  } catch (error) {
    console.error('[streaming/ever-funded] error:', error)
    return NextResponse.json({ error: 'Failed to load funding history' }, { status: 500, headers: NO_CACHE })
  }
}
