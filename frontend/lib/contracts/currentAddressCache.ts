import { kv } from '@vercel/kv'
import type { Address } from 'viem'
import { finishedBoardSuccessor, finishedMarkeeSuccessor } from '@/lib/contracts/migration'
import { createStreamingClient } from '@/lib/streaming/client'
import {
  currentAddressCacheSeconds, parseCurrentAddress, resolveCurrentAddress, type CurrentAddress,
} from '@/lib/contracts/currentAddress'

type BaseClient = Parameters<typeof finishedBoardSuccessor>[0]

const cacheKey = (address: string) => `cache:current-address:${address.toLowerCase()}`
const MEMORY_LIMIT = 5_000
const memory = new Map<string, { resolution: CurrentAddress; expires: number }>()

function remember(address: Address, resolution: CurrentAddress) {
  if (memory.size >= MEMORY_LIMIT) for (const oldest of [...memory.keys()].slice(0, MEMORY_LIMIT / 5)) memory.delete(oldest)
  memory.set(address.toLowerCase(), { resolution, expires: Date.now() + currentAddressCacheSeconds(resolution) * 1000 })
}

export async function cachedCurrentAddress(address: Address, client: BaseClient = createStreamingClient()): Promise<CurrentAddress> {
  const hit = memory.get(address.toLowerCase())
  if (hit && hit.expires > Date.now()) return hit.resolution
  const cached = parseCurrentAddress(await kv.get(cacheKey(address)).catch(() => null))
  if (cached) {
    remember(address, cached)
    return cached
  }
  const resolution = await resolveCurrentAddress(address, {
    board: board => finishedBoardSuccessor(client, board),
    markee: markee => finishedMarkeeSuccessor(client, markee),
  })
  await kv.set(cacheKey(address), resolution, { ex: currentAddressCacheSeconds(resolution) }).catch(() => {})
  remember(address, resolution)
  return resolution
}

export async function currentBoardOrSelf(address: Address, client?: BaseClient): Promise<Address> {
  const resolution = await cachedCurrentAddress(address, client).catch(() => null)
  return resolution?.kind === 'board' ? resolution.address : address
}
