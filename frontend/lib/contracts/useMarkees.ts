'use client'

import { useEffect, useState } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]

// Known deployment blocks (update these as contracts are deployed)
const DEPLOYMENT_BLOCKS: Record<number, bigint> = {
  [optimism.id]: 128400000n, // Approximate deployment block on Optimism
  [base.id]: 0n,
  [arbitrum.id]: 0n,
}

// Maximum blocks to query at once (conservative for public RPCs)
const MAX_BLOCK_RANGE = 10000n

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { address } = useAccount()

  // Get public clients for all chains
  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  useEffect(() => {
    let isMounted = true

    async function fetchMarkees() {
      try {
        setIsLoading(true)
        const allMarkees: Markee[] = []

        // Fetch from each chain
        for (const chain of CHAINS) {
          if (!isMounted) return

          const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
          if (!strategyAddress) {
            console.log(`No InvestorStrategy deployed on ${chain.name}`)
            continue
          }

          const client = 
            chain.id === optimism.id ? opClient :
            chain.id === base.id ? baseClient :
            arbClient

          if (!client) {
            console.log(`No client available for ${chain.name}`)
            continue
          }

          try {
            // Get current block
            const currentBlock = await client.getBlockNumber()
            const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id] || 0n
            
            console.log(`Fetching Markees from ${chain.name}`)
            console.log(`Current block: ${currentBlock}`)
            console.log(`Deployment block: ${deploymentBlock}`)

            // Query in chunks to avoid "block range too large" errors
            const allLogs = []
            let fromBlock = deploymentBlock
            
            while (fromBlock < currentBlock && isMounted) {
              const toBlock = fromBlock + MAX_BLOCK_RANGE > currentBlock 
                ? currentBlock 
                : fromBlock + MAX_BLOCK_RANGE

              console.log(`Querying blocks ${fromBlock} to ${toBlock}`)

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
                console.log(`Found ${logs.length} Markees in this chunk`)
              } catch (chunkError: any) {
                console.error(`Error fetching chunk ${fromBlock}-${toBlock}:`, chunkError)
              }

              fromBlock = toBlock + 1n
            }

            console.log(`Total events found on ${chain.name}: ${allLogs.length}`)

            // For each Markee, fetch current data
            for (const log of allLogs) {
              if (!isMounted) return

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

                console.log(`Loaded Markee ${markeeAddress}: "${message}"`)
              } catch (err) {
                console.error(`Error fetching Markee ${markeeAddress} data:`, err)
              }
            }
          } catch (err) {
            console.error(`Error fetching events from ${chain.name}:`, err)
          }
        }

        if (!isMounted) return

        // Sort by totalFundsAdded (descending)
        allMarkees.sort((a, b) => {
          if (a.totalFundsAdded > b.totalFundsAdded) return -1
          if (a.totalFundsAdded < b.totalFundsAdded) return 1
          return 0
        })

        console.log(`Total Markees loaded: ${allMarkees.length}`)
        setMarkees(allMarkees)
        setError(null)
      } catch (err) {
        console.error('Error fetching markees:', err)
        if (isMounted) {
          setError(err as Error)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchMarkees()

    return () => {
      isMounted = false
    }
  }, [opClient, baseClient, arbClient, refreshTrigger])

  // Find the current user's Markee
  const userMarkee = address 
    ? markees.find((markee) => markee.owner.toLowerCase() === address.toLowerCase())
    : null

  // Refetch function that triggers the effect
  const refetch = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return { 
    markees, 
    userMarkee: userMarkee || null, 
    isLoading, 
    error,
    refetch
  }
}
