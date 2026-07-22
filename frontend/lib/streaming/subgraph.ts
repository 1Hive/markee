const DEFAULT_ENDPOINT = 'https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1'
const ADDR_BATCH = 500
const PAGE = 1000

export interface BoardTotals {
  raised: bigint
  raisedRate: bigint
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
