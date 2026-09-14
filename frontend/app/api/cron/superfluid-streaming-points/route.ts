import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/server/logger'
import { kv } from '@vercel/kv'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { StreamingLeaderboardFactoryABI } from '@/lib/contracts/abis'
import { createStreamingClient } from '@/lib/streaming/client'
import { fetchCampaignSnapshot, fetchStreamingSubgraphHead } from '@/lib/streaming/subgraph'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import {
  FARCASTER_EVENT_NAME,
  STREAMING_EVENT_NAME,
  activeBoostsAt,
  addWeightedDeltas,
  boostHistoryKey,
  calculateNetDeltas,
  campaignStateKey,
  deserializeSnapshot,
  farcasterAwardKey,
  getStreamingCampaignConfig,
  pointTargets,
  pushCampaignEvents,
  serializeSnapshot,
  type BoostConfigVersion,
  type CampaignPointsEvent,
  type CampaignSnapshot,
} from '@/lib/superfluid/streamingCampaign'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REORG_SAFETY_BLOCKS = 100n
const API_BATCH_SIZE = 100

interface CampaignState {
  lastBlock: string
  lastTimestamp: number
  snapshot: Record<string, { gross: string; refunded: string }>
  pointNumerators: Record<string, string>
  awardedPoints: Record<string, number>
  completed?: boolean
}

interface Follower {
  fid: number
  username: string
}

function authorized(request: NextRequest) {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

async function findBlockAtOrBefore(
  client: ReturnType<typeof createStreamingClient>,
  timestamp: number,
  high: bigint,
): Promise<bigint> {
  let low = 0n
  while (low < high) {
    const mid = low + (high - low + 1n) / 2n
    const block = await client.getBlock({ blockNumber: mid })
    if (Number(block.timestamp) <= timestamp) low = mid
    else high = mid - 1n
  }
  return low
}

async function fetchFollowerFids(): Promise<Follower[]> {
  const fid = process.env.MARKEE_FARCASTER_FID?.trim()
  if (!fid) return []
  const followers: Follower[] = []
  let cursor: string | undefined
  while (true) {
    const url = `https://api.farcaster.xyz/v2/followers?fid=${fid}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Markee/1.0; +https://markee.xyz)',
        ...(process.env.FARCASTER_API_KEY ? { Authorization: process.env.FARCASTER_API_KEY } : {}),
      },
    })
    if (!response.ok) throw new Error(`Farcaster followers HTTP ${response.status}`)
    const body = await response.json() as {
      result?: { users?: { fid: number; username?: string }[] }
      next?: { cursor?: string }
    }
    followers.push(...(body.result?.users ?? []).map((user) => ({
      fid: user.fid,
      username: user.username ?? '',
    })))
    cursor = body.next?.cursor
    if (!cursor) return followers
  }
}

async function fetchFollowerWallet(fid: number): Promise<string | null> {
  const response = await fetch(`https://api.farcaster.xyz/v2/user-by-fid?fid=${fid}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.FARCASTER_API_KEY ? { Authorization: process.env.FARCASTER_API_KEY } : {}),
    },
  })
  if (!response.ok) return null
  const body = await response.json() as {
    result?: {
      extras?: {
        walletLabels?: { address?: string; labels?: string[] }[]
        ethWallets?: string[]
        custodyAddress?: string
      }
    }
  }
  const extras = body.result?.extras
  const primary = extras?.walletLabels?.find(
    (wallet) => wallet.labels?.includes('primary') && wallet.address?.startsWith('0x'),
  )?.address
  const address = primary ?? extras?.ethWallets?.[0] ?? extras?.custodyAddress
  return address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : null
}

async function buildFarcasterEvents(campaignId: number) {
  const followers = await fetchFollowerFids()
  const events: CampaignPointsEvent[] = []
  const awardedFids: number[] = []
  for (const follower of followers) {
    if (await kv.get(farcasterAwardKey(campaignId, follower.fid))) continue
    const account = await fetchFollowerWallet(follower.fid)
    if (!account) continue
    events.push({
      eventName: FARCASTER_EVENT_NAME,
      account,
      points: 1,
      uniqueId: `campaign:${campaignId}:fid:${follower.fid}`,
    })
    awardedFids.push(follower.fid)
  }
  return { followers: followers.length, events, awardedFids }
}

