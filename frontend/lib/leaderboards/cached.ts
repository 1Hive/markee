import { NextResponse } from 'next/server'
import { createSnapshotCache, SnapshotUnavailable } from '@/lib/sdk/snapshot-cache'
import { snapshotStorage } from '@/lib/sdk/cached-display'

// Shared leases and fenced publication also cover forced refreshes. Normal loads
// reuse snapshots; post-transaction refreshes still request fresh chain state.
export async function cachedListing(request: Request, key: string, load: (request: Request) => Promise<NextResponse>, headers: Record<string, string>) {
  const url = new URL(request.url)
  const only = key === 'cache:streaming:leaderboards' ? url.searchParams.get('address')?.toLowerCase() : null
  url.searchParams.delete('address')
  type Payload = Record<string, unknown> & { leaderboards: { address?: string }[] }
  let fallback: Payload | undefined
  const respond = (data: Payload, stale = false) => NextResponse.json({ ...data,
    ...(only ? { leaderboards: data.leaderboards.filter(board => board.address?.toLowerCase() === only) } : {}),
    ...(stale ? { stale: true } : {}),
  }, { headers })
  try {
    const read = createSnapshotCache(snapshotStorage.get())
    const loadPayload = async () => {
        const response = await load(new Request(url, request))
        const data = await response.json()
        if (response.ok && data.stale && !data.error) fallback = data
        if (!response.ok || data.error || data.stale) throw new Error('Listing refresh failed')
        return data
    }
    // A post-transaction bust waits for a load that started after it arrived, so
    // a refresh already in flight cannot hand back pre-transaction state.
    let loadedAfter: number | false = url.searchParams.get('bust') === '1' ? Date.now() : false
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await read<Payload>(`listings:${key}`, loadPayload, 60, 300, loadedAfter)
        return respond(result.data, result.stale)
      } catch (error) {
        // A normal first page load should await the existing cold refresh rather
        // than render an empty account. Waiting never launches parallel RPC work.
        if (!(error instanceof SnapshotUnavailable) || error.retryAfter !== 2) throw error
        if (attempt >= 30) {
          if (loadedAfter === false) throw error
          loadedAfter = false
          continue
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  } catch (error) {
    // Preserve the streaming route's existing explicitly stale last-good fallback,
    // without publishing that old payload as a newly fresh snapshot.
    if (fallback) return respond(fallback, true)
    return NextResponse.json({ error: 'Leaderboards temporarily unavailable' }, {
      status: 503, headers: { ...headers, 'Retry-After': String(error instanceof SnapshotUnavailable ? error.retryAfter : 15) },
    })
  }
}
