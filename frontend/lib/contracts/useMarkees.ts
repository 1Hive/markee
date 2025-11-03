'use client'

import { useEffect, useState } from 'react'
import { usePublicClient, useAccount, useBlockNumber } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]

// Known deployment blocks
const DEPLOYMENT_BLOCKS: Record<number, bigint> = {
  [optimism.id]: 128400000n,
  [base.id]: 0n,
  [arbitrum.id]: 0n,
}

const MAX_BLOCK_RANGE = 10000n

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { address, chain } = useAccount()

  // Get public clients
  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  // Watch for new blocks to trigger refresh
  const { data: blockNumber } = useBlockNumber({ 
    chainId: chain?.id,
    watch: true,
    cacheTime: 10_000 
  })

  useEffect(() => {
    let isMounted = true

    async function fetchMarkees() {
      // Don't fetch if clients aren't ready
      if (!opClient && !baseClient && !arbClient) {
        console.log('Waiting for clients to initialize...')
        return
      }

      try {
        setIsLoading(true)
        setError(null)
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
            const currentBlock = await client.getBlockNumber()
            const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id] || 0n
            
            console.log(`Fetching Markees from ${chain.name}`)
            console.log(`Current block: ${currentBlock}, Deployment: ${deploymentBlock}`)

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

                if (logs.length > 0) {
                  allLogs.push(...logs)
                  console.log(`Found ${logs.length} Markees in chunk ${fromBlock}-${toBlock}`)
                }
              } catch (chunkError: any) {
                console.error(`Error fetching chunk ${fromBlock}-${toBlock}:`, chunkError.message)
              }

              fromBlock = toBlock + 1n
            }

            console.log(`Total events found on ${chain.name}: ${allLogs.length}`)

            // Fetch current data for each Markee
            for (const log of allLogs) {
              if (!isMounted) return

              const { markeeAddress, owner } = log.args as any
              
              try {
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

                console.log(`✓ Loaded: ${markeeAddress} - "${message}"`)
              } catch (err: any) {
                console.error(`Error fetching Markee ${markeeAddress}:`, err.message)
              }
            }
          } catch (err: any) {
            console.error(`Error fetching from ${chain.name}:`, err.message)
          }
        }

        if (!isMounted) return

        // Sort by totalFundsAdded (descending)
        allMarkees.sort((a, b) => {
          if (a.totalFundsAdded > b.totalFundsAdded) return -1
          if (a.totalFundsAdded < b.totalFundsAdded) return 1
          return 0
        })

        console.log(`✅ Total Markees loaded: ${allMarkees.length}`)
        setMarkees(allMarkees)
        setError(null)
      } catch (err: any) {
        console.error('❌ Error fetching markees:', err)
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
  }, [opClient, baseClient, arbClient, blockNumber]) // Refetches when new blocks arrive

  // Find current user's Markee
  const userMarkee = address 
    ? markees.find((markee) => markee.owner.toLowerCase() === address.toLowerCase())
    : null

  return { 
    markees, 
    userMarkee: userMarkee || null, 
    isLoading, 
    error
  }
}
