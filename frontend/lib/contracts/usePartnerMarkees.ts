import { useState, useEffect } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import type { Markee } from '@/types'

// Partner configuration
export const PARTNERS = [
  {
    slug: 'markee-cooperative',
    name: 'Markee Cooperative',
    description: 'The original Markee leaderboard - 100% of funds go to the cooperative RevNet',
    strategyAddress: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a', // ← Change this
    logo: '/markee-logo.png',
    fundingSplit: '100% to Cooperative RevNet',
    percentToBeneficiary: 0
  },
  {
    slug: 'gardens',
    name: 'Gardens',
    logo: '/partners/gardens.png',
    description: 'Support Gardens platform development and community governance tools.',
    strategyAddress: '0x346419315740F085Ba14cA7239D82105a9a2BDBE', // TopDawgPartnerStrategy
    isCooperative: false
  }
] as const

interface PartnerData {
  partner: typeof PARTNERS[number]
  winningMarkee?: Markee
  totalFunds: bigint
  markeeCount: number
}

const MARKEE_ABI = [
  parseAbiItem('function message() view returns (string)'),
  parseAbiItem('function owner() view returns (address)'),
  parseAbiItem('function name() view returns (string)'),
  parseAbiItem('function totalFundsAdded() view returns (uint256)')
] as const

export function usePartnerMarkees() {
  const [partnerData, setPartnerData] = useState<PartnerData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let isMounted = true

    async function fetchPartnerData() {
      try {
        setIsLoading(true)
        setError(null)

        const client = createPublicClient({
          chain: base,
          transport: http()
        })

        const results = await Promise.all(
          PARTNERS.map(async (partner) => {
            try {
              // Get MarkeeCreated events from strategy
              const events = await client.getLogs({
                address: partner.strategyAddress as `0x${string}`,
                event: parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, uint256 initialAmount, string message)'),
                fromBlock: 'earliest',
                toBlock: 'latest'
              })

              if (events.length === 0) {
                return {
                  partner,
                  winningMarkee: undefined,
                  totalFunds: 0n,
                  markeeCount: 0
                }
              }

              // Fetch details for each markee
              const markees = await Promise.all(
                events.map(async (event) => {
                  const markeeAddress = event.args.markeeAddress as `0x${string}`
                  
                  try {
                    const [message, owner, name, totalFundsAdded] = await Promise.all([
                      client.readContract({
                        address: markeeAddress,
                        abi: MARKEE_ABI,
                        functionName: 'message'
                      }),
                      client.readContract({
                        address: markeeAddress,
                        abi: MARKEE_ABI,
                        functionName: 'owner'
                      }),
                      client.readContract({
                        address: markeeAddress,
                        abi: MARKEE_ABI,
                        functionName: 'name'
                      }).catch(() => ''), // Name might not exist
                      client.readContract({
                        address: markeeAddress,
                        abi: MARKEE_ABI,
                        functionName: 'totalFundsAdded'
                      })
                    ])

                      return {
                        address: markeeAddress,
                        message: message as string,
                        owner: owner as string,
                        name: name as string,
                        totalFundsAdded: totalFundsAdded as bigint,
                        pricingStrategy: partner.strategyAddress,  // ← Add this
                        strategyAddress: partner.strategyAddress,
                        chainId: base.id
                      } as Markee
                  } catch (err) {
                    console.error(`Error fetching markee ${markeeAddress}:`, err)
                    return null
                  }
                })
              )

              // Filter out failed fetches and sort by totalFundsAdded
              const validMarkees = markees.filter((m): m is Markee => m !== null)
              validMarkees.sort((a, b) => Number(b.totalFundsAdded - a.totalFundsAdded))

              // Calculate total funds
              const totalFunds = validMarkees.reduce((sum, m) => sum + m.totalFundsAdded, 0n)

              return {
                partner,
                winningMarkee: validMarkees[0],
                totalFunds,
                markeeCount: validMarkees.length
              }
            } catch (err) {
              console.error(`Error fetching data for ${partner.name}:`, err)
              return {
                partner,
                winningMarkee: undefined,
                totalFunds: 0n,
                markeeCount: 0
              }
            }
          })
        )

        if (isMounted) {
          // Sort by total funds raised (descending), but keep Cooperative at top
          const sorted = results.sort((a, b) => {
            if (a.partner.isCooperative) return -1
            if (b.partner.isCooperative) return 1
            return Number(b.totalFunds - a.totalFunds)
          })

          setPartnerData(sorted)
        }
      } catch (err) {
        console.error('Error fetching partner data:', err)
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch partner data'))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchPartnerData()

    return () => {
      isMounted = false
    }
  }, [])

  return { partnerData, isLoading, error }
}
