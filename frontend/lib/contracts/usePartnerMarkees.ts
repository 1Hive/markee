import { useState, useEffect } from 'react'
import { SUBGRAPH_URLS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import type { Markee } from '@/types'

// Partner configuration
export const PARTNERS = [
  {
    slug: 'markee-cooperative',
    name: 'Markee Cooperative',
    description: 'The home message for markee.xyz - 100% of funds go into the Markee Cooperative RevNet',
    strategyAddress: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a',
    logo: '/markee-logo.png',
    fundingSplit: '100% to Markee Cooperative',
    percentToBeneficiary: 0,
    isCooperative: true
  },
  {
    slug: 'gardens',
    name: 'Gardens',
    description: 'Community governance platform built on conviction voting',
    strategyAddress: '0x346419315740F085Ba14cA7239D82105a9a2BDBE',
    logo: '/partners/gardens.png',
    fundingSplit: '62% to Gardens / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  },
    {
    slug: 'bread-cooperative',
    name: 'Bread Cooperative',
    description: 'A collective of communities building worker-owned financial infrastructure',
    strategyAddress: '0x05A40489965B355e0404c05134dA68626a5a927c',
    logo: '/partners/breadcoop.png',
    fundingSplit: '62% to Bread Cooperative / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  },
    {
    slug: 'revnets',
    name: 'RevNets',
    description: 'Autonomous revenue-sharing networks with immutable tokenomics rules',
    strategyAddress: '0xe68CbEf87B710B379654Dfd3c0BEC8779bBCcEbB',
    logo: '/partners/revnets.png',
    fundingSplit: '62% to RevNets / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  },
    {
    slug: 'juicebox',
    name: 'Juicebox',
    description: 'Programmable fundraising protocol for community-owned treasury formation',
    strategyAddress: '0x2a84960367832039C188C75FD6D6D5f2E8F640e2',
    logo: '/partners/juicebox.png',
    fundingSplit: '62% to Juicebox / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  }, 
    {
    slug: 'giveth',
    name: 'Giveth', 
    description: 'Web3 crowdfunding platform for nonprofits and social causes',
    strategyAddress: '0x00A60bA8351a69EF8d10F6c9b2b0E03aDE2E7431',  
    logo: '/partners/giveth.png',
    fundingSplit: '62% to Giveth / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  },
    {
    slug: 'flow-state',
    name: 'Flow State', 
    description: 'Continuous funding apps, incentive systems & governance mechanisms',
    strategyAddress: '0x24512EE8E5f9138e2Bfca0c8253e7525035f4989',  
    logo: '/partners/flowstate.png',
    fundingSplit: '62% to Flow State / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  },
    {
    slug: 'superfluid',
    name: 'Superfluid', 
    description: 'Protocol for money streaming - send and receive tokens continuously',
    strategyAddress: '0x7A6CE4d457AC1A31513BDEFf924FF942150D293E',  
    logo: '/partners/superfluid.png',
    fundingSplit: '62% to Superfluid / 38% to Markee Cooperative',
    percentToBeneficiary: 6200,
    isCooperative: false
  },
] as const

interface PartnerData {
  partner: typeof PARTNERS[number]
  winningMarkee: Markee | null
  totalFunds: bigint
  markeeCount: bigint
}

const COOPERATIVE_QUERY = `
  query GetCooperativeMarkees {
    topDawgStrategy(id: "0x558eb41ec9cc90b86550617eef5f180ea60e0e3a") {
      totalFundsRaised
      totalMarkeesCreated
      markees(
        orderBy: totalFundsAdded
        orderDirection: desc
        first: 1
      ) {
        id
        address
        message
        name
        owner
        totalFundsAdded
        pricingStrategy
      }
    }
  }
`

const PARTNER_QUERY = `
  query GetPartnerMarkees($strategyId: ID!) {
    topDawgPartnerStrategy(id: $strategyId) {
      totalFundsRaised
      totalMarkeesCreated
      markees(
        orderBy: totalFundsAdded
        orderDirection: desc
        first: 1
      ) {
        id
        address
        message
        name
        owner
        totalFundsAdded
        pricingStrategy
      }
    }
  }
`

export function usePartnerMarkees() {
  const [partnerData, setPartnerData] = useState<PartnerData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchPartnerData() {
      try {
        setIsLoading(true)
        setError(null)

        const subgraphUrl = SUBGRAPH_URLS[CANONICAL_CHAIN_ID]
        
        if (!subgraphUrl) {
          throw new Error('Subgraph URL not configured')
        }

        const results = await Promise.all(
          PARTNERS.map(async (partner) => {
            try {
              const query = partner.isCooperative ? COOPERATIVE_QUERY : PARTNER_QUERY
              const variables = partner.isCooperative ? {} : { strategyId: partner.strategyAddress.toLowerCase() }

              const response = await fetch(subgraphUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables })
              })

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
              }

              const result = await response.json()

              if (result.errors) {
                console.error('GraphQL errors:', result.errors)
                throw new Error(result.errors[0]?.message || 'GraphQL query failed')
              }

              const strategyData = partner.isCooperative 
                ? result.data?.topDawgStrategy
                : result.data?.topDawgPartnerStrategy

              if (!strategyData) {
                return {
                  partner,
                  winningMarkee: null,
                  totalFunds: BigInt(0),
                  markeeCount: BigInt(0)
                }
              }

              const winningMarkeeData = strategyData.markees?.[0]
              const winningMarkee = winningMarkeeData ? {
                address: winningMarkeeData.address,
                message: winningMarkeeData.message,
                name: winningMarkeeData.name,
                owner: winningMarkeeData.owner,
                totalFundsAdded: BigInt(winningMarkeeData.totalFundsAdded),
                pricingStrategy: winningMarkeeData.pricingStrategy,
                strategyAddress: partner.strategyAddress,
                chainId: CANONICAL_CHAIN_ID
              } as Markee : null

              return {
                partner,
                winningMarkee,
                totalFunds: BigInt(strategyData.totalFundsRaised || '0'),
                markeeCount: BigInt(strategyData.totalMarkeesCreated || '0')
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
