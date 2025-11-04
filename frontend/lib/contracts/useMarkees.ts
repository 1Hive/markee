'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]

// Deployment blocks for InvestorStrategy contracts (to limit block range queries)
// These should be updated with actual deployment block numbers
const DEPLOYMENT_BLOCKS: Record<number, bigint> = {
  [optimism.id]: 140000000n, // Updated starting block
  [base.id]: 0n, // Not yet deployed
  [arbitrum.id]: 0n, // Not yet deployed
}

// Chunk size for fetching logs (number of blocks per request)
const BLOCK_CHUNK_SIZE = 10000n

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Get public clients for all chains
  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  useEffect(() => {
    async function fetchMarkees() {
      try {
        setIsLoading(true)
        const allMarkees: Markee[] = []

        // Fetch from each chain
        for (const chain of CHAINS) {
          const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
          if (!strategyAddress) continue

          const client = 
            chain.id === optimism.id ? opClient :
            chain.id === base.id ? baseClient :
            arbClient

          if (!client) continue

          const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id]
          if (!deploymentBlock || deploymentBlock === 0n) continue

          try {
            // Get current block number
            const currentBlock = await client.getBlockNumber()
            
            // Fetch logs in chunks to avoid "block range too large" errors
            const allLogs = []
            let fromBlock = deploymentBlock
            
            while (fromBlock <= currentBlock) {
              const toBlock = fromBlock + BLOCK_CHUNK_SIZE > currentBlock 
                ? currentBlock 
                : fromBlock + BLOCK_CHUNK_SIZE

              try {
                const logs = await client.getLogs({
                  address: strategyAddress,
                  event: {
                    type: 'event',
                    name: 'MarkeeCreated',
                    inputs: [
                      { type: 'address', name: 'markeeAddress', indexed: true },
                      { type: 'address', name: 'owner', indexed: true },
                      { type: 'string', name: 'message' },
                      { type: 'uint256', name: 'amount' }
                    ]
                  },
                  fromBlock,
                  toBlock
                })
                
                allLogs.push(...logs)
              } catch (chunkError) {
                console.error(`Error fetching logs from ${fromBlock} to ${toBlock}:`, chunkError)
              }

              fromBlock = toBlock + 1n
            }

            // For each Markee, fetch current data
            for (const log of allLogs) {
              const { markeeAddress, owner } = log.args as any
              
              try {
                // Read current message and totalFundsAdded from Markee contract
                const [message, totalFundsAdded] = await Promise.all([
                  client.readContract({
                    address: markeeAddress,
                    abi: MarkeeABI,
                    functionName: 'message'
                  }),
                  client.readContract({
                    address: markeeAddress,
                    abi: MarkeeABI,
                    functionName: 'totalFundsAdded'
                  })
                ])

                allMarkees.push({
                  address: markeeAddress,
                  owner,
                  message: message as string,
                  totalFundsAdded: totalFundsAdded as bigint,
                  chainId: chain.id,
                  pricingStrategy: strategyAddress
                })
              } catch (err) {
                console.error(`Error fetching Markee ${markeeAddress} data:`, err)
              }
            }
          } catch (err) {
            console.error(`Error fetching events from ${chain.name}:`, err)
          }
        }

        // Sort by totalFundsAdded (descending)
        allMarkees.sort((a, b) => {
          if (a.totalFundsAdded > b.totalFundsAdded) return -1
          if (a.totalFundsAdded < b.totalFundsAdded) return 1
          return 0
        })

        setMarkees(allMarkees)
        setError(null)
      } catch (err) {
        console.error('Error fetching markees:', err)
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMarkees()
  }, [opClient, baseClient, arbClient])

  return { markees, isLoading, error }
}
