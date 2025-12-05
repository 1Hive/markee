'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { request, gql } from 'graphql-request'
import type { Markee } from '@/types'

// Primary endpoint: The Graph Network (production)
const NETWORK_SUBGRAPH_URL = process.env.NEXT_PUBLIC_GRAPH_API_KEY
  ? `https://gateway-arbitrum.network.thegraph.com/api/${process.env.NEXT_PUBLIC_GRAPH_API_KEY}/subgraphs/id/3kUc3txg9GPt6MvdKFZPYzwU5GZoXvtWyoMwLRsXreXm`
  : null

// Fallback endpoint: The Graph Studio (development)
const STUDIO_SUBGRAPH_URL =
  'https://api.studio.thegraph.com/query/40814/markee-optimism/version/latest'

const CACHE_KEY = 'markees_cache'
const CACHE_DURATION = 1000 * 60 * 10 // 10 minutes

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
      // Add query counter for monitoring
      const queryCount = parseInt(localStorage.getItem('markees_query_count') || '0') + 1
      localStorage.setItem('markees_query_count', queryCount.toString())
      
      console.log('[Markees] Query #' + queryCount + ' at', new Date().toISOString())
      console.log('[Markees] Using cache:', showFetchingIndicator && markees.length > 0 ? 'background refresh' : 'initial load')
      
      if (showFetchingIndicator && markees.length > 0) setIsFetchingFresh(true)
      else setIsLoading(true)

      const query = gql`
        query GetMarkees {
          markees(first: 100, orderBy: totalFundsAdded, orderDirection: desc) {
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
          }
        }
      `

      const headers = {
        'Content-Type': 'application/json',
      }

      let data: MarkeeSubgraph | null = null
      let usedEndpoint = ''

      // Try Network endpoint first (production)
      if (NETWORK_SUBGRAPH_URL) {
        try {
          console.log('[Markees] Trying Network endpoint...')
          data = await request<MarkeeSubgraph>(NETWORK_SUBGRAPH_URL, query, {}, headers)
          usedEndpoint = 'Network'
          console.log('[Markees] ✓ Network endpoint succeeded')
        } catch (networkError: any) {
          console.warn('[Markees] Network endpoint failed:', networkError.message)
          console.log('[Markees] Falling back to Studio endpoint...')
        }
      }

      // Fallback to Studio endpoint if Network failed or not configured
      if (!data) {
        try {
          // Add Studio authorization header
          const studioHeaders = {
            ...headers,
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_GRAPH_TOKEN}`,
          }
          data = await request<MarkeeSubgraph>(STUDIO_SUBGRAPH_URL, query, {}, studioHeaders)
          usedEndpoint = 'Studio'
          console.log('[Markees] ✓ Studio endpoint succeeded')
        } catch (studioError: any) {
          console.error('[Markees] Studio endpoint also failed:', studioError.message)
          throw new Error('Both Network and Studio endpoints failed')
        }
      }

      const allMarkees: Markee[] = data.markees.map((m) => ({
        address: m.address,
        owner: m.owner,
        message: m.message,
        name: m.name,
        totalFundsAdded: BigInt(m.totalFundsAdded),
        pricingStrategy: m.pricingStrategy,
        chainId: Number(m.chainId),
      }))

      console.log(`[Markees] Successfully fetched ${allMarkees.length} markees from ${usedEndpoint}`)
      setMarkees(allMarkees)
      setError(null)
      const now = Date.now()
      setLastUpdated(new Date(now))

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ markees: allMarkees, timestamp: now }))
      } catch (err) {
        console.error('[Markees] Error saving cache:', err)
      }
    } catch (err) {
      console.error('[Markees] Error fetching markees:', err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
      setIsFetchingFresh(false)
    }
  }, [markees.length])

  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { markees: cachedMarkees, timestamp }: CacheData = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          console.log('[Markees] Using cached data from', new Date(timestamp).toISOString())
          setMarkees(cachedMarkees)
          setLastUpdated(new Date(timestamp))
          setIsLoading(false)
          return
        } else {
          console.log('[Markees] Cache expired, fetching fresh data')
        }
      }
    } catch (err) {
      console.error('[Markees] Error reading cache:', err)
    }

    fetchMarkees(false)
  }, [fetchMarkees])

  const refetch = useCallback(() => fetchMarkees(true), [fetchMarkees])

  return { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch }
}
