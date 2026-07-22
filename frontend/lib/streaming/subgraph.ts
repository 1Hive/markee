const DEFAULT_ENDPOINT = 'https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1'
const ADDR_BATCH = 500
const PAGE = 1000

export interface BoardTotals {
  raised: bigint
  raisedRate: bigint
}

// What one backer has put into a board, net of what the GDA refund pool has paid back to them.
export interface BackerPosition {
  contributed: bigint
  rate: bigint
}

interface SnapshotRow {
  id: string
  updatedAtTimestamp: string
  totalInflowRate: string
  totalAmountStreamedInUntilUpdatedAt: string
}

interface PoolRow {
  admin: { id: string }
  updatedAtTimestamp: string
  flowRate: string
  adjustmentFlowRate: string
  totalAmountFlowedDistributedUntilUpdatedAt: string
  totalAmountInstantlyDistributedUntilUpdatedAt: string
}

const INFLOW_QUERY = `query BoardInflow($ids: [ID!]!) {
  accountTokenSnapshots(where: { id_in: $ids }, first: ${PAGE}) {
    id
    updatedAtTimestamp
    totalInflowRate
    totalAmountStreamedInUntilUpdatedAt
  }
}`

const POOL_QUERY = `query BoardPools($admins: [String!]!, $token: String!, $skip: Int!) {
  pools(where: { admin_in: $admins, token: $token }, first: ${PAGE}, skip: $skip) {
    admin { id }
    updatedAtTimestamp
    flowRate
    adjustmentFlowRate
    totalAmountFlowedDistributedUntilUpdatedAt
    totalAmountInstantlyDistributedUntilUpdatedAt
  }
}`

interface BackerStreamRow {
  receiver: { id: string }
  updatedAtTimestamp: string
  currentFlowRate: string
  streamedUntilUpdatedAt: string
}

interface BackerMemberRow {
  units: string
  totalAmountReceivedUntilUpdatedAt: string
  syncedPerUnitSettledValue: string
  pool: {
    admin: { id: string }
    updatedAtTimestamp: string
    perUnitSettledValue: string
    perUnitFlowRate: string
  }
}

const BACKER_STREAM_QUERY = `query BackerStreams($sender: String!, $token: String!, $receivers: [String!]!) {
  streams(where: { sender: $sender, token: $token, receiver_in: $receivers }, first: ${PAGE}) {
    receiver { id }
    updatedAtTimestamp
    currentFlowRate
    streamedUntilUpdatedAt
  }
}`

const BACKER_REFUND_QUERY = `query BackerRefunds($account: String!, $token: String!, $admins: [String!]!) {
  poolMembers(where: { account: $account, pool_: { admin_in: $admins, token: $token } }, first: ${PAGE}) {
    units
    totalAmountReceivedUntilUpdatedAt
    syncedPerUnitSettledValue
    pool {
      admin { id }
      updatedAtTimestamp
      perUnitSettledValue
      perUnitFlowRate
    }
  }
}`

function endpoint(): string {
  return process.env.STREAMING_SUBGRAPH_URL || DEFAULT_ENDPOINT
}

