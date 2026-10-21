// A board's featured integration: the site or GitHub file shown first wherever the board appears
// (its public page, the Marketplace, the dashboard). The owner can pick one; otherwise it's the
// integration with the most views. /api/boards/integrations works it out, so every page agrees.

export const fileIntegrationKey = (f: { repoFullName: string; filePath: string }) => `f:${f.repoFullName}/${f.filePath}`
export const urlIntegrationKey = (url: string) => `u:${url}`

export interface BoardIntegrations {
  // Key of the featured integration, or null when the board has none.
  featured: string | null
  // True when the owner picked it, false when it's the most viewed.
  chosen: boolean
  // Views per integration key.
  views: Record<string, number>
}

// Signed by a board owner to pick its featured integration (key) or go back to most viewed (null).
export function featuredIntegrationMessage(chainId: number | string, board: string, key: string | null, timestamp: number): string {
  return `markee-featured:${chainId}:${board.toLowerCase()}:${key ?? 'most-viewed'}:${timestamp}`
}

// Featured first, then by views; ties keep the given order.
export function orderIntegrations<T>(items: T[], keyOf: (item: T) => string, info: BoardIntegrations | null | undefined): T[] {
  if (!info) return items
  const rank = (item: T) => keyOf(item) === info.featured ? Infinity : info.views[keyOf(item)] ?? 0
  return items.map((item, i) => ({ item, i })).sort((a, b) => rank(b.item) - rank(a.item) || a.i - b.i).map(x => x.item)
}
