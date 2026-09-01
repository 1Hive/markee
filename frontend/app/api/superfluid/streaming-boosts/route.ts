import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { recoverMessageAddress } from 'viem'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { StreamingLeaderboardFactoryABI } from '@/lib/contracts/abis'
import { createStreamingClient } from '@/lib/streaming/client'
import {
  activeBoostsAt,
  boostHistoryKey,
  getStreamingCampaignConfig,
  type BoostConfigVersion,
} from '@/lib/superfluid/streamingCampaign'

export const dynamic = 'force-dynamic'

const ADMIN_ADDRESSES = new Set([
  '0x809c9f8dd8ca93a41c3adca4972fa234c28f7714',
  '0xaf4401e765dff079ab6021bbb8d46e53e27613db',
])

async function readContext() {
  if (!STREAMING_ENABLED) throw new Error('Streaming factory is not configured')
  const campaign = getStreamingCampaignConfig()
  const client = createStreamingClient()
  const [head, boards, history] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({
      address: STREAMING_FACTORY as `0x${string}`,
      abi: StreamingLeaderboardFactoryABI,
      functionName: 'getLeaderboards',
      args: [0n, 1000n],
    }) as Promise<readonly string[]>,
    kv.get<BoostConfigVersion[]>(boostHistoryKey(campaign.id)),
  ])
  return {
    campaign,
    client,
    head,
    boards: new Set(boards.map((board) => board.toLowerCase())),
    history: history ?? [],
  }
}

export async function GET() {
  try {
    const { campaign, head, history } = await readContext()
    return NextResponse.json({
      campaignId: campaign.id,
      multipliers: activeBoostsAt(history, Number(head)),
      history,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load boost configuration' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action?: 'set' | 'remove'
      leaderboardAddress?: string
      multiplier?: number
      adminAddress?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const { action, leaderboardAddress, adminAddress, signature } = body
    const timestamp = Number(body.timestamp)
    const multiplier = action === 'remove' ? 0 : Number(body.multiplier)
    if (action !== 'set' && action !== 'remove') {
      return NextResponse.json({ error: 'action must be set or remove' }, { status: 400 })
    }
    if (!leaderboardAddress || !/^0x[0-9a-fA-F]{40}$/.test(leaderboardAddress)) {
      return NextResponse.json({ error: 'Invalid leaderboard address' }, { status: 400 })
    }
    if (!adminAddress || !/^0x[0-9a-fA-F]{40}$/.test(adminAddress) || !signature) {
      return NextResponse.json({ error: 'Invalid admin authorization' }, { status: 400 })
    }
    if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    }
    if (action === 'set' && (!Number.isSafeInteger(multiplier) || multiplier < 2)) {
      return NextResponse.json({ error: 'Boost multiplier must be an integer of at least 2' }, { status: 400 })
    }

    const context = await readContext()
    const board = leaderboardAddress.toLowerCase()
    const admin = adminAddress.toLowerCase()
    if (!context.boards.has(board)) {
      return NextResponse.json({ error: 'Leaderboard is not registered by the streaming factory' }, { status: 400 })
    }
    if (!ADMIN_ADDRESSES.has(admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const message = `markee-streaming-boost:${context.campaign.id}:${action}:8453:${board}:${multiplier}:${timestamp}`
    const recovered = await recoverMessageAddress({ message, signature })
    if (recovered.toLowerCase() !== admin) {
      return NextResponse.json({ error: 'Signature mismatch' }, { status: 401 })
    }

    const effectiveBlock = Number(context.head + 1n)
    const current = activeBoostsAt(context.history, Number(context.head))
    const multipliers = { ...current }
    if (action === 'remove') delete multipliers[board]
    else multipliers[board] = multiplier
    const version: BoostConfigVersion = {
      effectiveBlock,
      multipliers,
      updatedAt: timestamp,
      updatedBy: admin,
    }
    const history = [...context.history, version]
    await kv.set(boostHistoryKey(context.campaign.id), history)

    return NextResponse.json({ success: true, effectiveBlock, multipliers, history })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update boost configuration' },
      { status: 500 },
    )
  }
}
