import 'server-only'
import { snapshotStorage } from '@/lib/sdk/cached-display'

export const LISTING_ROUTES = ['openinternet', 'superfluid', 'github', 'forsale', 'streaming'] as const
type Route = typeof LISTING_ROUTES[number]
export type BoardListing = { leaderboards: { address: string; topMarkeeAddress?: string | null; strategy?: string }[] }
export const listingReaderDeps = {
  get: (key: string) => snapshotStorage.get().get<{ data: BoardListing; freshUntil: number; staleUntil: number }>(key),
  async load(route: Route) {
    // Only a cold/expired listing needs its shared loader; no HTTP self-call or bypass secret.
    const handlers = {
      openinternet: () => import('@/app/api/openinternet/leaderboards/route'),
      superfluid: () => import('@/app/api/superfluid/leaderboards/route'),
      github: () => import('@/app/api/github/leaderboards/route'),
      forsale: () => import('@/app/api/forsale/leaderboards/route'),
      streaming: () => import('@/app/api/streaming/leaderboards/route'),
    }
    const { GET } = await handlers[route]()
    return GET(new Request(`http://markee.internal/api/${route}/leaderboards`))
  },
}

export async function readListing(route: Route): Promise<BoardListing> {
  const cached = await listingReaderDeps.get(`sdk:snapshots:v1:listings:cache:${route}:leaderboards`)
  if (cached && cached.freshUntil > Date.now() && Array.isArray(cached.data?.leaderboards)) return cached.data
  const response = await listingReaderDeps.load(route)
  if (!response.ok) throw new Error(`Listing unavailable: ${route}`)
  const data = await response.json()
  if (!Array.isArray(data.leaderboards) || data.error) throw new Error(`Listing unavailable: ${route}`)
  return data
}
