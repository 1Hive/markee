'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]

export function useMarkees() {
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { address } = useAccount()

  // Get public clients for all chains
  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  const fetchMarkees = useCallback(async () => {
    try {
      setIsLoading(true)
      const allMarkees: Markee[] = []

      // Fetch from each chain
      for (const chain of CHAINS) {
        const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
        if (!strategyAddress) continue

        const client = 
          chain.id === optimism.id ? opClient :
          chain.id === base.id ? baseClient :
          arbClient

        if (!client) continue

        try {
          // Get current block first
          const currentBlock = await client.getBlockNumber()
          
          // Use a reasonable block range (last ~3 months of blocks)
          // Optimism: ~15M blocks per 3 months, Base/Arbitrum similar
          const blockRange = 15000000n
          const fromBlock = currentBlock > blockRange ? currentBlock - blockRange : 0n

          console.log(`Fetching Markees from ${chain.name} from block ${fromBlock} to ${currentBlock}`)

          // Get MarkeeCreated events
          const logs = await client.getLogs({
            address: strategyAddress,
            event: {
              type: 'event',
              name: 'MarkeeCreated',
              inputs: [
                { type: 'address', name: 'markeeAddress', indexed: true },
                { type: 'address', name: 'owner', indexed: true },
                { type: 'string', name: 'message' },
                { type: 'uint256', name: 'amount' }
              ]
            },
            fromBlock,
            toBlock: 'latest'
          })

          console.log(`Found ${logs.length} Markees on ${chain.name}`)

          // For each Markee, fetch current data
          for (const log of logs) {
            const { markeeAddress, owner } = log.args as any
            
            try {
              // Read current message and totalFundsAdded from Markee contract
              const [message, totalFundsAdded] = await Promise.all([
                client.readContract({
                  address: markeeAddress,
                  abi: MarkeeABI,
                  functionName: 'message'
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

      console.log(`Total Markees fetched: ${allMarkees.length}`)
      setMarkees(allMarkees)
      setError(null)
    } catch (err) {
      console.error('Error fetching markees:', err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [opClient, baseClient, arbClient])

  useEffect(() => {
    fetchMarkees()
  }, [fetchMarkees])

  // Find the current user's Markee
  const userMarkee = address 
    ? markees.find((markee) => markee.owner.toLowerCase() === address.toLowerCase())
    : null

  return { 
    markees, 
    userMarkee: userMarkee || null, 
    isLoading, 
    error,
    refetch: fetchMarkees 
  }
}
