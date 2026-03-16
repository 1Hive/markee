/**
 * Superfluid Points API client
 * Spec: https://cms.superfluid.pro/points/openapi.json
 *
 * Server-side only — never import from client components.
 */

const BASE_URL = 'https://cms.superfluid.pro'

// ─── Points formula ───────────────────────────────────────────────────────────
// 1 point per 0.0001 ETH (1e14 wei), minimum 1 point per transaction.

const WEI_PER_POINT = BigInt('100000000000000') // 1e14 wei = 0.0001 ETH

export function ethToPoints(amountWei: bigint | string): number {
  const wei = typeof amountWei === 'string' ? BigInt(amountWei) : amountWei
  return Math.max(1, Number(wei / WEI_PER_POINT))
}

// ─── Campaign / key resolution ────────────────────────────────────────────────

export function getCampaignId(): number {
  const id =
    process.env.SUPERFLUID_ENV === 'production'
      ? process.env.SUPERFLUID_CAMPAIGN_ID
      : process.env.TEST_SUPERFLUID_CAMPAIGN_ID
  if (!id) throw new Error(
    process.env.SUPERFLUID_ENV === 'production'
      ? 'SUPERFLUID_CAMPAIGN_ID is not set'
      : 'TEST_SUPERFLUID_CAMPAIGN_ID is not set'
  )
  const parsed = parseInt(id, 10)
  if (isNaN(parsed)) throw new Error(`Invalid campaign ID: "${id}"`)
  return parsed
}

function getApiKey(): string {
  const key =
    process.env.SUPERFLUID_ENV === 'production'
      ? process.env.SUPERFLUID_POINTS_API_KEY
      : process.env.TEST_SUPERFLUID_POINTS_API_KEY
  if (!key) throw new Error(
    process.env.SUPERFLUID_ENV === 'production'
      ? 'SUPERFLUID_POINTS_API_KEY is not set'
      : 'TEST_SUPERFLUID_POINTS_API_KEY is not set'
  )
  return key
}

// ─── Event definitions ────────────────────────────────────────────────────────

export const SUPERFLUID_EVENTS = {
  BUY_MESSAGE:      { eventName: 'buy_message' },
  ADD_FUNDS:        { eventName: 'add_funds' },
  FARCASTER_FOLLOW: { eventName: 'farcaster_follow', points: 1 },
} as const

export type SuperfluidEventKey = keyof typeof SUPERFLUID_EVENTS

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushEventInput {
  event: SuperfluidEventKey
  account: string
  points: number
  uniqueId?: string
}

export interface PushEventResult {
  success: boolean
  pushRequestId?: number
  eventCount?: number
  error?: string
}

// ─── Single push ──────────────────────────────────────────────────────────────

export async function pushEvent(input: PushEventInput): Promise<PushEventResult> {
  return pushBatch([input]).then(r => ({
    success: r.success,
    pushRequestId: r.pushRequestId,
    eventCount: r.eventCount,
    error: r.error,
  }))
}

// ─── Batch push (up to 100 per request — API limit) ──────────────────────────

export interface BatchPushResult {
  success: boolean
  pushRequestId?: number
  eventCount?: number
  error?: string
}

export async function pushBatch(events: PushEventInput[]): Promise<BatchPushResult> {
  if (events.length === 0) return { success: true, eventCount: 0 }

  try {
    const campaignId = getCampaignId()
    const apiKey = getApiKey()
    const env = process.env.SUPERFLUID_ENV === 'production' ? 'S5' : 'test'

    // Single event — use the simpler body shape
    if (events.length === 1) {
      const e = events[0]
      const body: Record<string, unknown> = {
        campaignId,
        eventName: SUPERFLUID_EVENTS[e.event].eventName,
        account: e.account.toLowerCase(),
        points: e.points,
      }
      if (e.uniqueId) body.uniqueId = e.uniqueId

      const res = await fetch(`${BASE_URL}/points/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
      })
      if (res.status === 202) {
        const data = await res.json()
        return { success: true, pushRequestId: data.pushRequestId, eventCount: data.eventCount }
      }
      const err = await res.json().catch(() => ({ message: res.statusText }))
      console.error(`[Superfluid Points][${env}] pushBatch single ${res.status}:`, err.message)
      return { success: false, error: `HTTP ${res.status}: ${err.message}` }
    }

    // Batch — per-event eventNames
    const body = {
      campaignId,
      events: events.map(e => ({
        eventName: SUPERFLUID_EVENTS[e.event].eventName,
        account: e.account.toLowerCase(),
        points: e.points,
        ...(e.uniqueId ? { uniqueId: e.uniqueId } : {}),
      })),
    }

    const res = await fetch(`${BASE_URL}/points/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
    })

    if (res.status === 202) {
      const data = await res.json()
      return { success: true, pushRequestId: data.pushRequestId, eventCount: data.eventCount }
    }

    const err = await res.json().catch(() => ({ message: res.statusText }))
    console.error(`[Superfluid Points][${env}] pushBatch ${res.status}:`, err.message)
    return { success: false, error: `HTTP ${res.status}: ${err.message}` }
  } catch (e: any) {
    console.error('[Superfluid Points] pushBatch exception:', e)
    return { success: false, error: e.message }
  }
}

// ─── Query helpers (public, no auth) ─────────────────────────────────────────

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
