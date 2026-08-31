const POINTS_API_BASE = 'https://cms.superfluid.pro'
export const STREAMING_EVENT_NAME = 'stream_markee'
export const FARCASTER_EVENT_NAME = 'farcaster_follow'

export interface StreamingCampaignConfig {
  id: number
  name: string
  startTimestamp: number
  endTimestamp: number
  pointsPerEth: bigint
}

export interface BoostConfigVersion {
  effectiveBlock: number
  multipliers: Record<string, number>
  updatedAt: number
  updatedBy: string
}

export interface CampaignSnapshotValue {
  gross: bigint
  refunded: bigint
}

export type CampaignSnapshot = Map<string, CampaignSnapshotValue>

export interface CampaignPointsEvent {
  eventName: typeof STREAMING_EVENT_NAME | typeof FARCASTER_EVENT_NAME
  account: string
  points: number
  uniqueId: string
}

export const campaignStateKey = (campaignId: number) =>
  `superfluid:streaming-campaign:${campaignId}:state`
export const boostHistoryKey = (campaignId: number) =>
  `superfluid:streaming-campaign:${campaignId}:boost-history`
export const farcasterAwardKey = (campaignId: number, fid: number) =>
  `superfluid:streaming-campaign:${campaignId}:farcaster:${fid}`

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function positiveInteger(name: string, value: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return parsed
}

export function getStreamingCampaignConfig(): StreamingCampaignConfig {
  const id = positiveInteger(
    'SUPERFLUID_STREAMING_CAMPAIGN_ID',
    requiredEnv('SUPERFLUID_STREAMING_CAMPAIGN_ID'),
  )
  const startTimestamp = positiveInteger(
    'SUPERFLUID_STREAMING_CAMPAIGN_START_TIMESTAMP',
    requiredEnv('SUPERFLUID_STREAMING_CAMPAIGN_START_TIMESTAMP'),
  )
  const endTimestamp = positiveInteger(
    'SUPERFLUID_STREAMING_CAMPAIGN_END_TIMESTAMP',
    requiredEnv('SUPERFLUID_STREAMING_CAMPAIGN_END_TIMESTAMP'),
  )
  if (endTimestamp <= startTimestamp) {
    throw new Error('SUPERFLUID_STREAMING_CAMPAIGN_END_TIMESTAMP must be after start')
  }
  const pointsPerEth = BigInt(requiredEnv('SUPERFLUID_STREAMING_POINTS_PER_ETH'))
  if (pointsPerEth <= 0n) {
    throw new Error('SUPERFLUID_STREAMING_POINTS_PER_ETH must be positive')
  }
  return {
    id,
    name: requiredEnv('SUPERFLUID_STREAMING_CAMPAIGN_NAME'),
    startTimestamp,
    endTimestamp,
    pointsPerEth,
  }
}

export function snapshotKey(account: string, board: string): string {
  return `${account.toLowerCase()}:${board.toLowerCase()}`
}

export function splitSnapshotKey(key: string): { account: string; board: string } {
  const separator = key.indexOf(':')
  if (separator < 0) throw new Error(`Invalid campaign snapshot key: ${key}`)
  return { account: key.slice(0, separator), board: key.slice(separator + 1) }
}

export function serializeSnapshot(snapshot: CampaignSnapshot) {
  return Object.fromEntries(
    [...snapshot.entries()].map(([key, value]) => [
      key,
      { gross: value.gross.toString(), refunded: value.refunded.toString() },
    ]),
  )
}

export function deserializeSnapshot(
  snapshot: Record<string, { gross: string; refunded: string }>,
): CampaignSnapshot {
  return new Map(
    Object.entries(snapshot).map(([key, value]) => [
      key,
      { gross: BigInt(value.gross), refunded: BigInt(value.refunded) },
    ]),
  )
}

export function calculateNetDeltas(
  previous: CampaignSnapshot,
  current: CampaignSnapshot,
): Map<string, bigint> {
  const keys = new Set([...previous.keys(), ...current.keys()])
  const deltas = new Map<string, bigint>()
  for (const key of keys) {
    const before = previous.get(key) ?? { gross: 0n, refunded: 0n }
    const after = current.get(key) ?? before
    const grossDelta = after.gross - before.gross
    const refundDelta = after.refunded - before.refunded
    if (grossDelta < 0n || refundDelta < 0n) {
      throw new Error(`Subgraph cumulative value decreased for ${key}`)
    }
    if (after.refunded > after.gross) {
      throw new Error(`Cumulative refunds exceeded gross stream value for ${key}`)
    }
    const net = grossDelta - refundDelta
    if (net !== 0n) deltas.set(key, net)
  }
  return deltas
}

