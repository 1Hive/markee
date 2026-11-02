import 'server-only'
import { kv } from '@vercel/kv'
import { parseAbi, type Address } from 'viem'
import { getModerationClient } from '@/lib/moderation/server'
import { BOARD_MESSAGE_LIMIT } from '@/lib/streaming/listing'

// Day-by-day history for the dashboard charts. Everything is stored per UTC day, as a hash field
// named YYYY-MM-DD on one key per address, so history grows by one field per day.
//
// Views are exact: /api/views counts each view into its day as it lands. Money is a running total
// snapshotted once a day (boards by the stats-snapshot cron, wallets when their dashboard loads); a
// day's amount is how much the total grew since the snapshot before it.

export const dayOf = (ms: number = Date.now()) => new Date(ms).toISOString().slice(0, 10)

export const dailyViewsKey = (address: string) => `views:daily:${address.toLowerCase()}`
// First day views were counted by day, so the charts know where real history begins.
export const VIEWS_SINCE_KEY = 'views:daily:since'

export const raisedSnapshotKey = (board: string) => `stats:raised:${board.toLowerCase()}`
export const boughtSnapshotKey = (wallet: string) => `stats:bought:${wallet.toLowerCase()}`
export const fundedSnapshotKey = (wallet: string) => `stats:funded:${wallet.toLowerCase()}`

// Today's running total. Overwritten through the day, so the last write of the day is the day's close.
export async function snapshotTotals(entries: { key: string; total: bigint }[]): Promise<void> {
  if (entries.length === 0) return
  const day = dayOf()
  const pipeline = kv.pipeline()
  entries.forEach(({ key, total }) => pipeline.hset(key, { [day]: total.toString() }))
  await pipeline.exec()
}

export function lastDays(n: number, now: number = Date.now()): string[] {
  return Array.from({ length: n }, (_, i) => dayOf(now - (n - 1 - i) * 86_400_000))
}

const CHUNK = 500

async function hgetalls(keys: string[]): Promise<Record<string, string | number>[]> {
  const out: Record<string, string | number>[] = []
  for (let i = 0; i < keys.length; i += CHUNK) {
    const pipeline = kv.pipeline()
    keys.slice(i, i + CHUNK).forEach(k => pipeline.hgetall(k))
    const res = await pipeline.exec<(Record<string, string | number> | null)[]>()
    out.push(...res.map(r => r ?? {}))
  }
  return out
}

// Views per day across these addresses, summed.
export async function dailyViews(addresses: string[], days: string[]): Promise<number[]> {
  const hashes = await hgetalls([...new Set(addresses.map(dailyViewsKey))])
  return days.map(d => hashes.reduce((sum, h) => sum + Number(h[d] ?? 0), 0))
}

// Per-day growth of running totals, summed across keys. A key's first snapshot only sets its
// baseline. A gap between snapshots is spread evenly over the days it covers, so a missed day reads
// as two half days rather than a zero and a spike. Also returns the earliest day any key has
// history for (its second snapshot), or null when none does yet.
export async function dailyGrowth(keys: string[], days: string[]): Promise<{ values: bigint[]; since: string | null }> {
  const hashes = await hgetalls([...new Set(keys)])
  const values = days.map(() => 0n)
  const index = new Map(days.map((d, i) => [d, i]))
  let since: string | null = null
  for (const h of hashes) {
    const snaps = Object.entries(h).map(([d, v]) => [d, BigInt(String(v))] as const).sort(([a], [b]) => a < b ? -1 : 1)
    // Growth is measured from the highest total seen so far, so a dip (a read that missed a board,
    // say) followed by a recovery isn't counted twice.
    let high = snaps[0]?.[1] ?? 0n
    for (let i = 1; i < snaps.length; i++) {
      const [prevDay] = snaps[i - 1]
      const [day, total] = snaps[i]
      if (since === null || day < since) since = day
      const growth = total > high ? total - high : 0n
      if (total > high) high = total
      const span = Math.max(1, Math.round((Date.parse(day) - Date.parse(prevDay)) / 86_400_000))
      for (let k = 0; k < span; k++) {
        const at = index.get(dayOf(Date.parse(day) - k * 86_400_000))
        if (at !== undefined) values[at] += growth / BigInt(span) + (k === 0 ? growth % BigInt(span) : 0n)
      }
    }
  }
  return { values, since }
}

const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])

// Each board plus every message on it: views are counted under whichever message was on top, so a
// board's views on a day are the sum across all of them. Legacy boards count by board address alone.
export async function boardAndMessageAddresses(boards: string[]): Promise<string[]> {
  if (boards.length === 0) return []
  const tops = await getModerationClient().multicall({
    contracts: boards.map(address => ({ address: address as Address, abi: TOP_ABI, functionName: 'getTopMarkees' as const, args: [BigInt(BOARD_MESSAGE_LIMIT)] as const })),
  }).catch(() => [])
  return [...new Set([...boards, ...tops.flatMap(t => (t?.result?.[0] ?? []) as readonly string[])].map(a => a.toLowerCase()))]
}
