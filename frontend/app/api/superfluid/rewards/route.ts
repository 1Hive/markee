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

export async function GET() {
  try {
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
    const now = Math.floor(Date.now() / 1000)

    return NextResponse.json({
      accounts,
      totalDocs: accounts.length,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        startTimestamp: campaign.startTimestamp,
        endTimestamp: campaign.endTimestamp,
        pointsPerEth: campaign.pointsPerEth.toString(),
        status:
          now < campaign.startTimestamp ? 'upcoming'
          : now >= campaign.endTimestamp ? 'ended'
          : 'active',
      },
      campaignTotals: {
        streamMarkee: streamPoints,
        farcasterFollow: farcasterPoints,
      },
      boostMultipliers: latestBoosts,
    })
  } catch (error) {
    console.error('[/api/superfluid/rewards]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    )
  }
}
