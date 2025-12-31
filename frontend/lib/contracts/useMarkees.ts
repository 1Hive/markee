'use client'

import { useState, useEffect } from 'react'
import { useQuery, gql } from '@apollo/client'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import type { Markee } from '@/types'

const MARKEES_QUERY = gql`
  query GetMarkees {
    markees(
      where: { 
        strategy_not: null
      }
      first: 100
      orderBy: totalFundsAdded
      orderDirection: desc
    ) {
      id
      address
      owner
      message
      name
      totalFundsAdded
      pricingStrategy
      createdAt
      updatedAt
      fundsAddedCount
      messageUpdateCount
      strategy {
        instanceName
        totalInstanceFunds
      }
    }
  }
`

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isFetchingFresh, setIsFetchingFresh] = useState(false)

  const { data, loading, error, refetch: apolloRefetch } = useQuery(MARKEES_QUERY, {
    pollInterval: 30000, // Poll every 30 seconds
  })

  // Transform GraphQL data to Markee type
  useEffect(() => {
    if (data?.markees) {
      const transformed: Markee[] = data.markees.map((m: any) => ({
        address: m.address,
        owner: m.owner,
        message: m.message || '',
        name: m.name || '',
        totalFundsAdded: BigInt(m.totalFundsAdded),
        pricingStrategy: m.pricingStrategy,
        chainId: CANONICAL_CHAIN_ID,
        createdAt: Number(m.createdAt),
        updatedAt: Number(m.updatedAt),
      }))
      
      setMarkees(transformed)
      setLastUpdated(new Date())
      setIsFetchingFresh(false)
    }
  }, [data])

  // Refetch function with loading state
  const refetch = async () => {
    setIsFetchingFresh(true)
    try {
      await apolloRefetch()
    } catch (err) {
      console.error('[Markees] Refetch error:', err)
    } finally {
      setIsFetchingFresh(false)
    }
  }

  return {
    markees,
    isLoading: loading,
    isFetchingFresh,
    error,
    lastUpdated,
    refetch,
  }
}
