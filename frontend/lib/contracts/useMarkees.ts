'use client'

import { useEffect, useState } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]

// Actual deployment blocks - when the InvestorStrategy contracts were deployed
const DEPLOYMENT_BLOCKS: Record<number, bigint> = {
  [optimism.id]: 128466300n, // Contract deployed at ~128466300, first Markee at 128466355
  [base.id]: 0n,
  [arbitrum.id]: 0n,
}

const MAX_BLOCK_RANGE = 50000n // Can use larger chunks now since we're searching less
const DELAY_BETWEEN_CHUNKS = 300 // Shorter delay since we have fewer chunks

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { address } = useAccount()

  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!opClient && !baseClient && !arbClient) {
        console.log('Waiting for clients...')
        return
      }

      try {
        console.log('Starting fetch...')
        setIsLoading(true)
        const allMarkees: Markee[] = []

        for (const chain of CHAINS) {
          if (!mounted) return

          const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
          if (!strategyAddress) {
            console.log(`No contract on ${chain.name}`)
            continue
          }

          const client = 
            chain.id === optimism.id ? opClient :
            chain.id === base.id ? baseClient :
            arbClient

          if (!client) {
            console.log(`No client for ${chain.name}`)
            continue
          }

          console.log(`Fetching from ${chain.name}`)

          try {
            const currentBlock = await client.getBlockNumber()
            const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id] || 0n
            
            const blocksToSearch = currentBlock - deploymentBlock
            console.log(`Searching ${blocksToSearch} blocks (${deploymentBlock} to ${currentBlock})`)

            const allLogs = []
            let fromBlock = deploymentBlock
            let chunkCount = 0
            
            while (fromBlock < currentBlock && mounted) {
              const toBlock = fromBlock + MAX_BLOCK_RANGE > currentBlock 
                ? currentBlock 
                : fromBlock + MAX_BLOCK_RANGE

              console.log(`Chunk ${chunkCount + 1}: blocks ${fromBlock}-${toBlock}`)

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
                  console.log(`✓ Found ${logs.length} Markee(s)`)
                }

                chunkCount++
                // Add delay if we need more chunks
                if (fromBlock + MAX_BLOCK_RANGE < currentBlock) {
                  await delay(DELAY_BETWEEN_CHUNKS)
                }
              } catch (err: any) {
                console.error(`✗ Chunk error:`, err.message)
                // If rate limited, wait longer
                if (err.message.includes('429') || err.message.includes('rate')) {
                  console.log('Rate limited, waiting 2s...')
                  await delay(2000)
                }
              }

              fromBlock = toBlock + 1n
            }

            console.log(`Total events on ${chain.name}: ${allLogs.length}`)

            // Fetch current state for each Markee
            for (const log of allLogs) {
              if (!mounted) return

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

                console.log(`✓ Loaded: "${message}"`)
              } catch (err: any) {
                console.error(`✗ Failed to read Markee ${markeeAddress}:`, err.message)
              }
            }
          } catch (err: any) {
            console.error(`✗ Error on ${chain.name}:`, err.message)
          }
        }

        if (!mounted) return

        // Sort by funds (descending)
        allMarkees.sort((a, b) => {
          if (a.totalFundsAdded > b.totalFundsAdded) return -1
          if (a.totalFundsAdded < b.totalFundsAdded) return 1
          return 0
        })

        console.log(`✅ Loaded ${allMarkees.length} Markee(s)`)
        setMarkees(allMarkees)
        setError(null)
      } catch (err: any) {
        console.error('💥 Fatal error:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [opClient, baseClient, arbClient])

  const userMarkee = address 
    ? markees.find((m) => m.owner.toLowerCase() === address.toLowerCase())
    : null

  return { markees, userMarkee, isLoading, error }
}
