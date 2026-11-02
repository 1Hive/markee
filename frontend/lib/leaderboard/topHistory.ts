// When each message held a board's #1 spot, rebuilt from the board's own events, so "winning for 3d"
// and "won for 1d 4h total" read the same everywhere (account rows, the board page's top-since).
//
// Rent boards emit TopChanged whenever the enforced #1 changes. For Sale boards (v1.0-v1.3 share
// these event signatures) have no such event, so their #1 is replayed from each message's running
// total: the highest total wins and a tie keeps the earlier message, as getTopMarkees orders them.
//
// It only grows, so it is kept permanently in KV per board with a scanned-to checkpoint. The
// moderation scan (every 5 min) advances it up to a reorg margin behind the head; pages only read it.
// Timestamps are read for the blocks that changed a #1 only (a handful per scan).

import { kv } from '@vercel/kv'
import { parseAbiItem, type Address, type PublicClient, type Transport } from 'viem'
import type { base } from 'viem/chains'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'

type BaseClient = PublicClient<Transport, typeof base>

const REORG_SAFETY_BLOCKS = 100n
const BLOCK_READ_CHUNK = 20
const WRITE_CHUNK = 50

const TOP_CHANGED = parseAbiItem('event TopChanged(address indexed oldTop, address indexed newTop, uint256 newTopRate)')
const SALE_EVENTS = [
  parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name, uint256 amount)'),
  parseAbiItem('event FreeMarkeeCreated(address indexed markeeAddress, address indexed owner)'),
  parseAbiItem('event MarkeeMigratedFromLegacy(address indexed newMarkeeAddress, address indexed oldMarkeeAddress, address indexed owner, uint256 historicalFunds)'),
  parseAbiItem('event FundsAdded(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 newMarkeeTotal)'),
  parseAbiItem('event MarkeeLeft(address indexed markeeAddress)'),
] as const

// One stretch at #1, in unix seconds; `to` is null while it lasts.
export interface TopSpan { markee: string; from: number; to: number | null }

interface Stored {
  spans: TopSpan[]
  scannedTo: string
  // For Sale replay state: each message's running total, in the order the board added them.
  totals?: [string, string][]
}

export type BoardKind = 'streaming' | 'sale'

function openSpan(spans: TopSpan[], markee: string | null, at: number) {
  const last = spans[spans.length - 1]
  if (last && last.to === null) {
    if (last.markee === markee) return
    last.to = at
  }
  if (markee) spans.push({ markee, from: at, to: null })
}

interface ScanLog { address: string; blockNumber: bigint; eventName?: string; args: unknown }

const historyKey = (board: string) => `board:tophistory:${board.toLowerCase()}`

