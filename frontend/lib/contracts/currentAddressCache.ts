import { kv } from '@vercel/kv'
import type { Address } from 'viem'
import { finishedBoardSuccessor, finishedMarkeeSuccessor } from '@/lib/contracts/migration'
import { createStreamingClient } from '@/lib/streaming/client'
import {
  currentAddressCacheSeconds, parseCurrentAddress, resolveCurrentAddress, type CurrentAddress,
} from '@/lib/contracts/currentAddress'

type BaseClient = Parameters<typeof finishedBoardSuccessor>[0]

const cacheKey = (address: string) => `cache:current-address:${address.toLowerCase()}`

export async function cachedCurrentAddress(address: Address, client: BaseClient = createStreamingClient()): Promise<CurrentAddress> {
  const cached = parseCurrentAddress(await kv.get(cacheKey(address)).catch(() => null))
  if (cached) return cached
  const resolution = await resolveCurrentAddress(address, {
    board: board => finishedBoardSuccessor(client, board),
    markee: markee => finishedMarkeeSuccessor(client, markee),
  })
  await kv.set(cacheKey(address), resolution, { ex: currentAddressCacheSeconds(resolution) }).catch(() => {})
  return resolution
}

export async function currentBoardOrSelf(address: Address, client?: BaseClient): Promise<Address> {
  const resolution = await cachedCurrentAddress(address, client).catch(() => null)
  return resolution?.kind === 'board' ? resolution.address : address
}
