import { NextRequest, NextResponse } from 'next/server'
import { getStreamingBoardMeta, setStreamingBoardMeta } from '@/lib/streaming/boardMeta'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { StreamingLeaderboardFactoryABI } from '@/lib/contracts/abis'
import { createStreamingClient } from '@/lib/streaming/client'
import { verticalFromPlatform } from '@/lib/strategy'

export const dynamic = 'force-dynamic'

// Records the KV placement fallback for a board. The endpoint is unauthenticated, so it takes only an
// address and reads the placement off the factory: the caller cannot choose it. That stops an
// anonymous POST from reassigning someone else's board, and makes the write idempotent, since the only
// value it can ever store is what the chain already says.
export async function POST(request: NextRequest) {
  if (!STREAMING_ENABLED) {
    return NextResponse.json({ error: 'Streaming disabled' }, { status: 503 })
  }

  try {
    const body = await request.json().catch(() => null)
    const { address } = (body ?? {}) as { address?: string }

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address))
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })

    const client = createStreamingClient()
    const factory = STREAMING_FACTORY as `0x${string}`
    const board = address as `0x${string}`

    const [isBoard, platform] = await Promise.all([
      client.readContract({
        address: factory, abi: StreamingLeaderboardFactoryABI,
        functionName: 'isFactoryLeaderboard', args: [board],
      }) as Promise<boolean>,
      client.readContract({
        address: factory, abi: StreamingLeaderboardFactoryABI,
        functionName: 'boardPlatform', args: [board],
      }) as Promise<readonly [string, string]>,
    ])

    if (!isBoard) return NextResponse.json({ error: 'Not a streaming board' }, { status: 404 })

    const vertical = verticalFromPlatform(platform[0])
    // Boards created before on-chain tags existed keep the placement they were registered with: there
    // is no authoritative source for them here, so leave the record alone rather than guess.
    if (!vertical) return NextResponse.json({ error: 'Board carries no platform tag' }, { status: 409 })

    await setStreamingBoardMeta(address, { vertical })
    return NextResponse.json({ success: true, vertical })
  } catch (err) {
    console.error('[streaming/register] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get('address')
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address))
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  const meta = await getStreamingBoardMeta(address)
  return NextResponse.json({ meta })
}
