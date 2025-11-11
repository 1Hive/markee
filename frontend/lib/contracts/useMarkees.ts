'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]
const CACHE_KEY = 'markees_cache'
const CACHE_DURATION = 1000 * 60 * 5 // 5 minutes
const MAX_BLOCK_RANGE = 10000n // Limit range to avoid RPC errors

// Deployment blocks for each chain
const DEPLOYMENT_BLOCKS = {
  [optimism.id]: 143559000n,
  [base.id]: 0n,
  [arbitrum.id]: 0n,
} as const

interface CacheData {
  markees: Markee[]
  timestamp: number
}

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingFresh, setIsFetchingFresh] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  const fetchMarkees = useCallback(async (showFetchingIndicator = true) => {
    try {
      if (showFetchingIndicator && markees.length > 0) {
        setIsFetchingFresh(true)
      } else {
        setIsLoading(true)
      }

      const allMarkees: Markee[] = []

      for (const chain of CHAINS) {
        const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
        if (!strategyAddress) continue

        const client = 
          chain.id === optimism.id ? opClient :
          chain.id === base.id ? baseClient :
          arbClient

        if (!client) continue

        try {
          const latestBlock = await client.getBlockNumber()
          const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id as keyof typeof DEPLOYMENT_BLOCKS]
          
          // Use deployment block if available, otherwise use a safe recent range
          const fromBlock = deploymentBlock || (latestBlock > MAX_BLOCK_RANGE ? latestBlock - MAX_BLOCK_RANGE : 0n)
          
          console.log(`Fetching ${chain.name} events from block ${fromBlock} to ${latestBlock}`)
          
          // Get MarkeeCreated events with name field (matches current InvestorStrategy.sol)
          const logs = await client.getLogs({
            address: strategyAddress,
            event: {
              type: 'event',
              name: 'MarkeeCreated',
              inputs: [
                { type: 'address', name: 'markeeAddress', indexed: true },
                { type: 'address', name: 'owner', indexed: true },
                { type: 'string', name: 'message' },
                { type: 'string', name: 'name' },
                { type: 'uint256', name: 'amount' }
              ]
            },
            fromBlock: fromBlock,
            toBlock: latestBlock
          })

          console.log(`Found ${logs.length} Markees on ${chain.name}`)

          // Fetch current data for each Markee
          for (const log of logs) {
            const { markeeAddress, owner } = log.args as any
            
            try {
              // Read current message, name, and totalFundsAdded from Markee contract
              const [message, name, totalFundsAdded] = await Promise.all([
                client.readContract({
                  address: markeeAddress,
                  abi: MarkeeABI,
                  functionName: 'message'
                }),
                client.readContract({
                  address: markeeAddress,
                  abi: MarkeeABI,
                  functionName: 'name'
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
                name: name as string,
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

      console.log(`Total Markees loaded: ${allMarkees.length}`)
      setMarkees(allMarkees)
      setError(null)
      
      const now = Date.now()
      setLastUpdated(new Date(now))

      // Save to cache
      try {
        const cacheData: CacheData = {
          markees: allMarkees,
          timestamp: now
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
      } catch (err) {
        console.error('Error saving cache:', err)
      }

    } catch (err) {
      console.error('Error fetching markees:', err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
      setIsFetchingFresh(false)
    }
  }, [opClient, baseClient, arbClient])

  // Load from cache on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      try {
        const { markees: cachedMarkees, timestamp }: CacheData = JSON.parse(cached)
        const age = Date.now() - timestamp
        
        if (age < CACHE_DURATION) {
          console.log('Using cached markees data')
          setMarkees(cachedMarkees)
          setLastUpdated(new Date(timestamp))
          setIsLoading(false)
          return
        }
      } catch (err) {
        console.error('Error loading cache:', err)
      }
    }
    
    fetchMarkees()
  }, [fetchMarkees])

  const refetch = useCallback(() => {
    fetchMarkees(true)
  }, [fetchMarkees])

  return { 
    markees, 
    isLoading, 
    isFetchingFresh,
    error, 
    lastUpdated,
    refetch 
  }
}
