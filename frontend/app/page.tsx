'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { useFixedMarkees } from '@/lib/contracts/useFixedMarkees'
import { useReactions } from '@/hooks/useReactions'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { FixedPriceModal } from '@/components/modals/FixedPriceModal'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'

import { formatDistanceToNow } from 'date-fns'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

function PartnerCard({ logo, name, description }: { logo: string; name: string; description: string }) {
  return (
    <a href="/ecosystem" className="bg-[#060A2A] rounded-lg shadow-md p-6 border border-[#8A8FBF]/30 hover:border-[#F897FE] transition-all group block">
      <div className="flex flex-col items-center text-center">
        <img src={logo} alt={name} className="h-16 object-contain mb-4 group-hover:scale-110 transition-transform" />
        <h3 className="font-bold text-[#EDEEFF] mb-2">{name}</h3>
        <p className="text-sm text-[#8A8FBF]">{description}</p>
      </div>
    </a>
  )
}

export default function Home() {
  const { address } = useAccount()
  const { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch } = useMarkees()
  const { markees: fixedMarkees, isLoading: isLoadingFixed } = useFixedMarkees()
  const { reactions, addReaction, isLoading: reactionsLoading, error: reactionsError } = useReactions()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false)
  const [selectedFixedMarkee, setSelectedFixedMarkee] = useState<FixedMarkee | null>(null)

  // Fix hydration issue - completely suppress SSR for this page
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Simple refetch after transaction - waits 3 seconds to give subgraph time to index
  const handleTransactionSuccess = useCallback(() => {
    setTimeout(() => {
      console.log('[Markees] Refetching after transaction success')
      refetch()
    }, 3000)
  }, [refetch])

  const handleCreateNew = useCallback(() => {
    setSelectedMarkee(null)
    setModalMode('create')
    setIsModalOpen(true)
  }, [])

  const handleEditMessage = useCallback((markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('updateMessage')
    setIsModalOpen(true)
  }, [])

  const handleAddFunds = useCallback((markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('addFunds')
    setIsModalOpen(true)
  }, [])

  const handleReact = useCallback(async (markee: Markee, emoji: string) => {
    if (!address) {
      console.error('Wallet not connected')
      return
    }

    try {
      await addReaction(markee.address, emoji, markee.chainId)
    } catch (err) {
      console.error('Failed to add reaction:', err)
    }
  }, [address, addReaction])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }, [])

  const handleFixedMarkeeClick = useCallback((fixedMarkee: FixedMarkee) => {
    setSelectedFixedMarkee(fixedMarkee)
    setIsFixedModalOpen(true)
  }, [])

  const handleFixedModalClose = useCallback(() => {
    setIsFixedModalOpen(false)
    setSelectedFixedMarkee(null)
  }, [])

  // Show loading spinner during SSR and initial client render
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#060A2A]">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F897FE]"></div>
        </div>
      </div>
    )
  }

  
  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" />

      {/* Hero Section - Fixed Price Messages (Readerboard Style) */}
      <section className="relative py-24 border-b border-[#8A8FBF]/20 overflow-hidden">
        {/* Background layer - absolutely positioned and non-interactive */}
        <HeroBackground />
          
        {/* Foreground content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {isLoadingFixed ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="readerboard-card animate-pulse">
                    <div className="readerboard-inner">
                      <div className="h-16 bg-[#8A8FBF]/20 rounded mx-8"></div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              fixedMarkees.map((fixedMarkee, index) => (
                <button
                  key={index}
                  onClick={() => handleFixedMarkeeClick(fixedMarkee)}
                  className="group readerboard-card cursor-pointer transition-all hover:shadow-2xl hover:shadow-[#7B6AF4]/20 hover:-translate-y-1"
                >
                  <div className="readerboard-inner">
                    <div className="readerboard-text">{fixedMarkee.message || fixedMarkee.name}</div>
                  </div>

                  <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100 pointer-events-none">
                    <div className="bg-[#7B6AF4] text-[#060A2A] text-sm font-semibold px-6 py-2 rounded-full shadow-lg whitespace-nowrap">
                      {fixedMarkee.price ? `${fixedMarkee.price} ETH to change` : 'Loading...'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      
      <style jsx>{`
        .readerboard-card {
          position: relative;
          background: #edeeff;
          border-radius: 4px;
          padding: 4px;
          box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.6);
          aspect-ratio: 2 / 1;
        }

        .readerboard-inner {
          position: relative;
          width: 100%;
          height: 100%;
          background: repeating-linear-gradient(0deg, #0a0f3d 0px, #0a0f3d 28px, #060a2a 28px, #060a2a 30px);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
        }

        .readerboard-text {
          font-family: var(--font-jetbrains-mono), 'Courier New', Consolas, monospace;
          font-size: clamp(18px, 3vw, 28px);
          font-weight: 600;
          line-height: 1.1;
          letter-spacing: -0.5px;
          color: #edeeff;
          text-align: center;
          word-wrap: break-word;
          max-width: 100%;
          transition: all 0.2s ease;
        }

        .group:hover .readerboard-text {
          color: #7b6af4;
          transform: scale(1.02);
        }

        @media (max-width: 768px) {
          .readerboard-card {
            aspect-ratio: 5 / 3;
          }

          .readerboard-text {
            font-size: 20px;
          }
        }
      `}</style>

      {/* Explore our Ecosystem */}
      <section className="bg-[#0A0F3D] py-16 border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-4 text-center">Our Ecosystem</h2>
          <p className="text-center text-[#8A8FBF] mb-12 text-lg">Markee is coming soon to a website near you...</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <PartnerCard logo="/partners/gardens.png" name="Gardens" description="Community Governance" />
            <PartnerCard logo="/partners/juicebox.png" name="Juicebox" description="Crowdfunding Protocol" />
            <PartnerCard logo="/partners/revnets.png" name="RevNets" description="Tokenized Revenues" />
            <PartnerCard logo="/partners/breadcoop.png" name="Bread Cooperative" description="Digital Co-op" />
          </div>
        </div>
      </section>

      {/* Leaderboard - TopDawg Strategy (from Base - canonical chain) */}
      <section className="bg-[#060A2A] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-[#EDEEFF] mb-6">Buy a Message.  Own the Network.</h3>

            <p className="text-lg text-[#8A8FBF] mb-6">
              Markee is a digital cooperative owned by its participants. Buy a message to join - and let people know what you need to say.
            </p>

            <div className="flex gap-4 justify-center mb-8">
              <button
                onClick={handleCreateNew}
                className="bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#7C9CFF] transition-colors"
              >
                Buy a Message
              </button>
              <a
                href="/how-it-works"
                className="bg-[#0A0F3D] text-[#F897FE] border-2 border-[#F897FE] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#F897FE]/10 transition-colors"
              >
                How it Works
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3 ml-auto">
              {(isFetchingFresh || reactionsLoading) && (
                <div className="flex items-center gap-2 text-sm text-[#8A8FBF]">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#F897FE]"></div>
                  <span>Updating...</span>
                </div>
              )}
              {lastUpdated && !isLoading && (
                <div className="text-sm text-[#8A8FBF]">Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</div>
              )}
            </div>
          </div>

          {reactionsError && (
            <div className="mb-4 p-4 bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg text-[#8BC8FF] max-w-2xl mx-auto">
              <p className="text-sm">{reactionsError}</p>
            </div>
          )}

          {isLoading && markees.length === 0 && (
            <div>
              <LeaderboardSkeleton />
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 max-w-lg mx-auto">
                <p className="text-[#8BC8FF] font-medium mb-2">Error loading Markees</p>
                <p className="text-[#8A8FBF] text-sm">{error.message}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && markees.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-[#0A0F3D] rounded-lg p-8 max-w-lg mx-auto border border-[#8A8FBF]/20">
                <div className="text-6xl mb-4">🪧</div>
                <p className="text-[#8A8FBF] text-lg">No Markees yet. Be the first!</p>
              </div>
            </div>
          )}

          {markees.length > 0 && (
            <div className={isFetchingFresh ? 'opacity-90 transition-opacity' : ''}>
              {markees[0] && (
                <MarkeeCard
                  markee={markees[0]}
                  rank={1}
                  size="hero"
                  userAddress={address}
                  onEditMessage={handleEditMessage}
                  onAddFunds={handleAddFunds}
                  onReact={handleReact}
                  reactions={reactions.get(markees[0].address.toLowerCase())}
                />
              )}

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
                      onReact={handleReact}
                      reactions={reactions.get(markees[1].address.toLowerCase())}
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
                      onReact={handleReact}
                      reactions={reactions.get(markees[2].address.toLowerCase())}
                    />
                  )}
                </div>
              )}

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
                      onReact={handleReact}
                      reactions={reactions.get(markee.address.toLowerCase())}
                    />
                  ))}
                </div>
              )}

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
                        onReact={handleReact}
                        reactions={reactions.get(markee.address.toLowerCase())}
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
      
      <TopDawgModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={handleTransactionSuccess}
      />

      <FixedPriceModal
        isOpen={isFixedModalOpen}
        onClose={handleFixedModalClose}
        fixedMarkee={selectedFixedMarkee}
        onSuccess={handleTransactionSuccess}
      />

    </div>
  )
}
