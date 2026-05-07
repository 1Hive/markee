'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MarkeeABI, LeaderboardV11ABI } from '@/lib/contracts/abis'
import type { Markee, FundsAdded, MessageUpdate, NameUpdate } from '@/types'

export interface MarkeeDetail extends Markee {
  createdAt: number
  createdAtBlock: number
  updatedAt: number
  updatedAtBlock: number
  fundsAddedCount: number
  messageUpdateCount: number
  nameUpdateCount: number
  fundsAddedEvents: FundsAdded[]
  messageUpdates: MessageUpdate[]
  nameUpdates: NameUpdate[]
  strategyName?: string
  strategyId?: string
  isPartnerStrategy: boolean
  partnerBeneficiary?: string
  partnerPercentage?: number
}

const FUNDS_ADDED = parseAbiItem(
  'event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)'
)
const MESSAGE_CHANGED = parseAbiItem(
  'event MessageChanged(string newMessage, address indexed changedBy)'
)
const NAME_CHANGED = parseAbiItem(
  'event NameChanged(string newName, address indexed changedBy)'
)

export function useMarkeeDetail(markeeAddress: string | undefined) {
  const [markee, setMarkee] = useState<MarkeeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const client = usePublicClient({ chainId: CANONICAL_CHAIN_ID })

  useEffect(() => {
    if (!markeeAddress || !client) {
      setIsLoading(false)
      return
    }

    async function fetchDetail() {
      try {
        setIsLoading(true)
        setError(null)

        const addr = markeeAddress as `0x${string}`

        // Parallel: read current state + event history
        const [multicallResults, fundsLogs, messageLogs, nameLogs] = await Promise.all([
          client!.multicall({
            contracts: [
              { address: addr, abi: MarkeeABI, functionName: 'message' },
              { address: addr, abi: MarkeeABI, functionName: 'name' },
              { address: addr, abi: MarkeeABI, functionName: 'owner' },
              { address: addr, abi: MarkeeABI, functionName: 'pricingStrategy' },
              { address: addr, abi: MarkeeABI, functionName: 'totalFundsAdded' },
            ],
          }),
          client!.getLogs({ address: addr, event: FUNDS_ADDED, fromBlock: 0n, toBlock: 'latest' }),
          client!.getLogs({ address: addr, event: MESSAGE_CHANGED, fromBlock: 0n, toBlock: 'latest' }),
          client!.getLogs({ address: addr, event: NAME_CHANGED, fromBlock: 0n, toBlock: 'latest' }),
        ])

        const message = (multicallResults[0]?.result as string) ?? ''
        const name = (multicallResults[1]?.result as string) ?? ''
        const owner = (multicallResults[2]?.result as string) ?? ''
        const pricingStrategy = (multicallResults[3]?.result as string) ?? ''
        const totalFundsAdded = (multicallResults[4]?.result as bigint) ?? 0n

        // Fetch block timestamps for all unique blocks
        const allBlockNumbers = [
          ...fundsLogs.map(l => l.blockNumber),
          ...messageLogs.map(l => l.blockNumber),
          ...nameLogs.map(l => l.blockNumber),
        ].filter((n): n is bigint => n !== null)

        const uniqueBlocks = [...new Set(allBlockNumbers.map(String))].map(BigInt)
        const blockTimestamps = new Map<string, number>()

        if (uniqueBlocks.length > 0) {
          const blocks = await Promise.all(
            uniqueBlocks.map(n => client!.getBlock({ blockNumber: n }))
          )
          blocks.forEach(b => { blockTimestamps.set(b.number.toString(), Number(b.timestamp)) })
        }

        const ts = (blockNumber: bigint | null) =>
          blockNumber ? (blockTimestamps.get(blockNumber.toString()) ?? 0) : 0

        // Fetch leaderboard name
        let strategyName: string | undefined
        if (pricingStrategy) {
          try {
            const lbName = await client!.readContract({
              address: pricingStrategy as `0x${string}`,
              abi: LeaderboardV11ABI,
              functionName: 'leaderboardName',
            })
            strategyName = lbName as string
          } catch { /* skip if not a v1.1 leaderboard */ }
        }

        const allEvents = [...fundsLogs, ...messageLogs, ...nameLogs]
        const allBlockNums = allEvents.map(l => l.blockNumber).filter((n): n is bigint => n !== null)
        const firstBlock = allBlockNums.length ? allBlockNums.reduce((a, b) => a < b ? a : b) : 0n
        const lastBlock = allBlockNums.length ? allBlockNums.reduce((a, b) => a > b ? a : b) : 0n
        const createdAtBlock = Number(firstBlock)
        const updatedAtBlock = Number(lastBlock)
        const createdAt = firstBlock ? (blockTimestamps.get(firstBlock.toString()) ?? 0) : 0
        const updatedAt = lastBlock ? (blockTimestamps.get(lastBlock.toString()) ?? 0) : 0

        const fundsAddedEvents: FundsAdded[] = fundsLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          markee: addr,
          addedBy: ((log.args as any).addedBy as string) ?? '',
          amount: ((log.args as any).amount as bigint) ?? 0n,
          newTotal: ((log.args as any).newTotal as bigint) ?? 0n,
          timestamp: BigInt(ts(log.blockNumber)),
          blockNumber: log.blockNumber ?? 0n,
          transactionHash: log.transactionHash ?? '',
        })).reverse()

        const messageUpdates: MessageUpdate[] = messageLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          markee: addr,
          updatedBy: ((log.args as any).changedBy as string) ?? '',
          oldMessage: '',
          newMessage: ((log.args as any).newMessage as string) ?? '',
          timestamp: BigInt(ts(log.blockNumber)),
          blockNumber: log.blockNumber ?? 0n,
          transactionHash: log.transactionHash ?? '',
        })).reverse()

        const nameUpdates: NameUpdate[] = nameLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          markee: addr,
          updatedBy: ((log.args as any).changedBy as string) ?? '',
          oldName: '',
          newName: ((log.args as any).newName as string) ?? '',
          timestamp: BigInt(ts(log.blockNumber)),
          blockNumber: log.blockNumber ?? 0n,
          transactionHash: log.transactionHash ?? '',
        })).reverse()

        setMarkee({
          address: addr,
          owner,
          message,
          name,
          totalFundsAdded,
          pricingStrategy,
          chainId: CANONICAL_CHAIN_ID,
          createdAt,
          createdAtBlock,
          updatedAt,
          updatedAtBlock,
          fundsAddedCount: fundsLogs.length,
          messageUpdateCount: messageLogs.length,
          nameUpdateCount: nameLogs.length,
          fundsAddedEvents,
          messageUpdates,
          nameUpdates,
          strategyName,
          strategyId: pricingStrategy,
          isPartnerStrategy: !!pricingStrategy,
          partnerPercentage: 100,
        })
      } catch (err) {
        console.error('[useMarkeeDetail] error:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetail()
  }, [markeeAddress, client])

  return { markee, isLoading, error }
}
