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

// Deployment blocks for each chain to avoid querying from 'earliest'
const DEPLOYMENT_BLOCKS = {
  [optimism.id]: 143559000n, // Update with actual deployment block
  [base.id]: 0n, // Update when deployed
  [arbitrum.id]: 0n, // Update when deployed
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

  // Get public clients for all chains
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

      // Fetch from each chain
      for (const chain of CHAINS) {
        const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
        if (!strategyAddress) continue

        const client = 
          chain.id === optimism.id ? opClient :
          chain.id === base.id ? baseClient :
          arbClient

        if (!client) continue

        try {
          const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id as keyof typeof DEPLOYMENT_BLOCKS]
          
          // Get MarkeeCreated events from deployment block onwards
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
            fromBlock: deploymentBlock || 'earliest',
            toBlock: 'latest'
          })

          // For each Markee, fetch current data
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
  }, [opClient, baseClient, arbClient]) // Removed markees.length - this was causing infinite loop!

  // Load from cache on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      try {
        const { markees: cachedMarkees, timestamp }: CacheData = JSON.parse(cached)
        const age = Date.now() - timestamp
        
        if (age < CACHE_DURATION) {
          // Use cached data
          setMarkees(cachedMarkees)
          setLastUpdated(new Date(timestamp))
          setIsLoading(false)
          return
        }
      } catch (err) {
        console.error('Error loading cache:', err)
      }
    }
    
    // No valid cache, fetch fresh data
    fetchMarkees()
  }, []) // Only run once on mount

  // Manual refetch function
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
