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
  // Sites only: unix seconds of the last view the site reported, or null if none since we started
  // recording it.
  lastView: Record<string, number | null>
}

// Whether a site's embed is reporting views. 'none': no view ever logged. 'stale': none for
// STALE_DAYS. GitHub files report through GitHub's own traffic, so they're always 'ok' here.
export type ViewReporting = 'ok' | 'none' | 'stale'
export const STALE_DAYS = 14

export function viewReporting(info: BoardIntegrations | null | undefined, key: string, now: number = Date.now()): ViewReporting {
  if (!info || !key.startsWith('u:') || !(key in info.views)) return 'ok'
  const last = info.lastView[key] ?? null
  if (last === null) return info.views[key] > 0 ? 'ok' : 'none'
  return now / 1000 - last > STALE_DAYS * 86_400 ? 'stale' : 'ok'
}

export function viewReportingTip(state: ViewReporting, last?: number | null): string | null {
  if (state === 'none') return "This embed hasn't logged any views yet"
  if (state === 'stale') return `This embed hasn't logged a view since ${new Date((last ?? 0) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  return null
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
