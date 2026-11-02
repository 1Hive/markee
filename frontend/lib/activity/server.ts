import 'server-only'
import { kv } from '@vercel/kv'
import { base } from 'viem/chains'
import { erc20Abi, type Address } from 'viem'
import { getModerationClient, readBoardOwners } from '@/lib/moderation/server'
import { STREAMING_BASE } from '@/lib/superfluid/streaming'
import type { ModerationItem } from '@/lib/moderation/queue'
import type { ActivityEvent } from '@/lib/activity/events'

export const activityKey = (wallet: string) => `activity:${base.id}:${wallet.toLowerCase()}`
// board → markee that was #1 at the last scan. A change between scans is a new winner.
const TOPS_KEY = `activity:tops:${base.id}`
export const MAX_EVENTS = 200
// Below this much ETHx, a stream that stopped ran out of balance rather than being cancelled:
// Superfluid closes a stream once its sender's balance is spent.
const RAN_OUT_BELOW = 10n ** 13n

export interface BoardTop {
  markee: string
  value: bigint
  // Every listed top message's funds (Sale) or rate (Rent), to tell an outbid from a stopped stream.
  values: Map<string, bigint>
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

  // Rent messages that lost #1 because their own rate fell to zero. Whether the owner still holds
  // ETHx tells a cancelled stream (balance left) from one that ran out (balance spent).
  const stoppedAuthors = [...new Set(changedTops.flatMap(([board, top]) => {
    const prev = seen.get(prevTops![board])
    return prev && streamingBoards.has(board) && (top.values.get(prevTops![board]) ?? 0n) === 0n ? [prev.author] : []
  }))].filter(Boolean)
  const balances = stoppedAuthors.length
    ? await getModerationClient().multicall({
        contracts: stoppedAuthors.map(w => ({ address: STREAMING_BASE.ethx as Address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [w as Address] })),
      }).catch(() => [])
    : []
  const ranOut = new Set(stoppedAuthors.filter((_, i) => {
    const r = balances[i]
    return r?.status === 'success' && (r.result as bigint) < RAN_OUT_BELOW
  }))

  for (const [board, top] of changedTops) {
    const now = seen.get(top.markee)
    const prevMarkee = prevTops![board]
    const prev = seen.get(prevMarkee)
    const text = { message: now?.message ?? '', name: now?.name ?? '' }
    push(now?.author, { kind: 'winning', side: 'buy', board, markee: top.markee, ...text })
    if (prev && prev.author !== now?.author) {
      // A Rent message whose rate is now zero lost the top spot because its own stream stopped, not
      // because someone bid more.
      const stopped = streamingBoards.has(board) && (top.values.get(prevMarkee) ?? 0n) === 0n
      const kind = !stopped ? 'outbid' : ranOut.has(prev.author) ? 'ran_out' : 'stopped'
      push(prev.author, { kind, side: 'buy', board, markee: prevMarkee, message: prev.message, name: prev.name })
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