export function multiplierForBoard(
  board: string,
  multipliers: Record<string, number>,
): number {
  const multiplier = multipliers[board.toLowerCase()] ?? 1
  if (!Number.isSafeInteger(multiplier) || multiplier < 1) {
    throw new Error(`Invalid multiplier for ${board}`)
  }
  return multiplier
}

export function addWeightedDeltas(
  numerators: Record<string, string>,
  deltas: Map<string, bigint>,
  multipliers: Record<string, number>,
  pointsPerEth: bigint,
): Record<string, string> {
  const next = { ...numerators }
  for (const [key, netWei] of deltas) {
    const { account, board } = splitSnapshotKey(key)
    const multiplier = BigInt(multiplierForBoard(board, multipliers))
    const increment = netWei * multiplier * pointsPerEth
    next[account] = (BigInt(next[account] ?? '0') + increment).toString()
  }
  return next
}

export function pointTargets(numerators: Record<string, string>): Record<string, number> {
  const denominator = 10n ** 18n
  return Object.fromEntries(
    Object.entries(numerators).map(([account, numerator]) => {
      const points = BigInt(numerator) / denominator
      if (points < 0n) {
        throw new Error(`Point total became negative for ${account}`)
      }
      if (points > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`Point total exceeds safe integer for ${account}`)
      }
      return [account, Number(points)]
    }),
  )
}

export function activeBoostsAt(
  history: BoostConfigVersion[],
  blockNumber: number,
): Record<string, number> {
  return history
    .filter((version) => version.effectiveBlock <= blockNumber)
    .sort((a, b) => a.effectiveBlock - b.effectiveBlock)
    .at(-1)?.multipliers ?? {}
}

export async function pushCampaignEvents(
  events: CampaignPointsEvent[],
): Promise<{ success: boolean; eventCount: number; error?: string }> {
  if (events.length === 0) return { success: true, eventCount: 0 }
  const config = getStreamingCampaignConfig()
  const apiKey = requiredEnv('SUPERFLUID_STREAMING_POINTS_API_KEY')
  const eventPayloads = events.map((event) => ({
    eventName: event.eventName,
    account: event.account.toLowerCase(),
    points: event.points,
    uniqueId: event.uniqueId,
  }))
  const body = events.length === 1
    ? { campaignId: config.id, ...eventPayloads[0] }
    : { campaignId: config.id, events: eventPayloads }
  const response = await fetch(`${POINTS_API_BASE}/points/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(body),
  })
  if (response.status === 202) {
    const body = await response.json() as { eventCount?: number }
    return { success: true, eventCount: body.eventCount ?? events.length }
  }
  const errorBody = await response.json().catch(() => ({ message: response.statusText })) as { message?: string }
  return { success: false, eventCount: 0, error: `HTTP ${response.status}: ${errorBody.message ?? response.statusText}` }
}

export async function fetchCampaignLeaderboard() {
  const config = getStreamingCampaignConfig()
  const accounts: unknown[] = []
  for (let page = 1; page <= 20; page++) {
    const response = await fetch(
      `${POINTS_API_BASE}/points/accounts?campaignId=${config.id}&orderBy=totalPoints&order=desc&page=${page}&limit=100`,
      { cache: 'no-store' },
    )
    if (!response.ok) break
    const body = await response.json() as {
      accounts?: unknown[]
      pagination?: { hasNextPage?: boolean; totalDocs?: number }
    }
    accounts.push(...(body.accounts ?? []))
    if (!body.pagination?.hasNextPage) break
  }
  return accounts
}

export async function fetchCampaignEventBalance(eventName: string): Promise<number> {
  const config = getStreamingCampaignConfig()
  const response = await fetch(
    `${POINTS_API_BASE}/points/event-balance?campaignId=${config.id}&eventName=${eventName}`,
    { cache: 'no-store' },
  )
  if (!response.ok) return 0
  const body = await response.json() as { points?: number }
  return body.points ?? 0
}
