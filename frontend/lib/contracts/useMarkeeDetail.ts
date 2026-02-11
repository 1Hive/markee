'use client'

/**
 * useMarkeeDetail
 * 
 * Fetches a single markee by address with full history:
 *   - Message update history
 *   - Funds added history  
 *   - Name update history
 *   - Created date, owner, strategy info
 * 
 * Data comes from The Graph subgraph.
 */

import { useState, useEffect } from 'react'
import { SUBGRAPH_URLS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import type { Markee, FundsAdded, MessageUpdate, NameUpdate } from '@/types'

// Full detail query — pulls all related events
const MARKEE_DETAIL_QUERY = `
  query GetMarkeeDetail($id: ID!) {
    markee(id: $id) {
      id
      address
      owner
      message
      name
      totalFundsAdded
      pricingStrategy
      createdAt
      createdAtBlock
      updatedAt
      updatedAtBlock
      fundsAddedCount
      messageUpdateCount
      nameUpdateCount
      strategy {
        id
        instanceName
        totalInstanceFunds
      }
      partnerStrategy {
        id
        instanceName
        beneficiaryAddress
        percentToBeneficiary
        totalInstanceFunds
      }
      fundsAddedEvents(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        addedBy
        amount
        newMarkeeTotal
        timestamp
        blockNumber
        transactionHash
      }
      messageUpdates(orderBy: timestamp, orderDirection: desc, first: 100) {
        id
        updatedBy
        oldMessage
        newMessage
        timestamp
        blockNumber
        transactionHash
      }
      nameUpdates(orderBy: timestamp, orderDirection: desc, first: 50) {
        id
        updatedBy
        oldName
        newName
        timestamp
        blockNumber
        transactionHash
      }
    }
  }
`

// Also try PartnerFundsAdded for partner strategies
const PARTNER_FUNDS_QUERY = `
  query GetPartnerFunds($markeeId: String!) {
    partnerFundsAddeds(
      where: { markee: $markeeId }
      orderBy: timestamp
      orderDirection: desc
      first: 100
    ) {
      id
      addedBy
      amount
      beneficiaryAmount
      revNetAmount
      newMarkeeTotal
      timestamp
      blockNumber
      transactionHash
    }
  }
`

export interface MarkeeDetail extends Markee {
  createdAt: number
  createdAtBlock: number
  updatedAt: number
  updatedAtBlock: number
  fundsAddedCount: number
  messageUpdateCount: number
  nameUpdateCount: number
  fundsAddedEvents: FundsAdded[]
  messageUpdates: MessageUpdate[]
  nameUpdates: NameUpdate[]
  strategyName?: string
  strategyId?: string
  isPartnerStrategy: boolean
  partnerBeneficiary?: string
  partnerPercentage?: number
  // Partner-specific fund events (with split info)
  partnerFundsEvents?: Array<FundsAdded & {
    beneficiaryAmount: bigint
    revNetAmount: bigint
  }>
}

export function useMarkeeDetail(markeeAddress: string | undefined) {
  const [markee, setMarkee] = useState<MarkeeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!markeeAddress) {
      setIsLoading(false)
      return
    }

    async function fetchDetail() {
      try {
        setIsLoading(true)
        setError(null)

        const subgraphUrl = SUBGRAPH_URLS[CANONICAL_CHAIN_ID]
        if (!subgraphUrl) throw new Error('Subgraph URL not configured')

        // The subgraph uses the contract address (lowercased) as the entity ID
        const id = markeeAddress!.toLowerCase()

        const response = await fetch(subgraphUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: MARKEE_DETAIL_QUERY,
            variables: { id },
          }),
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const result = await response.json()
        if (result.errors) throw new Error(result.errors[0]?.message)

        const m = result.data?.markee
        if (!m) throw new Error('Markee not found')

        const isPartner = !!m.partnerStrategy
        const strategyInfo = isPartner ? m.partnerStrategy : m.strategy

        // Transform to typed data
        const detail: MarkeeDetail = {
          address: m.address,
          owner: m.owner,
          message: m.message || '',
          name: m.name || '',
          totalFundsAdded: BigInt(m.totalFundsAdded),
          pricingStrategy: m.pricingStrategy,
          chainId: CANONICAL_CHAIN_ID,
          createdAt: Number(m.createdAt),
          createdAtBlock: Number(m.createdAtBlock),
          updatedAt: Number(m.updatedAt),
          updatedAtBlock: Number(m.updatedAtBlock),
          fundsAddedCount: Number(m.fundsAddedCount),
          messageUpdateCount: Number(m.messageUpdateCount),
          nameUpdateCount: Number(m.nameUpdateCount || 0),
          strategyName: strategyInfo?.instanceName,
          strategyId: strategyInfo?.id,
          isPartnerStrategy: isPartner,
          partnerBeneficiary: isPartner ? m.partnerStrategy.beneficiaryAddress : undefined,
          partnerPercentage: isPartner ? Number(m.partnerStrategy.percentToBeneficiary) / 100 : undefined,
          fundsAddedEvents: (m.fundsAddedEvents || []).map((e: any) => ({
            id: e.id,
            markee: m.address,
            addedBy: e.addedBy,
            amount: BigInt(e.amount),
            newTotal: BigInt(e.newMarkeeTotal),
            timestamp: BigInt(e.timestamp),
            blockNumber: BigInt(e.blockNumber),
            transactionHash: e.transactionHash,
          })),
          messageUpdates: (m.messageUpdates || []).map((e: any) => ({
            id: e.id,
            markee: m.address,
            updatedBy: e.updatedBy,
            oldMessage: e.oldMessage,
            newMessage: e.newMessage,
            timestamp: BigInt(e.timestamp),
            blockNumber: BigInt(e.blockNumber),
            transactionHash: e.transactionHash,
          })),
          nameUpdates: (m.nameUpdates || []).map((e: any) => ({
            id: e.id,
            markee: m.address,
            updatedBy: e.updatedBy,
            oldName: e.oldName,
            newName: e.newName,
            timestamp: BigInt(e.timestamp),
            blockNumber: BigInt(e.blockNumber),
            transactionHash: e.transactionHash,
          })),
        }

        // If partner strategy, also fetch partner-specific fund events
        if (isPartner) {
          try {
            const partnerRes = await fetch(subgraphUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: PARTNER_FUNDS_QUERY,
                variables: { markeeId: id },
              }),
            })
            const partnerResult = await partnerRes.json()
            const partnerEvents = partnerResult.data?.partnerFundsAddeds || []
            detail.partnerFundsEvents = partnerEvents.map((e: any) => ({
              id: e.id,
              markee: m.address,
              addedBy: e.addedBy,
              amount: BigInt(e.amount),
              newTotal: BigInt(e.newMarkeeTotal),
              beneficiaryAmount: BigInt(e.beneficiaryAmount),
              revNetAmount: BigInt(e.revNetAmount),
              timestamp: BigInt(e.timestamp),
              blockNumber: BigInt(e.blockNumber),
              transactionHash: e.transactionHash,
            }))
          } catch {
            // Non-critical — fall back to regular funds events
          }
        }

        setMarkee(detail)
      } catch (err) {
        console.error('[useMarkeeDetail] Error:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetail()
  }, [markeeAddress])

  return { markee, isLoading, error }
}
