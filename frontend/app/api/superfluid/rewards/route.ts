import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import {
  FARCASTER_EVENT_NAME,
  STREAMING_EVENT_NAME,
  boostHistoryKey,
  fetchCampaignEventBalance,
  fetchCampaignLeaderboard,
  getStreamingCampaignConfig,
  type BoostConfigVersion,
} from '@/lib/superfluid/streamingCampaign'

export const dynamic = 'force-dynamic'

const CACHE_TTL = 60

async function loadRewards() {
  const campaign = getStreamingCampaignConfig()
  const [accounts, streamPoints, farcasterPoints, boostHistory] = await Promise.all([
    fetchCampaignLeaderboard(),
    fetchCampaignEventBalance(STREAMING_EVENT_NAME),
    fetchCampaignEventBalance(FARCASTER_EVENT_NAME),
    kv.get<BoostConfigVersion[]>(boostHistoryKey(campaign.id)),
  ])
  const latestBoosts = (boostHistory ?? []).sort(
    (a, b) => a.effectiveBlock - b.effectiveBlock,
  ).at(-1)?.multipliers ?? {}

  return {
    accounts,
    totalDocs: accounts.length,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      startTimestamp: campaign.startTimestamp,
      endTimestamp: campaign.endTimestamp,
      pointsPerEth: campaign.pointsPerEth.toString(),
    },
    campaignTotals: {
      streamMarkee: streamPoints,
      farcasterFollow: farcasterPoints,
    },
    boostMultipliers: latestBoosts,
  }
}

type Rewards = Awaited<ReturnType<typeof loadRewards>>

function campaignStatus(campaign: Rewards['campaign']) {
  const now = Math.floor(Date.now() / 1000)
  return now < campaign.startTimestamp ? 'upcoming'
    : now >= campaign.endTimestamp ? 'ended'
    : 'active'
}

export async function GET() {
  try {
    const cacheKey = `cache:superfluid:rewards:${getStreamingCampaignConfig().id}`
    let rewards = await kv.get<Rewards>(cacheKey).catch(() => null)
    if (!rewards) {
      rewards = await loadRewards()
      await kv.set(cacheKey, rewards, { ex: CACHE_TTL }).catch(e => console.error('[/api/superfluid/rewards] cache write failed', e))
    }
    return NextResponse.json({ ...rewards, campaign: { ...rewards.campaign, status: campaignStatus(rewards.campaign) } })
  } catch (error) {
    console.error('[/api/superfluid/rewards]', error)
    return NextResponse.json({ error: 'Could not load campaign rewards' }, { status: 500 })
  }
}
