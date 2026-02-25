'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { useReactions } from '@/hooks/useReactions'
import { useViews } from '@/hooks/useViews'
import { PARTNERS } from '@/lib/contracts/usePartnerMarkees'
import { SUBGRAPH_URLS, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatDistanceToNow } from 'date-fns'
import type { Markee } from '@/types'

// GraphQL queries for fetching ALL markees from a partner strategy
const COOPERATIVE_ALL_MARKEES_QUERY = `
  query GetAllCooperativeMarkees {
    topDawgStrategy(id: "0x558eb41ec9cc90b86550617eef5f180ea60e0e3a") {
      totalFundsRaised
      totalMarkeesCreated
      markees(
        orderBy: totalFundsAdded
        orderDirection: desc
        first: 1000
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

const PARTNER_ALL_MARKEES_QUERY = `
  query GetAllPartnerMarkees($strategyId: ID!) {
    topDawgPartnerStrategy(id: $strategyId) {
      totalFundsRaised
      totalMarkeesCreated
      markees(
        orderBy: totalFundsAdded
        orderDirection: desc
        first: 1000
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

export default function PartnerPage() {
  const params = useParams()
  const { address } = useAccount()
  
  const {
    reactions,
    toggleReaction,
    removeReaction,
    isLoading: reactionsLoading,
    error: reactionsError,
  } = useReactions()
  
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const partner = PARTNERS.find(p => p.slug === params.partner)

  // ── View tracking ──────────────────────────────────────────────────
  const { views, trackView } = useViews(markees)

  useEffect(() => {
    if (markees.length === 0) return
    markees.slice(0, 10).forEach(trackView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markees.map(m => m.address).join(',')])

  const getViews = (markee: Markee) => {
    const v = views.get(markee.address.toLowerCase())
    return { totalViews: v?.totalViews, messageViews: v?.messageViews }
  }
  // ──────────────────────────────────────────────────────────────────

  const fetchMarkees = useCallback(async () => {
    if (!partner) return

    try {
      setIsLoading(true)
      setError(null)

      const subgraphUrl = SUBGRAPH_URLS[CANONICAL_CHAIN_ID]
      
      if (!subgraphUrl) {
        throw new Error('Subgraph URL not configured')
      }

      const query = partner.isCooperative ? COOPERATIVE_ALL_MARKEES_QUERY : PARTNER_ALL_MARKEES_QUERY
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

      if (!strategyData || !strategyData.markees) {
        setMarkees([])
        setLastUpdated(new Date())
        setIsLoading(false)
        return
      }

      const transformedMarkees: Markee[] = strategyData.markees.map((m: any) => ({
        address: m.address,
        message: m.message,
        name: m.name,
        owner: m.owner,
        totalFundsAdded: BigInt(m.totalFundsAdded),
        pricingStrategy: m.pricingStrategy,
        strategyAddress: partner.strategyAddress,
        chainId: CANONICAL_CHAIN_ID
      }))

      setMarkees(transformedMarkees)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching markees:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch markees'))
    } finally {
      setIsLoading(false)
    }
  }, [partner])

  useEffect(() => {
    fetchMarkees()
  }, [fetchMarkees])

  const handleCreateNew = () => {
    setSelectedMarkee(null)
    setModalMode('create')
    setIsModalOpen(true)
  }

  const handleEditMessage = (markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('updateMessage')
    setIsModalOpen(true)
  }

  const handleAddFunds = (markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('addFunds')
    setIsModalOpen(true)
  }

  const handleReact = useCallback(
    async (markee: Markee, emoji: string) => {
      if (!address) return
      try {
        await toggleReaction(markee.address, emoji, markee.chainId)
      } catch (err) {
        console.error('Failed to toggle reaction:', err)
      }
    },
    [address, toggleReaction]
  )

  const handleRemoveReaction = useCallback(
    async (markee: Markee) => {
      if (!address) return
      try {
        await removeReaction(markee.address)
      } catch (err) {
        console.error('Failed to remove reaction:', err)
      }
    },
    [address, removeReaction]
  )

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }

  const handleTransactionSuccess = () => {
    setTimeout(() => {
      fetchMarkees()
    }, 3000)
  }

  if (!partner) {
    return (
      <div className="min-h-screen bg-[#060A2A]">
        <Header activePage="ecosystem" />
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#EDEEFF] mb-4">Partner Not Found</h1>
            <Link href="/ecosystem" className="text-[#F897FE] hover:underline">
              ← Back to Ecosystem
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
              Ecosystem
            </Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">{partner.name}</span>
          </div>
        </div>
      </section>

      {/* Partner Header */}
      <section className="bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6 mb-6">
            <img src={partner.logo} alt={partner.name} className="h-16 w-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-[#EDEEFF] mb-2">{partner.name} Messages</h1>
              <p className="text-[#8A8FBF]">{partner.description}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              {reactionsLoading && (
                <div className="flex items-center gap-2 text-sm text-[#8A8FBF]">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#F897FE]" />
                  <span>Loading reactions...</span>
                </div>
              )}
              {lastUpdated && (
                <div className="text-sm text-[#8A8FBF]">
                  Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </div>
              )}
            </div>

            <button 
              onClick={handleCreateNew}
              className="bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
            >
              Buy a Message
            </button>
          </div>

          {reactionsError && (
            <div className="mt-4 p-4 bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg max-w-2xl">
              <p className="text-sm text-[#8BC8FF]">{reactionsError}</p>
            </div>
          )}
        </div>
      </section>

      {/* Leaderboard */}
      <section className="bg-[#060A2A] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading && markees.length === 0 && <LeaderboardSkeleton />}

          {error && (
            <div className="text-center py-12">
              <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 max-w-lg mx-auto">
                <p className="text-[#8BC8FF] font-medium mb-2">Error loading messages</p>
                <p className="text-[#8A8FBF] text-sm">{error.message}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && markees.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-[#0A0F3D] rounded-lg p-8 max-w-lg mx-auto border border-[#8A8FBF]/20">
                <div className="text-6xl mb-4">🪧</div>
                <p className="text-[#8A8FBF] text-lg mb-4">No messages yet for {partner.name}</p>
                <button 
                  onClick={handleCreateNew}
                  className="bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
                >
                  Be the First!
                </button>
              </div>
            </div>
          )}

          {markees.length > 0 && (
            <div>
              {/* #1 Hero */}
              <Link href={`/markee/${markees[0].address}`} className="block">
                <MarkeeCard 
                  markee={markees[0]} 
                  rank={1} 
                  size="hero"
                  userAddress={address}
                  onEditMessage={handleEditMessage}
                  onAddFunds={handleAddFunds}
                  onReact={handleReact}
                  onRemoveReaction={handleRemoveReaction}
                  reactions={reactions.get(markees[0].address.toLowerCase())}
                  {...getViews(markees[0])}
                />
              </Link>

              {/* #2-3 Large */}
              {markees.length > 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {markees[1] && (
                    <Link href={`/markee/${markees[1].address}`} className="block">
                      <MarkeeCard 
                        markee={markees[1]} 
                        rank={2} 
                        size="large"
                        userAddress={address}
                        onEditMessage={handleEditMessage}
                        onAddFunds={handleAddFunds}
                        onReact={handleReact}
                        onRemoveReaction={handleRemoveReaction}
                        reactions={reactions.get(markees[1].address.toLowerCase())}
                        {...getViews(markees[1])}
                      />
                    </Link>
                  )}
                  {markees[2] && (
                    <Link href={`/markee/${markees[2].address}`} className="block">
                      <MarkeeCard 
                        markee={markees[2]} 
                        rank={3} 
                        size="large"
                        userAddress={address}
                        onEditMessage={handleEditMessage}
                        onAddFunds={handleAddFunds}
                        onReact={handleReact}
                        onRemoveReaction={handleRemoveReaction}
                        reactions={reactions.get(markees[2].address.toLowerCase())}
                        {...getViews(markees[2])}
                      />
                    </Link>
                  )}
                </div>
              )}

              {/* #4-26 Grid */}
              {markees.length > 3 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {markees.slice(3, 26).map((markee, index) => (
                    <Link key={markee.address} href={`/markee/${markee.address}`} className="block">
                      <MarkeeCard 
                        markee={markee} 
                        rank={index + 4} 
                        size="medium"
                        userAddress={address}
                        onEditMessage={handleEditMessage}
                        onAddFunds={handleAddFunds}
                        onReact={handleReact}
                        onRemoveReaction={handleRemoveReaction}
                        reactions={reactions.get(markee.address.toLowerCase())}
                        {...getViews(markee)}
                      />
                    </Link>
                  ))}
                </div>
              )}

              {/* #27+ List */}
              {markees.length > 26 && (
                <div className="bg-[#0A0F3D] rounded-lg shadow-sm p-6 border border-[#8A8FBF]/20">
                  <h4 className="text-lg font-semibold text-[#EDEEFF] mb-4">More Messages</h4>
                  <div className="space-y-2">
                    {markees.slice(26).map((markee, index) => (
                      <Link key={markee.address} href={`/markee/${markee.address}`} className="block">
                        <MarkeeCard 
                          markee={markee} 
                          rank={index + 27} 
                          size="list"
                          userAddress={address}
                          onEditMessage={handleEditMessage}
                          onAddFunds={handleAddFunds}
                          onReact={handleReact}
                          onRemoveReaction={handleRemoveReaction}
                          reactions={reactions.get(markee.address.toLowerCase())}
                          {...getViews(markee)}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />

      <TopDawgModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={handleTransactionSuccess}
        strategyAddress={partner.isCooperative ? undefined : partner.strategyAddress as `0x${string}`}
        partnerName={partner.isCooperative ? undefined : partner.name}
        partnerSplitPercentage={partner.isCooperative ? undefined : partner.percentToBeneficiary / 100}
        topFundsAdded={markees[0]?.totalFundsAdded}
      />
    </div>
  )
}
