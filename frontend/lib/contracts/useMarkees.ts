'use client'

import { useState, useEffect } from 'react'
import { CANONICAL_CHAIN_ID, CONTRACTS } from '@/lib/contracts/addresses'
import type { Markee } from '@/types'

// Temporary stub that returns empty data until TopDawg strategy is deployed
export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date())
  const [isFetchingFresh, setIsFetchingFresh] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Check if TopDawg strategy is deployed
  const strategyAddress = CONTRACTS[CANONICAL_CHAIN_ID]?.topDawgStrategies?.[0]?.address

  useEffect(() => {
    if (!strategyAddress) {
      console.log('[Markees] TopDawg strategy not yet deployed on Base')
      setIsLoading(false)
      return
    }

    // TODO: When TopDawg is deployed, fetch data from subgraph here
    setMarkees([])
    setIsLoading(false)
  }, [strategyAddress])

  const refetch = async () => {
    setIsFetchingFresh(true)
    setTimeout(() => {
      setIsFetchingFresh(false)
    }, 500)
  }

  return {
    markees,
    isLoading,
    isFetchingFresh,
    error,
    lastUpdated,
    refetch,
  }
}
