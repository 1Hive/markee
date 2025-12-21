'use client'

import { useState, useEffect } from 'react'
import { useQuery, gql } from '@apollo/client'
import { CONTRACTS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatEther } from 'viem'

export type FixedMarkee = {
  name: string
  strategyAddress: string
  message: string
  price: string
  owner: string
  chainId: number
}

const FIXED_MARKEES_QUERY = gql`
  query GetFixedMarkees($addresses: [Bytes!]!) {
    fixedPriceStrategies(where: { address_in: $addresses }) {
      id
      address
      currentMessage
      currentName
      price
      owner
      markeeAddress
    }
  }
`

export function useFixedMarkees() {
  const [markees, setMarkees] = useState<FixedMarkee[]>([])

  const fixedStrategies =
    CONTRACTS[CANONICAL_CHAIN_ID]?.fixedPriceStrategies || []

  const strategyAddresses = fixedStrategies.map(s => s.address.toLowerCase())

  const { data, loading: isLoading, refetch } = useQuery(FIXED_MARKEES_QUERY, {
    variables: { addresses: strategyAddresses },
    pollInterval: 10000, // Poll every 10 seconds for updates
    fetchPolicy: 'network-only',
  })

  useEffect(() => {
    if (!data?.fixedPriceStrategies) {
      setMarkees([])
      return
    }

    const result: FixedMarkee[] = fixedStrategies.map((strategyConfig) => {
      const strategyData = data.fixedPriceStrategies.find(
        (s: any) => s.address.toLowerCase() === strategyConfig.address.toLowerCase()
      )

      return {
        name: strategyConfig.name,
        strategyAddress: strategyConfig.address,
        message: strategyData?.currentMessage || '',
        price: strategyData?.price ? formatEther(BigInt(strategyData.price)) : '0',
        owner: strategyData?.owner || '',
        chainId: CANONICAL_CHAIN_ID,
      }
    })

    setMarkees(result)
  }, [data, fixedStrategies])

  return { markees, isLoading, refetch }
}
