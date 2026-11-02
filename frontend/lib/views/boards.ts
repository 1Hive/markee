// How many views a board has, the same everywhere (dashboard, create-flow totals, Best Buys).
//
// Views are counted per message: the board page and embeds report the top message's address. Older
// boards were counted under the board's own address. So a board's views are the sum of its board key
// and its current top message's key. (Views a message earned while it was #1 stay with that message,
// so a board's count does not include messages that were on top before.)
//
// The home page's network total is a separate counter (views:network:total) bumped on every counted
// view, so it already includes everything.

import { kv } from '@vercel/kv'

export const viewsKey = (address: string) => `views:total:${address.toLowerCase()}`

export interface ViewedBoard { address: string; topMarkeeAddress?: string | null }

export function boardViewKeys(board: ViewedBoard): string[] {
  return [...new Set([board.address, board.topMarkeeAddress].filter((a): a is string => !!a).map(viewsKey))]
}

// board address (lowercase) -> views, in one KV read.
export async function readBoardViews(boards: ViewedBoard[]): Promise<Map<string, number>> {
  const keys = [...new Set(boards.flatMap(boardViewKeys))]
  if (keys.length === 0) return new Map()
  const counts = await kv.mget<(number | null)[]>(...keys)
  const byKey = new Map(keys.map((k, i) => [k, Number(counts[i] ?? 0)]))
  return new Map(boards.map(b => [b.address.toLowerCase(), boardViewKeys(b).reduce((sum, k) => sum + (byKey.get(k) ?? 0), 0)]))
}
