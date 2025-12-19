'use client'

import { useState, useEffect } from 'react'
import { useQuery, gql } from '@apollo/client'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

const FIXED_MARKEES_QUERY = gql`
  query GetFixedPriceStrategies {
    fixedPriceStrategies(
      first: 3
      orderBy: createdAt
      orderDirection: asc
    ) {
      id
      address
      currentMessage
      currentName
      price
      totalRevenue
      messageChangeCount
    }
  }
`

export type { FixedMarkee }

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])

  const { data, loading } = useQuery(FIXED_MARKEES_QUERY, {
    pollInterval: 30000, // Poll every 30 seconds
  })

  useEffect(() => {
    if (data?.fixedPriceStrategies) {
      const transformed: FixedMarkee[] = data.fixedPriceStrategies.map((s: any) => ({
        name: s.currentName || 'Loading...',
        strategyAddress: s.address,
        message: s.currentMessage || '',
        price: s.price, // Already a string from GraphQL
        chainId: CANONICAL_CHAIN_ID,
      }))
      
      setMarkees(transformed)
    }
  }, [data])

  return {
    markees,
    isLoading: loading,
  }
}
