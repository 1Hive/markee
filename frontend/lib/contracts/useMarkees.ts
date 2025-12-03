'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { request, gql } from 'graphql-request'
import type { Markee, FundsAdded, MessageUpdate, NameUpdate } from '@/types'

const SUBGRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/3kUc3txg9GPt6MvdKFZPYzwU5GZoXvtWyoMwLRsXreXm'
const CACHE_KEY = 'markees_cache'
const CACHE_DURATION = 1000 * 60 * 5 // 5 minutes

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

  const fetchMarkees = useCallback(async (showFetchingIndicator = true) => {
    try {
      if (showFetchingIndicator && markees.length > 0) {
        setIsFetchingFresh(true)
      } else {
        setIsLoading(true)
      }

      const query = gql`
        query GetMarkees {
          markees(first: 1000, orderBy: totalFundsAdded, orderDirection: desc) {
            id
            address
            owner
            message
            name
            totalFundsAdded
            pricingStrategy
            chainId
            createdAt
            createdAtBlock
            updatedAt
            fundsAddedCount
            messageUpdateCount
            fundsAddedEvents {
              id
              addedBy
              amount
              newTotal
              timestamp
              blockNumber
              transactionHash
            }
            messageUpdates {
              id
              updatedBy
              oldMessage
              newMessage
              timestamp
              blockNumber
              transactionHash
            }
            nameUpdates {
              id
              updatedBy
              oldName
              newName
              timestamp
              blockNumber
              transactionHash
            }
          }
        }
      `

      const data = await request(SUBGRAPH_URL, query)

      const allMarkees: Markee[] = data.markees.map((m: any) => ({
        ...m,
        totalFundsAdded: BigInt(m.totalFundsAdded),
        chainId: Number(m.chainId),
        fundsAddedEvents: m.fundsAddedEvents.map((e: any) => ({
          ...e,
          amount: BigInt(e.amount),
          newTotal: BigInt(e.newTotal),
          timestamp: BigInt(e.timestamp),
          blockNumber: BigInt(e.blockNumber)
        })) as FundsAdded[],
        messageUpdates: m.messageUpdates.map((e: any) => ({
          ...e,
          timestamp: BigInt(e.timestamp),
          blockNumber: BigInt(e.blockNumber)
        })) as MessageUpdate[],
        nameUpdates: m.nameUpdates.map((e: any) => ({
          ...e,
          timestamp: BigInt(e.timestamp),
          blockNumber: BigInt(e.blockNumber)
        })) as NameUpdate[]
      }))

      console.log(`Fetched ${allMarkees.length} markees with events from subgraph`)

      setMarkees(allMarkees)
      setError(null)
      const now = Date.now()
      setLastUpdated(new Date(now))

      // Save to cache
      try {
        const cacheData: CacheData = { markees: allMarkees, timestamp: now }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
      } catch (err) {
        console.error('Error saving cache:', err)
      }
    } catch (err) {
      console.error('Error fetching markees from subgraph:', err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
      setIsFetchingFresh(false)
    }
  }, [markees])

  // Load from cache on mount, then fetch fresh data
  useEffect(() => {
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
