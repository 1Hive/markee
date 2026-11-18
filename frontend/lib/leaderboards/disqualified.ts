// lib/leaderboards/disqualified.ts
//
// Boards Markee has disqualified, for any reason: gaming (e.g. recycled ETH inflating totals),
// inappropriate content or other abuse. A disqualified board stays reachable at its own page and in
// the Marketplace list (sorted last), but never counts toward platform totals, never takes a
// featured or top spot, and never qualifies for campaigns such as /1hive. Keyed by the board's
// original (pre-migration) address, lowercase. Add an entry and deploy to disqualify a board.

export const DISQUALIFIED_BOARDS: ReadonlyMap<string, string> = new Map([
  ['0x1b4eb52953d865e0dde1c856c2ead826581e2904', 'Vivek wants to play: recycled ETH (120 ETH)'],
  ['0xb5451c1cb790367d0ddbcbf1249de22b9014ecdc', '@betonbangers: recycled ETH (85 ETH)'],
  ['0x4e413915c0c1d86084e8dcb36d4dec6b66b45a24', 'Banger: recycled ETH (34 ETH)'],
  ['0x762c0484599d6a75636cc8cffd9fcb23793dc582', 'Aeshii: recycled ETH (9 ETH)'],
  ['0x8578915859912888407f72f102761b7d21b2e702', 'My Sup Project: recycled ETH (8 ETH)'],
  ['0x566f89accd7e6a497e7b4c9f7992f1fe67e564cb', 'Ggh: recycled ETH (4 ETH)'],
  ['0x1be900ecc09edd0590db88723dbcb3b1fea22fe3', 'Gyralis is coming: recycled ETH (2 ETH)'],
  ['0xe3ee8c369dc37e478bc4b0e7fbbecce5f1dc089f', 'Bfhh: recycled ETH (2 ETH)'],
  ['0x097b06f778ae2fb32a9a4251ccf04fdbebf3733c', 'Bangerrrd: recycled ETH (2 ETH)'],
  ['0x774d8d9ce01151fc5189c13e362f5061dab0fd8f', 'billionaire0x: recycled ETH (2 ETH)'],
  ['0x122140b7714a2aa4507d7742a28d0fd71117a729', 'Jgfjj: recycled ETH (2 ETH)'],
  ['0x4ad89044f5f3f324935747a4bce7ba7954d2aaa4', 'Gvv: recycled ETH (2 ETH)'],
  ['0xc936a036b7727865a696398de30f616be98e266b', 'Sup: recycled ETH (2 ETH)'],
])

export const isDisqualifiedBoard = (originalAddress: string) => DISQUALIFIED_BOARDS.has(originalAddress.toLowerCase())
