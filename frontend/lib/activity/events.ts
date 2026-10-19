// Per-wallet activity events written by the moderation scan (see lib/activity/server.ts) and read by
// the /account Activity Feed. `own` events are about a board the wallet owns, `buy` events about a
// message the wallet owns.
export type ActivityKind = 'winning' | 'outbid' | 'new_top' | 'edited'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  side: 'own' | 'buy'
  board: string
  markee: string
  message: string
  name: string
  // new_top only: the new top's total funds (Sale) or wei/sec rate (Rent), as a decimal string.
  amount?: string
  streaming?: boolean
  at: number
}
