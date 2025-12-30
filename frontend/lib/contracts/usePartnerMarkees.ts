import { useState, useEffect } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import type { Markee } from '@/types'

// Partner configuration
export const PARTNERS = [
  {
    slug: 'markee-cooperative',
    name: 'Markee Cooperative',
    description: 'Our home message for markee.xyz - 100% of funds go into the Markee Cooperative RevNet',
    strategyAddress: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a', // TopDawgStrategy
    logo: '/markee-logo.png',
    fundingSplit: '100% to Markee Cooperative',
    percentToBeneficiary: 0,
    isCooperative: true // Uses TopDawgStrategy, not TopDawgPartnerStrategy
  },
  {
    slug: 'gardens',
    name: 'Gardens',
    description: 'Community governance platform built on conviction voting',
    strategyAddress: '0x346419315740F085Ba14cA7239D82105a9a2BDBE', // TopDawgPartnerStrategy
    logo: '/partners/gardens.png',
    fundingSplit: '68% to Gardens / 32% to Cooperative',
    percentToBeneficiary: 6800,
    isCooperative: false
  }
] as const

const MARKEE_ABI = [
  parseAbiItem('function message() view returns (string)'),
  parseAbiItem('function owner() view returns (address)'),
  parseAbiItem('function name() view returns (string)'),
  parseAbiItem('function totalFundsAdded() view returns (uint256)')
] as const

interface PartnerData {
  partner: typeof PARTNERS[number]
  winningMarkee: Markee | null
  totalFunds: bigint
  markeeCount: bigint
}

export function usePartnerMarkees() {
  const [partnerData, setPartnerData] = useState<PartnerData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
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
              // Get MarkeeCreated events for this partner
              const events = await client.getLogs({
                address: partner.strategyAddress as `0x${string}`,
                event: parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, uint256 initialAmount, string message)'),
                fromBlock: 'earliest',
                toBlock: 'latest'
              })

              if (events.length === 0) {
                return {
                  partner,
                  winningMarkee: null,
                  totalFunds: BigInt(0),
                  markeeCount: BigInt(0)
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
                      }).catch(() => ''),
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
                      pricingStrategy: partner.strategyAddress,
                      strategyAddress: partner.strategyAddress,
                      chainId: base.id
                    } as Markee
                  } catch (err) {
                    console.error(`Error fetching markee ${markeeAddress}:`, err)
                    return null
                  }
                })
              )

              // Filter nulls and sort by funds
              const validMarkees = markees.filter((m): m is Markee => m !== null)
              validMarkees.sort((a, b) => Number(b.totalFundsAdded - a.totalFundsAdded))

              // Calculate totals
              const totalFunds = validMarkees.reduce((sum, m) => sum + m.totalFundsAdded, BigInt(0))

              return {
                partner,
                winningMarkee: validMarkees[0] || null,
                totalFunds,
                markeeCount: BigInt(validMarkees.length)
              }
            } catch (err) {
              console.error(`Error fetching data for ${partner.name}:`, err)
              return {
                partner,
                winningMarkee: null,
                totalFunds: BigInt(0),
                markeeCount: BigInt(0)
              }
            }
          })
        )

        // Sort: Cooperative first, then by total funds raised
        results.sort((a, b) => {
          if (a.partner.isCooperative) return -1
          if (b.partner.isCooperative) return 1
          return Number(b.totalFunds - a.totalFunds)
        })

        setPartnerData(results)
      } catch (err) {
        console.error('Error fetching partner data:', err)
        setError(err instanceof Error ? err : new Error('Failed to fetch partner data'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchPartnerData()
  }, [])

  return { partnerData, isLoading, error }
}
