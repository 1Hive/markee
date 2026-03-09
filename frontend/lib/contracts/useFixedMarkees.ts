'use client'

import { useState, useEffect, useCallback } from 'react'
import { CONTRACTS, CANONICAL_CHAIN_ID, SUBGRAPH_URLS } from '@/lib/contracts/addresses'

export type FixedMarkee = {
  name: string
  strategyAddress: string
  markeeAddress: string
  message: string
  priceWei: string  // raw wei string e.g. "100000000000000000000" — use BigInt() to consume
  owner: string
  chainId: number
}

const FIXED_STRATEGIES_QUERY = `
  query GetFixedPriceStrategies($ids: [ID!]!) {
    fixedPriceStrategies(where: { id_in: $ids }) {
      id
      address
      markeeAddress
      price
      owner
      currentMessage
      currentName
    }
  }
`

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fixedStrategies = CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []
  const subgraphUrl = SUBGRAPH_URLS[CANONICAL_CHAIN_ID]

  const fetchMarkees = useCallback(async () => {
    if (!fixedStrategies.length || !subgraphUrl) {
      setIsLoading(false)
      return
    }

    try {
      const ids = fixedStrategies.map((s) => s.address.toLowerCase())

      const response = await fetch(subgraphUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: FIXED_STRATEGIES_QUERY,
          variables: { ids },
        }),
      })

      if (!response.ok) throw new Error(`HTTP error ${response.status}`)

      const result = await response.json()
      if (result.errors) throw new Error(result.errors[0]?.message || 'GraphQL error')

      const data: Array<{
        id: string
        address: string
        markeeAddress: string
        price: string
        owner: string
        currentMessage: string
        currentName: string
      }> = result.data?.fixedPriceStrategies ?? []

      // Preserve ordering from CONTRACTS config
      const ordered = fixedStrategies.map((strategyConfig) => {
        const found = data.find(
          (d) => d.id.toLowerCase() === strategyConfig.address.toLowerCase()
        )
        return {
          name: strategyConfig.name,
          strategyAddress: strategyConfig.address,
          markeeAddress: found?.markeeAddress ?? '',
          message: found?.currentMessage ?? '',
          priceWei: found?.price ?? '0',  // raw wei string — no formatEther here
          owner: found?.owner ?? '',
          chainId: CANONICAL_CHAIN_ID,
        }
      })

      setMarkees(ordered)
      setError(null)
    } catch (err) {
      console.error('useFixedMarkees: subgraph fetch failed', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [fixedStrategies, subgraphUrl])

  useEffect(() => {
    fetchMarkees()

    // Poll every 30s — subgraph updates are not real-time anyway
    const interval = setInterval(fetchMarkees, 30_000)
    return () => clearInterval(interval)
  }, [fetchMarkees])

  return { markees, isLoading, error, refetch: fetchMarkees }
}
