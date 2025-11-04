'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import type { Markee } from '@/types'

// Minimal version for testing - just returns empty array to verify the hook works
export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const opClient = usePublicClient({ chainId: optimism.id })

  useEffect(() => {
    async function test() {
      console.log('useMarkees hook running...')
      console.log('opClient:', opClient)
      
      try {
        setIsLoading(true)
        
        if (opClient) {
          console.log('Client available, getting block number...')
          const blockNumber = await opClient.getBlockNumber()
          console.log('Current Optimism block:', blockNumber)
        } else {
          console.log('No client available yet')
        }
        
        // Return empty array for now
        console.log('Setting empty markees array')
        setMarkees([])
        setError(null)
      } catch (err) {
        console.error('Error in useMarkees:', err)
        setError(err as Error)
      } finally {
        console.log('Setting isLoading to false')
        setIsLoading(false)
      }
    }

    test()
  }, [opClient])

  console.log('useMarkees state:', { markeesCount: markees.length, isLoading, error })

  return { markees, isLoading, error }
}
