'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePublicClient } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]
const CACHE_KEY = 'markees_cache'
const CACHE_DURATION = 1000 * 60 * 5 // 5 minutes
const MAX_BLOCK_RANGE = 9n // Alchemy free tier allows max 10 blocks per request

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
  const hasFetchedRef = useRef(false)

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
          
          // Only scan last 100,000 blocks to avoid rate limits
          const blocksToScan = 100000n
          const startBlock = latestBlock > blocksToScan ? latestBlock - blocksToScan : 0n
          
          console.log(`Fetching ${chain.name} events from block ${startBlock} to ${latestBlock}`)
          
          // Chunk requests to avoid "block range too large" errors
          const allLogs: any[] = []
          let currentFrom = startBlock
          
          while (currentFrom <= latestBlock) {
            const currentTo = currentFrom + MAX_BLOCK_RANGE > latestBlock 
              ? latestBlock 
              : currentFrom + MAX_BLOCK_RANGE
            
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
                    { type: 'string', name: 'name' },
                    { type: 'uint256', name: 'amount' }
                  ]
                },
                fromBlock: currentFrom,
                toBlock: currentTo
              })
              
              allLogs.push(...logs)
              console.log(`  Fetched ${logs.length} events from ${currentFrom} to ${currentTo}`)
            } catch (chunkErr) {
              console.error(`Error fetching chunk ${currentFrom}-${currentTo}:`, chunkErr)
            }
            
            currentFrom = currentTo + 1n
          }

          console.log(`Found ${allLogs.length} total Markees on ${chain.name}`)
          const logs = allLogs

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

  // Load from cache on mount, then fetch fresh data
  useEffect(() => {
    // Only run once
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

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
    
    fetchMarkees(false)
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
