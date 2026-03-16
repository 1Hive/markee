/**
 * Superfluid Points API client
 * Spec: https://cms.superfluid.pro/points/openapi.json
 *
 * Server-side only — never import from client components.
 * API key and campaign IDs are read from env; never exposed to the browser.
 *
 * Scoped contracts (Base):
 *   Legacy TopDawg strategy:       0x7A6CE4d457AC1A31513BDEFf924FF942150D293E
 *   LeaderboardFactory strategy:   0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d
 * All Markee.sol / Leaderboard.sol deployed under these strategies are in scope.
 */

const BASE_URL = 'https://cms.superfluid.pro'

// ─── Points formula ───────────────────────────────────────────────────────────
// 1 point per 0.0001 ETH (1e14 wei). Minimum 1 point per transaction.

const WEI_PER_POINT = 100_000_000_000_000n // 1e14 wei = 0.0001 ETH

/**
 * Convert a wei amount (BigInt or decimal string) to integer points.
 * Returns at least 1 so every paid transaction earns something.
 */
export function ethToPoints(amountWei: bigint | string): number {
  const wei = typeof amountWei === 'string' ? BigInt(amountWei) : amountWei
  const points = Number(wei / WEI_PER_POINT)
  return Math.max(1, points)
}

// ─── Campaign / key resolution ────────────────────────────────────────────────
// Set SUPERFLUID_ENV=production in Vercel Production environment to target S5.
// Leave unset for Preview / dev → always hits the test campaign.

export function getCampaignId(): number {
  const id =
    process.env.SUPERFLUID_ENV === 'production'
      ? process.env.SUPERFLUID_CAMPAIGN_ID
      : process.env.TEST_SUPERFLUID_CAMPAIGN_ID

  if (!id) {
    throw new Error(
      process.env.SUPERFLUID_ENV === 'production'
        ? 'SUPERFLUID_CAMPAIGN_ID is not set'
        : 'TEST_SUPERFLUID_CAMPAIGN_ID is not set'
    )
  }
  const parsed = parseInt(id, 10)
  if (isNaN(parsed)) throw new Error(`Invalid campaign ID: "${id}"`)
  return parsed
}

function getApiKey(): string {
  const key =
    process.env.SUPERFLUID_ENV === 'production'
      ? process.env.SUPERFLUID_POINTS_API_KEY
      : process.env.TEST_SUPERFLUID_POINTS_API_KEY

  if (!key) {
    throw new Error(
      process.env.SUPERFLUID_ENV === 'production'
        ? 'SUPERFLUID_POINTS_API_KEY is not set'
        : 'TEST_SUPERFLUID_POINTS_API_KEY is not set'
    )
  }
  return key
}

// ─── Event definitions ────────────────────────────────────────────────────────
// eventName strings must match exactly what you created in the Superfluid CMS.
// ETH-based events: points are calculated dynamically from amountWei at call time.
// FARCASTER_FOLLOW: fixed at 1 point (1 per unique follower, deduped by FID).

export const SUPERFLUID_EVENTS = {
  BUY_MESSAGE: {
    eventName: 'buy_message',
    // points: calculated from amountWei via ethToPoints()
  },
  ADD_FUNDS: {
    eventName: 'add_funds',
    // points: calculated from amountWei via ethToPoints()
  },
  FARCASTER_FOLLOW: {
    eventName: 'farcaster_follow',
    points: 1,
  },
} as const

export type SuperfluidEventKey = keyof typeof SUPERFLUID_EVENTS

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushEventInput {
  event: SuperfluidEventKey
  account: string
  /** Points to award — required for ETH-based events, use ethToPoints(amountWei) */
  points: number
  /**
   * Dedup key. Use txHash for on-chain events, FID string for Farcaster follow.
   * The Superfluid API silently skips duplicate (campaign + account + uniqueId) events.
   */
  uniqueId?: string
}

export interface PushEventResult {
  success: boolean
  pushRequestId?: number
  eventCount?: number
  error?: string
}

// ─── Push ─────────────────────────────────────────────────────────────────────

/**
 * Award points for a single event.
 * Returns 202 Accepted — events are processed asynchronously.
 */
export async function pushEvent(input: PushEventInput): Promise<PushEventResult> {
  try {
    const campaignId = getCampaignId()
    const apiKey = getApiKey()
    const def = SUPERFLUID_EVENTS[input.event]

    const body: Record<string, unknown> = {
      campaignId,
      eventName: def.eventName,
      account: input.account.toLowerCase(),
      points: input.points,
    }

    if (input.uniqueId) body.uniqueId = input.uniqueId

    const res = await fetch(`${BASE_URL}/points/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    })

    if (res.status === 202) {
      const data = await res.json()
      return { success: true, pushRequestId: data.pushRequestId, eventCount: data.eventCount }
    }

    const err = await res.json().catch(() => ({ message: res.statusText }))
    const env = process.env.SUPERFLUID_ENV === 'production' ? 'S5' : 'test'
    console.error(`[Superfluid Points][${env}] pushEvent ${res.status}:`, err.message)
    return { success: false, error: `HTTP ${res.status}: ${err.message}` }
  } catch (e: any) {
    console.error('[Superfluid Points] pushEvent exception:', e)
    return { success: false, error: e.message }
  }
}

// ─── Query (public, no auth) ──────────────────────────────────────────────────

export async function getBalance(account: string) {
  try {
    const campaignId = getCampaignId()
    const res = await fetch(
      `${BASE_URL}/points/balance?campaignId=${campaignId}&account=${account.toLowerCase()}`
    )
    if (!res.ok) return null
    return await res.json() as { account: string; points: number }
  } catch (e) {
    console.error('[Superfluid Points] getBalance exception:', e)
    return null
  }
}

export async function getLeaderboard(page = 1, limit = 50) {
  try {
    const campaignId = getCampaignId()
    const res = await fetch(
      `${BASE_URL}/points/accounts?campaignId=${campaignId}&orderBy=totalPoints&order=desc&page=${page}&limit=${limit}`
    )
    if (!res.ok) return null
    return await res.json() as {
      accounts: Array<{ account: string; totalPoints: number; eventCount: number; lastEventAt: string | null }>
      pagination: { page: number; limit: number; totalDocs: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean }
    }
  } catch (e) {
    console.error('[Superfluid Points] getLeaderboard exception:', e)
    return null
  }
}