async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`)
  const json = await res.json() as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(`subgraph: ${json.errors[0].message}`)
  if (!json.data) throw new Error('subgraph: empty response')
  return json.data
}

function carryForward(amount: bigint, rate: bigint, updatedAt: bigint, atTimestamp: bigint): bigint {
  return amount + rate * (atTimestamp > updatedAt ? atTimestamp - updatedAt : 0n)
}

export async function fetchBoardTotals(
  boards: readonly string[],
  token: string,
  atTimestamp: bigint,
): Promise<Map<string, BoardTotals>> {
  const out = new Map<string, BoardTotals>()
  if (boards.length === 0) return out
  const tokenId = token.toLowerCase()
  const addrs = boards.map(b => b.toLowerCase())

  for (let i = 0; i < addrs.length; i += ADDR_BATCH) {
    const batch = addrs.slice(i, i + ADDR_BATCH)

    const { accountTokenSnapshots } = await query<{ accountTokenSnapshots: SnapshotRow[] }>(
      INFLOW_QUERY, { ids: batch.map(a => `${a}-${tokenId}`) },
    )
    for (const row of accountTokenSnapshots) {
      const inflowRate = BigInt(row.totalInflowRate)
      out.set(row.id.slice(0, row.id.indexOf('-')), {
        raised: carryForward(BigInt(row.totalAmountStreamedInUntilUpdatedAt), inflowRate, BigInt(row.updatedAtTimestamp), atTimestamp),
        raisedRate: inflowRate,
      })
    }

    for (let skip = 0; ; skip += PAGE) {
      const { pools } = await query<{ pools: PoolRow[] }>(POOL_QUERY, { admins: batch, token: tokenId, skip })
      for (const pool of pools) {
        const entry = out.get(pool.admin.id.toLowerCase())
        if (!entry) continue
        // adjustmentFlowRate is the unallocatable remainder the GDA returns to the admin, so it is
        // never actually refunded.
        const refundRate = BigInt(pool.flowRate) - BigInt(pool.adjustmentFlowRate)
        const distributed = BigInt(pool.totalAmountFlowedDistributedUntilUpdatedAt) + BigInt(pool.totalAmountInstantlyDistributedUntilUpdatedAt)
        const refunded = carryForward(distributed, refundRate, BigInt(pool.updatedAtTimestamp), atTimestamp)
        entry.raised = entry.raised > refunded ? entry.raised - refunded : 0n
        entry.raisedRate = entry.raisedRate > refundRate ? entry.raisedRate - refundRate : 0n
      }
      if (pools.length < PAGE) break
    }
  }
  return out
}

// Per-board contribution for a single backer, keyed by board address. Mirrors fetchBoardTotals:
// gross ETHx streamed in, minus what the board's GDA refund pool has streamed back to this backer
// (apportioned by their share of the pool's units, since the pool pays every member pro rata).
export async function fetchBackerPositions(
  backer: string,
  boards: readonly string[],
  token: string,
  atTimestamp: bigint,
): Promise<Map<string, BackerPosition>> {
  const out = new Map<string, BackerPosition>()
  if (boards.length === 0) return out
  const tokenId = token.toLowerCase()
  const sender = backer.toLowerCase()
  const addrs = boards.map(b => b.toLowerCase())

  for (let i = 0; i < addrs.length; i += ADDR_BATCH) {
    const batch = addrs.slice(i, i + ADDR_BATCH)

    const { streams } = await query<{ streams: BackerStreamRow[] }>(
      BACKER_STREAM_QUERY, { sender, token: tokenId, receivers: batch },
    )
    for (const row of streams) {
      const board = row.receiver.id.toLowerCase()
      const rate = BigInt(row.currentFlowRate)
      const streamed = carryForward(BigInt(row.streamedUntilUpdatedAt), rate, BigInt(row.updatedAtTimestamp), atTimestamp)
      const entry = out.get(board)
      // A board can hold several Stream entities for one sender: each close/reopen starts a new one.
      if (entry) {
        entry.contributed += streamed
        entry.rate += rate
      } else {
        out.set(board, { contributed: streamed, rate })
      }
    }

    if (out.size === 0) continue

    const { poolMembers } = await query<{ poolMembers: BackerMemberRow[] }>(
      BACKER_REFUND_QUERY, { account: sender, token: tokenId, admins: batch },
    )
    for (const member of poolMembers) {
      const entry = out.get(member.pool.admin.id.toLowerCase())
      if (!entry) continue
      const units = BigInt(member.units)
      // GDA member accounting: the amount settled to the member is only current as of their own last
      // sync, so top it up with the pool's per-unit settled value accrued since (which covers rate
      // changes in that window), then carry forward at the current per-unit rate from the pool's last
      // update. perUnitFlowRate already nets off the pool's adjustment flow.
      const settled = BigInt(member.pool.perUnitSettledValue) - BigInt(member.syncedPerUnitSettledValue)
      const memberRate = units * BigInt(member.pool.perUnitFlowRate)
      const refunded = carryForward(
        BigInt(member.totalAmountReceivedUntilUpdatedAt) + units * settled,
        memberRate, BigInt(member.pool.updatedAtTimestamp), atTimestamp,
      )
      entry.contributed = entry.contributed > refunded ? entry.contributed - refunded : 0n
      entry.rate = entry.rate > memberRate ? entry.rate - memberRate : 0n
    }
  }
  return out
}
