'use client'

import { useEffect, useState } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'
import { InvestorStrategyABI, MarkeeABI } from './abis'
import { CONTRACTS } from './addresses'
import type { Markee } from '@/types'

const CHAINS = [base, optimism, arbitrum]

const DEPLOYMENT_BLOCKS: Record<number, bigint> = {
  [optimism.id]: 128400000n,
  [base.id]: 0n,
  [arbitrum.id]: 0n,
}

const MAX_BLOCK_RANGE = 10000n

console.log('🔵 useMarkees module loaded')

export function useMarkees() {
  console.log('🟢 useMarkees hook called')
  
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { address } = useAccount()

  const opClient = usePublicClient({ chainId: optimism.id })
  const baseClient = usePublicClient({ chainId: base.id })
  const arbClient = usePublicClient({ chainId: arbitrum.id })

  console.log('🟡 Clients:', { 
    op: !!opClient, 
    base: !!baseClient, 
    arb: !!arbClient 
  })

  useEffect(() => {
    console.log('🟣 Effect running')
    let mounted = true

    async function load() {
      console.log('🔴 Load function called')
      
      if (!opClient && !baseClient && !arbClient) {
        console.log('⚠️ No clients available yet')
        return
      }

      console.log('✅ Clients ready, starting fetch')

      try {
        setIsLoading(true)
        const allMarkees: Markee[] = []

        for (const chain of CHAINS) {
          if (!mounted) return

          const strategyAddress = CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy
          if (!strategyAddress) {
            console.log(`⏭️ No contract on ${chain.name}`)
            continue
          }

          const client = 
            chain.id === optimism.id ? opClient :
            chain.id === base.id ? baseClient :
            arbClient

          if (!client) {
            console.log(`⏭️ No client for ${chain.name}`)
            continue
          }

          console.log(`🔍 Fetching from ${chain.name}`)

          try {
            const currentBlock = await client.getBlockNumber()
            const deploymentBlock = DEPLOYMENT_BLOCKS[chain.id] || 0n
            
            console.log(`📊 Block range: ${deploymentBlock} to ${currentBlock}`)

            const allLogs = []
            let fromBlock = deploymentBlock
            
            while (fromBlock < currentBlock && mounted) {
              const toBlock = fromBlock + MAX_BLOCK_RANGE > currentBlock 
                ? currentBlock 
                : fromBlock + MAX_BLOCK_RANGE

              console.log(`📦 Querying ${fromBlock} - ${toBlock}`)

              try {
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
                  toBlock
                })

                if (logs.length > 0) {
                  allLogs.push(...logs)
                  console.log(`✨ Found ${logs.length} events`)
                }
              } catch (err: any) {
                console.error(`❌ Chunk error:`, err.message)
              }

              fromBlock = toBlock + 1n
            }

            console.log(`📝 Total events on ${chain.name}: ${allLogs.length}`)

            for (const log of allLogs) {
              if (!mounted) return

              const { markeeAddress, owner } = log.args as any
              
              try {
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

                console.log(`💬 Loaded: "${message}"`)
              } catch (err: any) {
                console.error(`❌ Read contract error:`, err.message)
              }
            }
          } catch (err: any) {
            console.error(`❌ Chain error (${chain.name}):`, err.message)
          }
        }

        if (!mounted) return

        allMarkees.sort((a, b) => {
          if (a.totalFundsAdded > b.totalFundsAdded) return -1
          if (a.totalFundsAdded < b.totalFundsAdded) return 1
          return 0
        })

        console.log(`🎉 Done! Total Markees: ${allMarkees.length}`)
        setMarkees(allMarkees)
        setError(null)
      } catch (err: any) {
        console.error('💥 Fatal error:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) {
          console.log('🏁 Setting loading to false')
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      console.log('🧹 Cleanup')
      mounted = false
    }
  }, [opClient, baseClient, arbClient])

  const userMarkee = address 
    ? markees.find((m) => m.owner.toLowerCase() === address.toLowerCase())
    : null

  console.log('📤 Returning:', { markeesCount: markees.length, isLoading, hasError: !!error })

  return { markees, userMarkee, isLoading, error }
}
