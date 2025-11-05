'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]
const CACHE_KEY = 'markees_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Deployment blocks for InvestorStrategy contracts
const DEPLOYMENT_BLOCKS: Record<number, bigint> = {
  [optimism.id]: 128000000n, // Adjust to actual deployment block
  [base.id]: 0n,
  [arbitrum.id]: 0n,
}

const BLOCK_CHUNK_SIZE = 10000n

interface CachedData {
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

  // Define fetchMarkees with useCallback so it's stable
  const fetchMarkees = useCallback(async (forceFresh = false) => {
    // If we already have cached data and it's fresh, skip fetch (unless forced)
    if (markees.length > 0 && !isFetchingFresh && !forceFresh) {
      return
    }

    if (forceFresh) {
      setIsFetchingFresh(true)
    }

    try {
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
          const currentBlock = await client.getBlockNumber()
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
                name: (name as string) || undefined,
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

      // Update state and cache
      setMarkees(allMarkees)
      setError(null)
      const now = new Date()
      setLastUpdated(now)

      // Save to localStorage
      try {
        const cacheData: CachedData = {
          markees: allMarkees,
          timestamp: now.getTime()
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
        console.log(`Cached ${allMarkees.length} markees`)
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
  }, [opClient, baseClient, arbClient, markees.length, isFetchingFresh])

  // Load from cache immediately on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { markees: cachedMarkees, timestamp }: CachedData = JSON.parse(cached)
        const age = Date.now() - timestamp
        
        if (age < CACHE_DURATION) {
          // Cache is fresh - use it and don't fetch
          setMarkees(cachedMarkees)
          setLastUpdated(new Date(timestamp))
          setIsLoading(false)
          console.log(`Loaded ${cachedMarkees.length} markees from cache (${Math.round(age / 1000)}s old)`)
          return
        } else {
          // Cache is stale - show it but fetch fresh data
          setMarkees(cachedMarkees)
          setLastUpdated(new Date(timestamp))
          setIsLoading(false)
          setIsFetchingFresh(true)
          console.log(`Showing stale cache (${Math.round(age / 1000)}s old), fetching fresh data...`)
        }
      }
    } catch (err) {
      console.error('Error loading cache:', err)
    }
  }, [])

  // Fetch markees when clients are ready or when forced fresh
  useEffect(() => {
    if ((opClient || baseClient || arbClient) && (isLoading || isFetchingFresh)) {
      fetchMarkees()
    }
  }, [opClient, baseClient, arbClient, isLoading, isFetchingFresh, fetchMarkees])

  // Expose a manual refetch function
  const refetch = useCallback(() => {
    console.log('Manual refetch triggered')
    fetchMarkees(true)
  }, [fetchMarkees])

  return { 
    markees, 
    isLoading, 
    error, 
    isFetchingFresh, 
    lastUpdated,
    refetch 
  }
}
