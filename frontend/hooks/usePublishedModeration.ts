'use client'
import { useQuery } from '@tanstack/react-query'
import { useModeration } from '@/components/moderation/ModerationProvider'
import type { PublishedModeration } from '@/lib/moderation/automatic'

type Waiting = { id: string; resolve: (item: PublishedModeration) => void; reject: (error: Error) => void }
let waiting: Waiting[] = []
let scheduled = false
function load(id: string): Promise<PublishedModeration> {
  return new Promise((resolve, reject) => {
    waiting.push({ id, resolve, reject })
    if (scheduled) return
    scheduled = true
    setTimeout(async () => {
      scheduled = false
      const batch = waiting; waiting = []
      for (let i = 0; i < batch.length; i += 50) {
        const slice = batch.slice(i, i + 50)
        try {
          const response = await fetch('/api/moderation/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'published', chainId: 8453, markeeIds: [...new Set(slice.map(w => w.id))] }) })
          if (!response.ok) throw new Error('Moderation check unavailable')
          const body = await response.json()
          for (const w of slice) {
            const item = body.items?.find((r: PublishedModeration) => r.markee === w.id)
            if (item && ['visible', 'manual-flagged', 'soft-flagged', 'unavailable'].includes(item.siteState)) w.resolve(item)
            else w.reject(new Error('Moderation check unavailable'))
          }
        } catch { slice.forEach(w => w.reject(new Error('Moderation check unavailable'))) }
      }
    }, 50)
  })
}
async function hashText(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('')
}

export async function matchesPublishedRevision(
  verdict: Pick<PublishedModeration, 'contentHash' | 'nameHash'>,
  message: string,
  name?: string,
) {
  return await hashText(message) === verdict.contentHash &&
    (name === undefined || await hashText(name) === verdict.nameHash)
}

export function usePublishedModeration(chainId: number | string, id: string, message?: string, name?: string) {
  const { autoModerationEnabled } = useModeration()
  const query = useQuery({
    queryKey: ['message-moderation', chainId, id.toLowerCase(), message, name],
    enabled: autoModerationEnabled === true && Number(chainId) === 8453 && /^0x[0-9a-f]{40}$/i.test(id) && message !== undefined,
    queryFn: async () => {
      const result = await load(id.toLowerCase())
      if (!await matchesPublishedRevision(result, message!, name)) {
        throw new Error('Message or author name changed; refreshing moderation')
      }
      return result
    },
    staleTime: 10000,
    refetchInterval: 30000,
    retry: 1,
  })
  return { data: autoModerationEnabled ? query.data : undefined, unavailable: autoModerationEnabled === null || autoModerationEnabled === true && (!query.data || query.isError || query.data.siteState === 'unavailable') }
}