// Advances every board's history to `head` minus the reorg margin, in as few log scans as possible:
// boards checkpointed at the same block share one getLogs per kind (normally all of them), and a
// board seen for the first time backfills in its own group. Run from the moderation scan, so pages
// only ever read KV (readTopHistories).
export async function updateTopHistories(client: BaseClient, boards: { address: string; kind: BoardKind }[], head: bigint): Promise<void> {
  if (boards.length === 0) return
  const toBlock = head - REORG_SAFETY_BLOCKS
  const stored = await kv.mget<(Stored | null)[]>(...boards.map(b => historyKey(b.address)))
  const groups = new Map<string, { fromBlock: bigint; kind: BoardKind; boards: { address: string; record: Stored | null }[] }>()
  boards.forEach((b, i) => {
    const record = stored[i] ?? null
    const fromBlock = record ? BigInt(record.scannedTo) + 1n : BASE_MARKEE_EVENTS_FROM_BLOCK
    if (fromBlock > toBlock) return
    const key = `${b.kind}:${fromBlock}`
    const group = groups.get(key) ?? { fromBlock, kind: b.kind, boards: [] }
    group.boards.push({ address: b.address.toLowerCase(), record })
    groups.set(key, group)
  })
  if (groups.size === 0) return

  const scans = await Promise.all([...groups.values()].map(async group => {
    const address = group.boards.map(m => m.address as Address)
    const logs: ScanLog[] = group.kind === 'streaming'
      ? await client.getLogs({ address, event: TOP_CHANGED, fromBlock: group.fromBlock, toBlock })
      : await client.getLogs({ address, events: SALE_EVENTS, fromBlock: group.fromBlock, toBlock })
    return { ...group, logs }
  }))

  // Replay first, noting only the blocks where a board's #1 actually changed, so timestamps are read
  // for those few blocks rather than for every FundsAdded.
  const updates: { board: string; record: Stored | null; changes: { block: bigint; top: string | null }[]; totals?: [string, string][] }[] = []
  for (const { kind, boards: members, logs } of scans) {
    const byBoard = new Map<string, ScanLog[]>()
    for (const log of logs) {
      const board = log.address.toLowerCase()
      byBoard.set(board, [...(byBoard.get(board) ?? []), log])
    }
    for (const { address: board, record } of members) {
      const last = record?.spans[record.spans.length - 1]
      let current = last && last.to === null ? last.markee : null
      const changes: { block: bigint; top: string | null }[] = []
      const note = (block: bigint, top: string | null) => { if (top !== current) { changes.push({ block, top }); current = top } }
      const boardLogs = byBoard.get(board) ?? []
      if (kind === 'streaming') {
        for (const log of boardLogs) {
          const top = ((log.args as { newTop?: string }).newTop ?? '').toLowerCase()
          note(log.blockNumber, top && !/^0x0+$/.test(top) ? top : null)
        }
        updates.push({ board, record, changes })
      } else {
        const running = new Map((record?.totals ?? []).map(([m, t]) => [m, BigInt(t)]))
        const topOf = () => {
          let best: string | null = null
          let bestTotal = 0n
          running.forEach((total, m) => { if (best === null || total > bestTotal) { best = m; bestTotal = total } })
          return best
        }
        for (const log of boardLogs) {
          const args = log.args as Record<string, unknown>
          const m = ((args.markeeAddress ?? args.newMarkeeAddress) as string | undefined)?.toLowerCase()
          if (!m) continue
          if (log.eventName === 'MarkeeLeft') running.delete(m)
          else if (log.eventName === 'FundsAdded') running.set(m, args.newMarkeeTotal as bigint)
          else if (log.eventName === 'MarkeeCreated') running.set(m, args.amount as bigint)
          else if (log.eventName === 'MarkeeMigratedFromLegacy') running.set(m, args.historicalFunds as bigint)
          else running.set(m, running.get(m) ?? 0n)
          note(log.blockNumber, topOf())
        }
        updates.push({ board, record, changes, totals: [...running].map(([m, t]) => [m, t.toString()]) })
      }
    }
  }

  const blocks = [...new Set(updates.flatMap(u => u.changes.map(c => c.block)))]
  const times = new Map<bigint, number>()
  for (let i = 0; i < blocks.length; i += BLOCK_READ_CHUNK) {
    await Promise.all(blocks.slice(i, i + BLOCK_READ_CHUNK).map(async blockNumber => {
      times.set(blockNumber, Number((await client.getBlock({ blockNumber })).timestamp))
    }))
  }

  const writes: Record<string, Stored> = {}
  for (const { board, record, changes, totals } of updates) {
    const spans = record?.spans.map(s => ({ ...s })) ?? []
    for (const c of changes) openSpan(spans, c.top, times.get(c.block)!)
    writes[historyKey(board)] = { spans, scannedTo: toBlock.toString(), ...(totals ? { totals } : {}) }
  }
  // Upstash caps a request body, and a first backfill writes every board at once.
  const entries = Object.entries(writes)
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) await kv.mset(Object.fromEntries(entries.slice(i, i + WRITE_CHUNK)))
}

// Stored histories, no chain reads. A board the scan hasn't recorded yet is absent from the map.
export async function readTopHistories(boards: string[]): Promise<Map<string, TopSpan[]>> {
  const unique = [...new Set(boards.map(b => b.toLowerCase()))]
  if (unique.length === 0) return new Map()
  const rows = await kv.mget<(Stored | null)[]>(...unique.map(historyKey))
  return new Map(unique.flatMap((b, i) => rows[i] ? [[b, rows[i]!.spans] as const] : []))
}

// Adds winningSince (unix seconds, while it's the current #1) and wonSeconds (total time at #1) to
// account rows. Both are null where the board has no recorded history (legacy boards, or a board
// the scan hasn't reached yet), so the UI shows nothing rather than "Never won".
export async function withWinTimes<T extends { address: string; strategyId: string }>(rows: T[]): Promise<(T & { winningSince: number | null; wonSeconds: number | null })[]> {
  const histories = await readTopHistories(rows.map(r => r.strategyId)).catch(() => new Map<string, TopSpan[]>())
  return rows.map(r => {
    const spans = histories.get(r.strategyId.toLowerCase())
    return { ...r, winningSince: spans ? winningSince(spans, r.address) : null, wonSeconds: spans ? secondsWon(spans, r.address) : null }
  })
}

// The current stretch at #1 for this message, if it is the one on top now.
export function winningSince(spans: TopSpan[], markee: string): number | null {
  const last = spans[spans.length - 1]
  return last && last.to === null && last.markee === markee.toLowerCase() ? last.from : null
}

// Total seconds this message has spent at #1, the ongoing stretch counted up to `now`.
export function secondsWon(spans: TopSpan[], markee: string, now = Math.floor(Date.now() / 1000)): number {
  const m = markee.toLowerCase()
  return spans.reduce((sum, s) => s.markee === m ? sum + Math.max(0, (s.to ?? now) - s.from) : sum, 0)
}
