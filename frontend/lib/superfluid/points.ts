/**
 * Superfluid Points API client
 * Spec: https://cms.superfluid.pro/points/openapi.json
 *
 * Server-side only — never import from client components.
 * API key and campaign IDs are read from env; never exposed to the browser.
 */

const BASE_URL = 'https://cms.superfluid.pro'

// ─── Campaign / key resolution ────────────────────────────────────────────────
// Set SUPERFLUID_ENV=production in your Vercel prod deployment to target S5.
// Leave unset (or set to anything else) to use the test campaign.

export function getCampaignId(): number {
  const id =
    process.env.SUPERFLUID_ENV === 'production'
      ? process.env.SUPERFLUID_CAMPAIGN_ID
      : process.env.TEST_SUPERFLUID_CAMPAIGN_ID

  if (!id) {
    const name =
      process.env.SUPERFLUID_ENV === 'production'
        ? 'SUPERFLUID_CAMPAIGN_ID'
        : 'TEST_SUPERFLUID_CAMPAIGN_ID'
    throw new Error(`${name} env var is not set`)
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
    const name =
      process.env.SUPERFLUID_ENV === 'production'
        ? 'SUPERFLUID_POINTS_API_KEY'
        : 'TEST_SUPERFLUID_POINTS_API_KEY'
    throw new Error(`${name} env var is not set`)
  }
  return key
}

// ─── Event definitions ────────────────────────────────────────────────────────
// eventName strings must match exactly what you created in the Superfluid CMS.
// points are integers — update values once the campaign point schedule is set.

export const SUPERFLUID_EVENTS = {
  BUY_MESSAGE: {
    eventName: 'buy_message',
    points: 100,
  },
  ADD_FUNDS: {
    eventName: 'add_funds',
    points: 50,
  },
  FARCASTER_FOLLOW: {
    eventName: 'farcaster_follow',
    points: 10,
  },
} as const

export type SuperfluidEventKey = keyof typeof SUPERFLUID_EVENTS

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushEventInput {
  /** Key from SUPERFLUID_EVENTS */
  event: SuperfluidEventKey
  /** Wallet address earning the points */
  account: string
  /**
   * Dedup key — prevents double-awarding if the same tx fires twice.
   * Use the transaction hash for on-chain events.
   */
  uniqueId?: string
  /**
   * Override the default point value defined in SUPERFLUID_EVENTS.
   * Useful for proportional rewards (e.g. more points for larger ETH amounts).
   */
  pointsOverride?: number
}

export interface PushEventResult {
  success: boolean
  /** pushRequestId returned by the API — useful for debugging in the CMS */
  pushRequestId?: number
  eventCount?: number
  error?: string
}

export interface PointBalance {
  account: string
  points: number
}

// ─── Push ─────────────────────────────────────────────────────────────────────

/**
 * Award points for a single rewardable event.
 *
 * The API returns 202 Accepted — events are processed asynchronously and
 * will appear in the CMS shortly after.
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
      points: input.pointsOverride ?? def.points,
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

    // 202 = accepted for async processing
    if (res.status === 202) {
      const data = await res.json()
      return {
        success: true,
        pushRequestId: data.pushRequestId,
        eventCount: data.eventCount,
      }
    }

    // Error responses use { message } per the spec (changed from { error } on 2026-01-26)
    const err = await res.json().catch(() => ({ message: res.statusText }))
    const context = process.env.SUPERFLUID_ENV === 'production' ? 'S5' : 'test'
    console.error(`[Superfluid Points][${context}] pushEvent ${res.status}:`, err.message)
    return { success: false, error: `HTTP ${res.status}: ${err.message}` }
  } catch (e: any) {
    console.error('[Superfluid Points] pushEvent exception:', e)
    return { success: false, error: e.message }
  }
}

// ─── Query (public endpoints, no auth required) ───────────────────────────────

/**
 * Get points balance for a single account.
 * Returns { account, points } or null on error.
 */
export async function getBalance(account: string): Promise<PointBalance | null> {
  try {
    const campaignId = getCampaignId()
    const res = await fetch(
      `${BASE_URL}/points/balance?campaignId=${campaignId}&account=${account.toLowerCase()}`
    )
    if (!res.ok) {
      console.error('[Superfluid Points] getBalance error:', res.status)
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('[Superfluid Points] getBalance exception:', e)
    return null
  }
}

/**
 * Get the points leaderboard for the active campaign.
 * Sorted by totalPoints descending. Results are paginated (max 100/page).
 */
export async function getLeaderboard(page = 1, limit = 50) {
  try {
    const campaignId = getCampaignId()
    const res = await fetch(
      `${BASE_URL}/points/accounts?campaignId=${campaignId}&orderBy=totalPoints&order=desc&page=${page}&limit=${limit}`
    )
    if (!res.ok) return null
    return await res.json() as {
      accounts: Array<{
        account: string
        totalPoints: number
        eventCount: number
        lastEventAt: string | null
      }>
      pagination: {
        page: number
        limit: number
        totalDocs: number
        totalPages: number
        hasNextPage: boolean
        hasPrevPage: boolean
      }
    }
  } catch (e) {
    console.error('[Superfluid Points] getLeaderboard exception:', e)
    return null
  }
}
