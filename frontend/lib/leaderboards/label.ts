import { normalizeHost } from '@/lib/views/host'

export interface LabelledBoard {
  name?: string | null
  leaderboardName?: string | null
  verifiedUrl?: string | null
  verifiedUrls?: readonly string[] | null
  linkedFiles?: readonly { verified: boolean; repoFullName: string }[] | null
}

// Where a board is embedded: its first verified site's host, else its verified GitHub repo.
export function homeSite(board: LabelledBoard): string | null {
  const url = board.verifiedUrls?.[0] || board.verifiedUrl
  if (url) return normalizeHost(url) ?? url
  return board.linkedFiles?.find(f => f.verified)?.repoFullName ?? null
}

// The creator's name only helps them recognize a board before its embed is verified. Once it is,
// the board is referred to by its home site.
export function boardLabel(board: LabelledBoard, fallback = ''): string {
  return homeSite(board) ?? (board.name || board.leaderboardName || fallback)
}
