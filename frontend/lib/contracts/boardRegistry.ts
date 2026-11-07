'use client'

import { useReadContracts } from 'wagmi'
import { isAddress, parseAbi, type Address, type PublicClient } from 'viem'
import { CANONICAL_CHAIN_ID, FACTORIES, STREAMING_FACTORY } from '@/lib/contracts/addresses'

const PRODUCTION_STREAMING_FACTORY = '0x37f420fdE5c98e611EB7cb9b74ef579D84697039'

export const BOARD_FACTORIES: Address[] = [...new Set(
  [...Object.values(FACTORIES), PRODUCTION_STREAMING_FACTORY, STREAMING_FACTORY]
    .filter(a => isAddress(a))
    .map(a => a.toLowerCase()),
)] as Address[]

const FACTORY_ABI = parseAbi(['function isFactoryLeaderboard(address) view returns (bool)'])

export type BoardTrust = 'loading' | 'trusted' | 'untrusted' | 'unavailable'

export function boardTrustFrom(reads: readonly { status: 'success' | 'failure'; result?: unknown }[] | undefined): BoardTrust {
  if (!reads) return 'loading'
  if (reads.some(r => r.status === 'success' && r.result === true)) return 'trusted'
  if (reads.every(r => r.status === 'success')) return 'untrusted'
  return 'unavailable'
}

export function useBoardTrust(board: string | undefined) {
  const enabled = !!board && isAddress(board)
  const { data, isError, refetch } = useReadContracts({
    contracts: BOARD_FACTORIES.map(factory => ({
      address: factory, abi: FACTORY_ABI, functionName: 'isFactoryLeaderboard' as const,
      args: [(enabled ? board : '0x0000000000000000000000000000000000000000') as Address], chainId: CANONICAL_CHAIN_ID,
    })),
    query: { enabled, staleTime: 5 * 60_000 },
  })
  const trust: BoardTrust = !enabled ? 'untrusted' : isError ? 'unavailable' : boardTrustFrom(data)
  return { trust, refetch }
}

const MARKEE_IMPLEMENTATION_ABI = parseAbi(['function markeeImplementation() view returns (address)'])

export function minimalProxyCode(implementation: Address): string {
  return `0x363d3d373d3d3d363d73${implementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`
}

export async function isBoardCreatedMarkee(client: PublicClient, board: Address, markee: Address): Promise<boolean> {
  const [implementation, code] = await Promise.all([
    client.readContract({ address: board, abi: MARKEE_IMPLEMENTATION_ABI, functionName: 'markeeImplementation' }),
    client.getCode({ address: markee }),
  ])
  return !!code && code.toLowerCase() === minimalProxyCode(implementation)
}
