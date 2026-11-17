import { isAddress, zeroAddress, type Address } from 'viem'

export type CurrentAddressKind = 'board' | 'markee' | 'unchanged'
export type CurrentAddress = { address: Address; kind: CurrentAddressKind }

export type SuccessorLookups = {
  board: (address: Address) => Promise<Address | null>
  markee: (address: Address) => Promise<Address | null>
}

export const RESOLVED_CACHE_SECONDS = 60 * 60 * 24 * 365
export const UNCHANGED_CACHE_SECONDS = 60

function isSuccessor(address: Address | null): address is Address {
  return !!address && address !== zeroAddress
}

export async function resolveCurrentAddress(address: Address, lookups: SuccessorLookups): Promise<CurrentAddress> {
  const [board, markee] = await Promise.all([lookups.board(address), lookups.markee(address)])
  if (isSuccessor(board)) return { address: board, kind: 'board' }
  if (isSuccessor(markee)) return { address: markee, kind: 'markee' }
  return { address, kind: 'unchanged' }
}

export function currentAddressCacheSeconds(resolution: CurrentAddress): number {
  return resolution.kind === 'unchanged' ? UNCHANGED_CACHE_SECONDS : RESOLVED_CACHE_SECONDS
}

export function parseCurrentAddress(value: unknown): CurrentAddress | null {
  if (!value || typeof value !== 'object') return null
  const { address, kind } = value as Record<string, unknown>
  if (typeof address !== 'string' || !isAddress(address)) return null
  if (kind !== 'board' && kind !== 'markee' && kind !== 'unchanged') return null
  return { address, kind }
}

export function redirectTarget(requested: string, resolution: CurrentAddress | null): Address | null {
  if (!resolution || resolution.kind === 'unchanged') return null
  return resolution.address.toLowerCase() === requested.toLowerCase() ? null : resolution.address
}
