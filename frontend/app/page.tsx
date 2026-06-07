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
import { V13_LEADERBOARDS } from '@/lib/contracts/addresses'
import { Eye } from 'lucide-react'
import { formatEther } from 'viem'

const fmtViews = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function MetricStat({ n, label, color, dot }: { n: string; label: string; color: string; dot: string }) {
  return (
    <div className="metric-cell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="metric-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="metric-dot" style={{ width: 9, height: 9, borderRadius: 99, background: dot, boxShadow: `0 0 12px ${dot}`, flexShrink: 0, display: 'inline-block' }} />
        <span className="metric-num" style={{ fontSize: 34, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      </span>
      <span className="metric-label" style={{ fontSize: 13, color: '#8A8FBF', marginLeft: 17 }}>{label}</span>
    </div>
  )
}

import { formatDistanceToNow } from 'date-fns'
import { NETWORK_PAUSED } from '@/lib/paused'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

export default function Home() {
  const { address } = useAccount()
  const ethPrice = useEthPrice()

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
    if (NETWORK_PAUSED) return
    setSelectedMarkee(null)
    setModalMode('create')
    setIsModalOpen(true)
  }, [])

  const handleEditMessage = useCallback((markee: Markee) => {
    if (NETWORK_PAUSED) return
    setSelectedMarkee(markee)
    setModalMode('updateMessage')
    setIsModalOpen(true)
  }, [])

  const handleAddFunds = useCallback((markee: Markee) => {
    if (NETWORK_PAUSED) return
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
    if (NETWORK_PAUSED) return
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

        <div className="relative z-10 px-4 sm:px-6 lg:px-8">
          <div className="signs-grid">
            {isLoadingFixed ? (
              [1, 2, 3].map(i => (
                <div key={i} className="reader-card animate-pulse">
                  <div className="h-10 bg-[#8A8FBF]/20 rounded w-3/4" />
                </div>
              ))
            ) : (
              fixedMarkees.map((fixedMarkee, index) => {
                const viewData = fixedViews.get(fixedMarkee.strategyAddress.toLowerCase())
                return (
                  <button
                    key={index}
                    onClick={() => handleFixedMarkeeClick(fixedMarkee)}
                    className="reader-card"
                  >
                    {viewData && viewData.totalViews > 0 && (
                      <span className="reader-views">
                        <Eye style={{ width: 11, height: 11 }} />
                        {fmtViews(viewData.totalViews)}
                      </span>
                    )}
                    <span className="reader-text">{fixedMarkee.message || fixedMarkee.name}</span>
                    <div className="reader-pill">
                      {fixedMarkee.priceWei && fixedMarkee.priceWei !== '0'
                        ? ethPrice
                          ? `${formatUsd(parseFloat(formatEther(BigInt(fixedMarkee.priceWei))) * ethPrice)} to change`
                          : `${formatEther(BigInt(fixedMarkee.priceWei))} ETH to change`
                        : 'Change message'}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </section>

      {/* Pay to be seen */}
      <section className="metrics-section bg-[#0A0F3D] py-16 border-b border-[#8A8FBF]/20">
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 40px' }}>
          <h1 className="text-center mb-9" style={{ fontSize: 'clamp(36px,5.5vw,60px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, color: '#EDEEFF' }}>
            Pay to be <span style={{ color: '#F897FE' }}>seen</span>
          </h1>
          <div className="metrics-row">
            <MetricStat
              n={isLoadingEco ? '--' : ecoLeaderboards.length.toLocaleString()}
              label="domains"
              color="#7B6AF4"
              dot="#7B6AF4"
            />
            <MetricStat
              n={isLoadingEco ? '--' : ecoActive.length.toLocaleString()}
              label="active Markees"
              color="#F897FE"
              dot="#F897FE"
            />
            <MetricStat
              n={isLoadingEco ? '--' : ecoMessages.toLocaleString()}
              label="messages bought"
              color="#EDEEFF"
              dot="#EDEEFF"
            />
            <MetricStat
              n={isLoadingEco || !ethPrice ? '--' : formatUsd(parseFloat(ecoTotalFunds) * ethPrice)}
              label="total funds raised"
              color="#1DB227"
              dot="#1DB227"
            />
            <MetricStat
              n={(() => { const t = Array.from(views.values()).reduce((s, v) => s + (v.totalViews || 0), 0); return t > 0 ? fmtViews(t) : '--' })()}
              label="views"
              color="#7C9CFF"
              dot="#7C9CFF"
            />
          </div>
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
        strategyAddress={selectedMarkee
          ? selectedMarkee.pricingStrategy as `0x${string}`
          : V13_LEADERBOARDS.COOPERATIVE}
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
