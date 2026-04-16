'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { useFixedMarkees } from '@/lib/contracts/useFixedMarkees'
import { useReactions } from '@/hooks/useReactions'
import { useViews } from '@/hooks/useViews'
import { useFixedViews } from '@/hooks/useFixedViews'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { FixedPriceModal } from '@/components/modals/FixedPriceModal'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { Eye } from 'lucide-react'
import { formatEther } from 'viem'

import { formatDistanceToNow } from 'date-fns'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

export default function Home() {
  const { address } = useAccount()

  const { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch } = useMarkees()
  const { markees: fixedMarkees, isLoading: isLoadingFixed } = useFixedMarkees()

  // Ecosystem stats (same source as /ecosystem page)
  const [ecoLeaderboards, setEcoLeaderboards] = useState<{ topFundsAddedRaw: string; markeeCount: number; isLegacy?: boolean }[]>([])
  const [ecoTotalFunds, setEcoTotalFunds] = useState('0')
  const [isLoadingEco, setIsLoadingEco] = useState(true)

  useEffect(() => {
    fetch(`/api/ecosystem/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setEcoLeaderboards(data.leaderboards ?? [])
          setEcoTotalFunds(data.totalPlatformFunds ?? '0')
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingEco(false))
  }, [])

  const ecoActive = ecoLeaderboards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n)
  const ecoMessages = ecoActive.reduce(
    (sum, lb) => sum + (lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)),
    0
  )

  const {
    reactions,
    toggleReaction,
    removeReaction,
    isLoading: reactionsLoading,
    error: reactionsError,
  } = useReactions()

  // ── Leaderboard view tracking ────────────────────────────────────────────────
  const { views, trackView } = useViews(markees)

  useEffect(() => {
    if (markees.length === 0) return
    markees.slice(0, 10).forEach(trackView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markees.map(m => m.address).join(',')])

  // ── Hero readerboard view tracking ──────────────────────────────────────────
  const { views: fixedViews, trackView: trackFixedView } = useFixedViews(fixedMarkees)

  useEffect(() => {
    if (fixedMarkees.length === 0) return
    fixedMarkees.forEach(trackFixedView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedMarkees.map(m => m.strategyAddress).join(',')])
  // ────────────────────────────────────────────────────────────────────────────

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false)
  const [selectedFixedMarkee, setSelectedFixedMarkee] = useState<FixedMarkee | null>(null)

  const handleTransactionSuccess = useCallback(() => {
    setTimeout(() => {
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

  // Helper to get view counts for a leaderboard markee
  const getViews = (markee: Markee) => {
    const v = views.get(markee.address.toLowerCase())
    return {
      totalViews: v?.totalViews,
      messageViews: v?.messageViews,
    }
  }

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" useRegularLinks />

      {/* Hero */}
      <section className="relative py-24 border-b border-[#8A8FBF]/20 overflow-hidden">
        <HeroBackground />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {isLoadingFixed ? (
              [1, 2, 3].map(i => (
                <div key={i} className="readerboard-card animate-pulse">
                  <div className="readerboard-inner">
                    <div className="h-16 bg-[#8A8FBF]/20 rounded mx-8" />
                  </div>
                </div>
              ))
            ) : (
              fixedMarkees.map((fixedMarkee, index) => {
                const viewData = fixedViews.get(fixedMarkee.strategyAddress.toLowerCase())
                return (
                  <button
                    key={index}
                    onClick={() => handleFixedMarkeeClick(fixedMarkee)}
                    className="group readerboard-card cursor-pointer transition-all hover:shadow-2xl hover:shadow-[#7B6AF4]/20 hover:-translate-y-1"
                  >
                    <div className="readerboard-inner">
                      {/* View count badge — top-right corner */}
                      {viewData && viewData.totalViews > 0 && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#060A2A]/70 backdrop-blur-sm text-[#8A8FBF] text-xs px-2 py-1 rounded-full pointer-events-none z-10">
                          <Eye className="w-3 h-3" />
                          <span>{viewData.totalViews.toLocaleString()}</span>
                        </div>
                      )}

                      <div className="readerboard-text">{fixedMarkee.message || fixedMarkee.name}</div>
                    </div>

                    <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100 pointer-events-none">
                      <div className="bg-[#7B6AF4] text-[#060A2A] text-sm font-semibold px-6 py-2 rounded-full shadow-lg whitespace-nowrap">
                        {fixedMarkee.priceWei && fixedMarkee.priceWei !== '0'
                          ? `${formatEther(BigInt(fixedMarkee.priceWei))} ETH to Change`
                          : 'Change Message'}
                      </div>
                    </div>
                  </button>
                )
              })
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

      {/* Raise Funds with Markee */}
      <section className="bg-[#0A0F3D] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-[#EDEEFF] mb-4">Raise Funds with Markee</h2>
          <p className="text-[#8A8FBF] mb-8">Join our growing network of digital communities getting funded with Markee</p>

          <div className="flex items-center justify-center gap-8 mb-8 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F897FE] animate-pulse" />
              {isLoadingEco ? (
                <span className="text-[#F897FE] font-semibold text-3xl animate-pulse">--</span>
              ) : (
                <span className="text-[#F897FE] font-semibold text-3xl">{ecoActive.length}</span>
              )}
              <span className="text-[#8A8FBF]">active Markees</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EDEEFF] animate-pulse" />
              {isLoadingEco ? (
                <span className="text-[#EDEEFF] font-semibold text-3xl animate-pulse">--</span>
              ) : (
                <span className="text-[#EDEEFF] font-semibold text-3xl">{ecoMessages.toLocaleString()}</span>
              )}
              <span className="text-[#8A8FBF]">messages bought</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7C9CFF] animate-pulse" />
              {isLoadingEco ? (
                <span className="text-[#7C9CFF] font-semibold text-3xl animate-pulse">--</span>
              ) : (
                <span className="text-[#7C9CFF] font-semibold text-3xl">
                  {parseFloat(ecoTotalFunds) < 0.001 ? '< 0.001 ETH' : `${parseFloat(ecoTotalFunds).toFixed(3)} ETH`}
                </span>
              )}
              <span className="text-[#8A8FBF]">total raised</span>
            </div>
          </div>

          <a
            href="/create-a-markee"
            className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-8 py-4 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
          >
            Create a Markee
          </a>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="bg-[#060A2A] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-[#EDEEFF] mb-6">A Marketplace for Digital Real Estate</h3>

              <p className="text-lg text-[#8A8FBF] mb-6">
                Buy a message on your favorite site from these verified Markees.
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
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#F897FE]" />
                  <span>Updating...</span>
                </div>
              )}
              {lastUpdated && !isLoading && (
                <div className="text-sm text-[#8A8FBF]">
                  Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </div>
              )}
            </div>
          </div>

          {reactionsError && (
            <div className="mb-4 p-4 bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg max-w-2xl mx-auto">
              <p className="text-sm text-[#8BC8FF]">{reactionsError}</p>
            </div>
          )}

          {isLoading && <LeaderboardSkeleton />}

          {!isLoading && markees.length > 0 && (
            <>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {markees.slice(1, 3).map((markee, i) => (
                  <Link key={markee.address} href={`/markee/${markee.address}`} className="block">
                    <MarkeeCard
                      markee={markee}
                      rank={i + 2}
                      size="large"
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

              {/* #4-26 Medium */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {markees.slice(3, 26).map((markee, i) => (
                  <Link key={markee.address} href={`/markee/${markee.address}`} className="block">
                    <MarkeeCard
                      markee={markee}
                      rank={i + 4}
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

              {/* #27+ List */}
              {markees.length > 26 && (
                <div className="bg-[#0A0F3D] rounded-lg p-6 border border-[#8A8FBF]/20">
                  {markees.slice(26).map((markee, i) => (
                    <Link key={markee.address} href={`/markee/${markee.address}`} className="block">
                      <MarkeeCard
                        markee={markee}
                        rank={i + 27}
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
              )}
            </>
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
        topFundsAdded={markees[0]?.totalFundsAdded} 
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