async function pushInBatches(events: CampaignPointsEvent[]) {
  let pushed = 0
  for (let index = 0; index < events.length; index += API_BATCH_SIZE) {
    const result = await pushCampaignEvents(events.slice(index, index + API_BATCH_SIZE))
    if (!result.success) throw new Error(result.error ?? 'Points API rejected campaign events')
    pushed += result.eventCount
  }
  return pushed
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'

  try {
    if (!STREAMING_ENABLED) throw new Error('NEXT_PUBLIC_STREAMING_FACTORY is not configured')
    const campaign = getStreamingCampaignConfig()
    const now = Math.floor(Date.now() / 1000)
    if (now < campaign.startTimestamp) {
      return NextResponse.json({ ok: true, status: 'not-started', campaignId: campaign.id })
    }

    const client = createStreamingClient()
    const [chainHead, subgraphHead, boardsResult, historyResult, storedState] = await Promise.all([
      client.getBlockNumber(),
      fetchStreamingSubgraphHead(),
      client.readContract({
        address: STREAMING_FACTORY as `0x${string}`,
        abi: StreamingLeaderboardFactoryABI,
        functionName: 'getLeaderboards',
        args: [0n, 1000n],
      }),
      kv.get<BoostConfigVersion[]>(boostHistoryKey(campaign.id)),
      kv.get<CampaignState>(campaignStateKey(campaign.id)),
    ])
    const boards = (boardsResult as readonly string[]).map((board) => board.toLowerCase())
    const history = historyResult ?? []
    const finalizedChainHead = chainHead > REORG_SAFETY_BLOCKS ? chainHead - REORG_SAFETY_BLOCKS : 0n
    const safeHeadBlock = finalizedChainHead < subgraphHead.number ? finalizedChainHead : subgraphHead.number
    const safeHeadTimestamp = Number((await client.getBlock({ blockNumber: safeHeadBlock })).timestamp)
    if (safeHeadTimestamp < campaign.startTimestamp) {
      return NextResponse.json({
        ok: true,
        status: 'awaiting-start-finality',
        campaignId: campaign.id,
        safeHeadBlock: safeHeadBlock.toString(),
      })
    }

    const startBlock = await findBlockAtOrBefore(client, campaign.startTimestamp, safeHeadBlock)
    const campaignEnded = now >= campaign.endTimestamp
    const canFinalize = campaignEnded && safeHeadTimestamp >= campaign.endTimestamp
    const targetBlock = canFinalize
      ? await findBlockAtOrBefore(client, campaign.endTimestamp - 1, safeHeadBlock)
      : safeHeadBlock
    const targetTimestamp = canFinalize ? campaign.endTimestamp : safeHeadTimestamp

    let state: CampaignState
    if (storedState) {
      state = storedState
    } else {
      const baseline = await fetchCampaignSnapshot(
        boards,
        STREAMING_BASE.ethx,
        startBlock,
        BigInt(campaign.startTimestamp),
      )
      state = {
        lastBlock: startBlock.toString(),
        lastTimestamp: campaign.startTimestamp,
        snapshot: serializeSnapshot(baseline),
        pointNumerators: {},
        awardedPoints: {},
      }
    }

    if (state.completed) {
      return NextResponse.json({ ok: true, status: 'completed', campaignId: campaign.id })
    }
    if (targetBlock < BigInt(state.lastBlock)) {
      return NextResponse.json({
        ok: true,
        status: 'awaiting-indexer',
        campaignId: campaign.id,
        indexedSafeBlock: targetBlock.toString(),
        lastProcessedBlock: state.lastBlock,
      })
    }

    let previousBlock = BigInt(state.lastBlock)
    let previousSnapshot: CampaignSnapshot = deserializeSnapshot(state.snapshot)
    let pointNumerators = state.pointNumerators
    const boostBoundaries = history
      // A version effective at block E applies to deltas produced in E. Historical
      // snapshots are inclusive, so close the prior multiplier interval at E - 1.
      .map((version) => BigInt(version.effectiveBlock) - 1n)
      .filter((block) => block > previousBlock && block < targetBlock)
      .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
    const checkpoints = [...new Set([...boostBoundaries.map(String), targetBlock.toString()])].map(BigInt)

    for (const checkpoint of checkpoints) {
      if (checkpoint <= previousBlock) continue
      const checkpointTimestamp = checkpoint === targetBlock
        ? targetTimestamp
        : Number((await client.getBlock({ blockNumber: checkpoint })).timestamp)
      const currentSnapshot = await fetchCampaignSnapshot(
        boards,
        STREAMING_BASE.ethx,
        checkpoint,
        BigInt(checkpointTimestamp),
      )
      const deltas = calculateNetDeltas(previousSnapshot, currentSnapshot)
      pointNumerators = addWeightedDeltas(
        pointNumerators,
        deltas,
        activeBoostsAt(history, Number(previousBlock + 1n)),
        campaign.pointsPerEth,
      )
      previousSnapshot = currentSnapshot
      previousBlock = checkpoint
      state.lastTimestamp = checkpointTimestamp
    }

    const targets = pointTargets(pointNumerators)
    const streamingEvents: CampaignPointsEvent[] = []
    for (const [account, target] of Object.entries(targets)) {
      const awarded = state.awardedPoints[account] ?? 0
      if (target === awarded) continue
      streamingEvents.push({
        eventName: STREAMING_EVENT_NAME,
        account,
        points: target - awarded,
        uniqueId: `campaign:${campaign.id}:stream:${account}:block:${targetBlock}:${target}`,
      })
    }
    const farcaster = await buildFarcasterEvents(campaign.id)
    const allEvents = [...streamingEvents, ...farcaster.events]

    if (!dryRun) {
      await pushInBatches(allEvents)
      for (const event of streamingEvents) {
        state.awardedPoints[event.account] = targets[event.account]
      }
      await Promise.all(farcaster.awardedFids.map((fid) =>
        kv.set(farcasterAwardKey(campaign.id, fid), true),
      ))
      state.lastBlock = previousBlock.toString()
      state.snapshot = serializeSnapshot(previousSnapshot)
      state.pointNumerators = pointNumerators
      state.completed = canFinalize && previousBlock === targetBlock
      await kv.set(campaignStateKey(campaign.id), state)
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      campaignId: campaign.id,
      status: canFinalize ? 'finalized' : campaignEnded ? 'awaiting-finality' : 'active',
      boards: boards.length,
      fromBlock: storedState?.lastBlock ?? startBlock.toString(),
      toBlock: targetBlock.toString(),
      streamingAwards: streamingEvents.length,
      farcasterFollowers: farcaster.followers,
      farcasterAwards: farcaster.events.length,
      events: allEvents.length,
    })
  } catch (error) {
    await logger.error('superfluid-streaming-points failed', error, { dryRun })
    return NextResponse.json(
      { error: 'Streaming campaign scoring failed' },
      { status: 500 },
    )
  }
}
