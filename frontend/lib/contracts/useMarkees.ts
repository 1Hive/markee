'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { request, gql } from 'graphql-request'
import type { Markee, FundsAdded, MessageUpdate, NameUpdate } from '@/types'

const SUBGRAPH_URL =
  'https://api.studio.thegraph.com/query/40814/markee-optimism/version/latest'
const CACHE_KEY = 'markees_cache'
const CACHE_DURATION = 1000 * 60 * 5 // 5 minutes

interface CacheData {
  markees: Markee[]
  timestamp: number
}

// GraphQL response type
interface MarkeeSubgraph {
  markees: Array<{
    id: string
    address: string
    owner: string
    message: string
    name?: string
    totalFundsAdded: string
    pricingStrategy: string
    chainId: string
    createdAt?: string
    createdAtBlock?: string
    updatedAt?: string
    fundsAddedCount?: string
    messageUpdateCount?: string
    fundsAddedEvents?: Array<{
      id: string
      addedBy: string
      amount: string
      newTotal: string
      timestamp: string
      blockNumber: string
      transactionHash: string
    }> | null
    messageUpdates?: Array<{
      id: string
      updatedBy: string
      oldMessage: string
      newMessage: string
      timestamp: string
      blockNumber: string
      transactionHash: string
    }> | null
    nameUpdates?: Array<{
      id: string
      updatedBy: string
      oldName: string
      newName: string
      timestamp: string
      blockNumber: string
      transactionHash: string
    }> | null
  }>
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
      if (showFetchingIndicator && markees.length > 0) setIsFetchingFresh(true)
      else setIsLoading(true)

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

      const headers = {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_GRAPH_TOKEN}`,
      }

      const data = await request<MarkeeSubgraph>(SUBGRAPH_URL, query, {}, headers)

      const allMarkees: Markee[] = data.markees.map((m) => ({
        address: m.address,
        owner: m.owner,
        message: m.message,
        name: m.name,
        totalFundsAdded: BigInt(m.totalFundsAdded),
        pricingStrategy: m.pricingStrategy,
        chainId: Number(m.chainId),
        fundsAddedEvents: (m.fundsAddedEvents ?? []).map((e) => ({
          ...e,
          amount: BigInt(e.amount),
          newTotal: BigInt(e.newTotal),
          timestamp: BigInt(e.timestamp),
          blockNumber: BigInt(e.blockNumber),
        })) as FundsAdded[],
        messageUpdates: (m.messageUpdates ?? []).map((e) => ({
          ...e,
          timestamp: BigInt(e.timestamp),
          blockNumber: BigInt(e.blockNumber),
        })) as MessageUpdate[],
        nameUpdates: (m.nameUpdates ?? []).map((e) => ({
          ...e,
          timestamp: BigInt(e.timestamp),
          blockNumber: BigInt(e.blockNumber),
        })) as NameUpdate[],
      }))

      console.log(`Fetched ${allMarkees.length} markees from subgraph`)
      setMarkees(allMarkees)
      setError(null)
      const now = Date.now()
      setLastUpdated(new Date(now))

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ markees: allMarkees, timestamp: now }))
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
  }, [])

  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { markees: cachedMarkees, timestamp }: CacheData = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          console.log('Using cached markees data')
          setMarkees(cachedMarkees)
          setLastUpdated(new Date(timestamp))
          setIsLoading(false)
          return
        }
      }
    } catch (err) {
      console.error('Error reading cache:', err)
    }

    fetchMarkees(false)
  }, [fetchMarkees])

  const refetch = useCallback(() => fetchMarkees(true), [fetchMarkees])

  return { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch }
}
