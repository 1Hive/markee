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
import { PARTNERS } from '@/lib/contracts/usePartnerMarkees'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { formatDistanceToNow } from 'date-fns'
import type { Markee } from '@/types'

const MARKEE_ABI = [
  parseAbiItem('function message() view returns (string)'),
  parseAbiItem('function owner() view returns (address)'),
  parseAbiItem('function name() view returns (string)'),
  parseAbiItem('function totalFundsAdded() view returns (uint256)')
] as const

export default function PartnerPage() {
  const params = useParams()
  const { address } = useAccount()
  
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  // Find the partner
  const partner = PARTNERS.find(p => p.slug === params.partner)

  // Fetch markees for this partner
  const fetchMarkees = useCallback(async () => {
    if (!partner) return

    try {
      setIsLoading(true)
      setError(null)

      const client = createPublicClient({
        chain: base,
        transport: http()
      })

      // Get MarkeeCreated events
      const events = await client.getLogs({
        address: partner.strategyAddress as `0x${string}`,
        event: parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, uint256 initialAmount, string message)'),
        fromBlock: 'earliest',
        toBlock: 'latest'
      })

      if (events.length === 0) {
        setMarkees([])
        setLastUpdated(new Date())
        setIsLoading(false)
        return
      }

      // Fetch details for each markee
      const markeeData = await Promise.all(
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

      // Filter and sort
      const validMarkees = markeeData.filter((m): m is Markee => m !== null)
      validMarkees.sort((a, b) => Number(b.totalFundsAdded - a.totalFundsAdded))

      setMarkees(validMarkees)
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

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }

  const handleTransactionSuccess = () => {
    // Refetch after a delay to allow subgraph to index
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
        </div>
      </section>

      {/* Leaderboard */}
      <section className="bg-[#060A2A] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading && markees.length === 0 && (
            <div>
              <LeaderboardSkeleton />
            </div>
          )}

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
              {/* #1 Spot - Full Width */}
              {markees[0] && (
                <MarkeeCard 
                  markee={markees[0]} 
                  rank={1} 
                  size="hero"
                  userAddress={address}
                  onEditMessage={handleEditMessage}
                  onAddFunds={handleAddFunds}
                />
              )}

              {/* #2 and #3 - Two Column */}
              {markees.length > 1 && (
                <div className="grid grid-cols-2 gap-6 mb-6">
                  {markees[1] && (
                    <MarkeeCard 
                      markee={markees[1]} 
                      rank={2} 
                      size="large"
                      userAddress={address}
                      onEditMessage={handleEditMessage}
                      onAddFunds={handleAddFunds}
                    />
                  )}
                  {markees[2] && (
                    <MarkeeCard 
                      markee={markees[2]} 
                      rank={3} 
                      size="large"
                      userAddress={address}
                      onEditMessage={handleEditMessage}
                      onAddFunds={handleAddFunds}
                    />
                  )}
                </div>
              )}

              {/* #4-26 - Grid */}
              {markees.length > 3 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {markees.slice(3, 26).map((markee, index) => (
                    <MarkeeCard 
                      key={markee.address} 
                      markee={markee} 
                      rank={index + 4} 
                      size="medium"
                      userAddress={address}
                      onEditMessage={handleEditMessage}
                      onAddFunds={handleAddFunds}
                    />
                  ))}
                </div>
              )}

              {/* #27+ - List View */}
              {markees.length > 26 && (
                <div className="bg-[#0A0F3D] rounded-lg shadow-sm p-6 border border-[#8A8FBF]/20">
                  <h4 className="text-lg font-semibold text-[#EDEEFF] mb-4">More Messages</h4>
                  <div className="space-y-2">
                    {markees.slice(26).map((markee, index) => (
                      <MarkeeCard 
                        key={markee.address} 
                        markee={markee} 
                        rank={index + 27} 
                        size="list"
                        userAddress={address}
                        onEditMessage={handleEditMessage}
                        onAddFunds={handleAddFunds}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {/* Modal */}
      <TopDawgModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={handleTransactionSuccess}
        strategyAddress={partner.strategyAddress as `0x${string}`}
      />
    </div>
  )
}
