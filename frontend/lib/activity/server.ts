import 'server-only'
import { kv } from '@vercel/kv'
import { base } from 'viem/chains'
import { readBoardOwners } from '@/lib/moderation/server'
import type { ModerationItem } from '@/lib/moderation/queue'
import type { ActivityEvent } from '@/lib/activity/events'

export const activityKey = (wallet: string) => `activity:${base.id}:${wallet.toLowerCase()}`
// board → markee that was #1 at the last scan. A change between scans is a new winner.
const TOPS_KEY = `activity:tops:${base.id}`
export const MAX_EVENTS = 200

export interface BoardTop {
  markee: string
  value: bigint
}

interface Seen {
  author: string
  message: string
  name: string
}

// Turns one scan's view of the network into feed events: a board's #1 changing (now winning /
// outbid for the two message owners, new winning message for the board's owners) and any message
// on a board being edited, winning or not (non-winning messages still show on the leaderboard).
// The first run only records the tops, so nothing already live reads as new.
export async function recordActivity({ tops, streamingBoards, seen, edited, blockNumber, at }: {
  tops: Map<string, BoardTop>
  streamingBoards: Set<string>
  seen: Map<string, Seen>
  edited: ModerationItem[]
  blockNumber: bigint
  at: number
}): Promise<{ events: number; byWallet: Map<string, ActivityEvent[]> }> {
  const prevTops = await kv.hgetall<Record<string, string>>(TOPS_KEY)
  const changedTops = prevTops
    ? [...tops].filter(([board, top]) => prevTops[board] && prevTops[board] !== top.markee)
    : []

  const boards = [...new Set([...changedTops.map(([b]) => b), ...edited.map(e => e.board)])]
  const owners = boards.length ? await readBoardOwners(boards) : []
  const ownersOf = new Map(boards.map((b, i) => [b, owners[i]]))

  const byWallet = new Map<string, ActivityEvent[]>()
  const push = (wallet: string | undefined, event: Omit<ActivityEvent, 'id' | 'at'>) => {
    if (!wallet) return
    const full: ActivityEvent = { ...event, id: `${event.kind}:${event.markee}:${blockNumber}`, at }
    byWallet.set(wallet, [...(byWallet.get(wallet) ?? []), full])
  }

  for (const [board, top] of changedTops) {
    const now = seen.get(top.markee)
    const prevMarkee = prevTops![board]
    const prev = seen.get(prevMarkee)
    const text = { message: now?.message ?? '', name: now?.name ?? '' }
    push(now?.author, { kind: 'winning', side: 'buy', board, markee: top.markee, ...text })
    if (prev && prev.author !== now?.author) {
      push(prev.author, { kind: 'outbid', side: 'buy', board, markee: prevMarkee, message: prev.message, name: prev.name })
    }
    for (const owner of ownersOf.get(board) ?? []) {
      if (owner === now?.author) continue
      push(owner, { kind: 'new_top', side: 'own', board, markee: top.markee, ...text, amount: top.value.toString(), streaming: streamingBoards.has(board) })
    }
  }

  for (const item of edited) {
    for (const owner of ownersOf.get(item.board) ?? []) {
      if (owner === item.author) continue
      push(owner, { kind: 'edited', side: 'own', board: item.board, markee: item.markee, message: item.message, name: item.name })
    }
  }

  const topWrites: Record<string, string> = {}
  tops.forEach((top, board) => { if (prevTops?.[board] !== top.markee) topWrites[board] = top.markee })

  const pipeline = kv.pipeline()
  byWallet.forEach((events, wallet) => {
    pipeline.lpush(activityKey(wallet), ...events)
    pipeline.ltrim(activityKey(wallet), 0, MAX_EVENTS - 1)
  })
  if (Object.keys(topWrites).length) pipeline.hset(TOPS_KEY, topWrites)
  if (byWallet.size || Object.keys(topWrites).length) await pipeline.exec()

  return { events: [...byWallet.values()].reduce((n, e) => n + e.length, 0), byWallet }
}

export async function readActivity(wallet: string, limit = 100): Promise<ActivityEvent[]> {
  return kv.lrange<ActivityEvent>(activityKey(wallet), 0, limit - 1)
}
