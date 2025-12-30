'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
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

import { formatDistanceToNow } from 'date-fns'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

function PartnerCard({ logo, name, description }: { logo: string; name: string; description: string }) {
  return (
    <div className="bg-[#060A2A] rounded-lg shadow-md p-6 border border-[#8A8FBF]/30 hover:border-[#F897FE] transition-all group">
      <div className="flex flex-col items-center text-center">
        <img src={logo} alt={name} className="h-16 object-contain mb-4 group-hover:scale-110 transition-transform" />
        <h3 className="font-bold text-[#EDEEFF] mb-2">{name}</h3>
        <p className="text-sm text-[#8A8FBF]">{description}</p>
      </div>
    </div>
  )
}

type FloatingGlyph = {
  id: string
  ch: string
  xPct: number
  yPct: number
  sizePx: number
  opacity: number
  blurPx: number
  driftSec: number
  driftPx: number
  rotateDeg: number
  layer: 1 | 2 | 3
}

function CosmicHeroBackground() {
  const rootRef = useRef<HTMLDivElement | null>(null)

  // deterministic-ish layout (no Math.random() every render)
  const glyphs = useMemo<FloatingGlyph[]>(() => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const pick = (i: number) => letters[(i * 7 + 11) % letters.length]

    const make = (i: number): FloatingGlyph => {
      // simple deterministic “hash” from i
      const a = (i * 73) % 101
      const b = (i * 37) % 97
      const c = (i * 19) % 89

      const layer = (i % 3) + 1 as 1 | 2 | 3
      const xPct = (a / 100) * 100
      const yPct = (b / 100) * 100

      const sizePx =
        layer === 1 ? 44 + (c % 18) : layer === 2 ? 28 + (c % 14) : 18 + (c % 10)

      // Keep dim: opacity in ~0.04–0.11 range
      const opacity =
        layer === 1 ? 0.08 + ((c % 10) / 10) * 0.03 : layer === 2 ? 0.06 + ((c % 10) / 10) * 0.03 : 0.04 + ((c % 10) / 10) * 0.03

      const blurPx = layer === 1 ? 1.5 : layer === 2 ? 1.0 : 0.5
      const driftSec = layer === 1 ? 22 + (a % 8) : layer === 2 ? 28 + (a % 10) : 34 + (a % 12)
      const driftPx = layer === 1 ? 26 : layer === 2 ? 18 : 12
      const rotateDeg = (a * 3.6) % 360

      return {
        id: `g-${i}`,
        ch: pick(i),
        xPct,
        yPct,
        sizePx,
        opacity,
        blurPx,
        driftSec,
        driftPx,
        rotateDeg,
        layer,
      }
    }

    // 22 glyphs is enough to “feel” present but not noisy
    return Array.from({ length: 22 }, (_, i) => make(i))
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = (e.clientX - cx) / Math.max(1, rect.width / 2)
      const dy = (e.clientY - cy) / Math.max(1, rect.height / 2)

      // clamp-ish
      const px = Math.max(-1, Math.min(1, dx))
      const py = Math.max(-1, Math.min(1, dy))

      el.style.setProperty('--mx', px.toFixed(3))
      el.style.setProperty('--my', py.toFixed(3))
    }

    const onScroll = () => {
      // parallax scroll factor for subtle vertical drift
      const y = window.scrollY || 0
      el.style.setProperty('--sy', (y / 800).toFixed(3))
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        // defaults if no mouse yet
        // @ts-expect-error CSS vars
        '--mx': '0',
        '--my': '0',
        '--sy': '0',
      }}
    >
      {/* Base deep-space gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_20%_15%,rgba(123,106,244,0.22),transparent_55%),radial-gradient(900px_600px_at_80%_25%,rgba(248,151,254,0.14),transparent_60%),linear-gradient(135deg,#060A2A,#0A0F3D_40%,#060A2A)]" />

      {/* Star specks */}
      <div className="absolute inset-0 opacity-[0.22] [background-image:radial-gradient(rgba(237,238,255,0.85)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(124,156,255,0.75)_1px,transparent_1px)] [background-size:62px_62px]" />

      {/* Soft vignette to keep attention centered */}
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_40%,transparent_0%,rgba(6,10,42,0.65)_70%,rgba(6,10,42,0.9)_100%)]" />

      {/* Floating letters */}
      <div className="absolute inset-0">
        {glyphs.map((g) => {
          const depth = g.layer === 1 ? 18 : g.layer === 2 ? 10 : 6
          const scrollDepth = g.layer === 1 ? 10 : g.layer === 2 ? 6 : 3

          return (
            <div
              key={g.id}
              className="absolute select-none font-jetbrains"
              style={{
                left: `${g.xPct}%`,
                top: `${g.yPct}%`,
                transform: `
                  translate(-50%, -50%)
                  translate(calc(var(--mx) * ${depth}px), calc(var(--my) * ${depth}px))
                  translate(0, calc(var(--sy) * ${scrollDepth * -1}px))
                  rotate(${g.rotateDeg}deg)
                `,
                filter: `blur(${g.blurPx}px)`,
                opacity: g.opacity,
                fontSize: `${g.sizePx}px`,
                letterSpacing: '-0.06em',
                color: 'rgba(237,238,255,0.95)',
                textShadow: '0 0 14px rgba(123,106,244,0.25)',
                animation: `floatDrift ${g.driftSec}s ease-in-out infinite alternate`,
                // @ts-expect-error custom property
                '--drift': `${g.driftPx}px`,
              }}
            >
              {g.ch}
            </div>
          )
        })}
      </div>

      {/* Extra subtle haze to glue layers */}
      <div className="absolute inset-0 opacity-[0.20] bg-[radial-gradient(700px_420px_at_50%_30%,rgba(124,156,255,0.08),transparent_70%)]" />

      <style jsx>{`
        @keyframes floatDrift {
          from {
            transform: translate(-50%, -50%)
              translate(calc(var(--mx) * 0px), calc(var(--my) * 0px))
              translate(0, calc(var(--sy) * 0px))
              rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%)
              translate(calc(var(--mx) * 0px), calc(var(--my) * 0px))
              translate(var(--drift), calc(var(--drift) * -0.35))
              rotate(2deg);
          }
        }
      `}</style>
    </div>
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

  const [refetchTimeout, setRefetchTimeout] = useState<NodeJS.Timeout | null>(null)

  // Debounced refetch - waits 3 seconds after transaction to give subgraph time to index
  const debouncedRefetch = useCallback(() => {
    if (refetchTimeout) clearTimeout(refetchTimeout)

    const timeout = setTimeout(() => {
      console.log('[Markees] Refetching after transaction success')
      refetch()
    }, 3000)

    setRefetchTimeout(timeout)
  }, [refetch, refetchTimeout])

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

  const handleReact = async (markee: Markee, emoji: string) => {
    if (!address) {
      console.error('Wallet not connected')
      return
    }

    try {
      await addReaction(markee.address, emoji, markee.chainId)
    } catch (err) {
      console.error('Failed to add reaction:', err)
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }

  const handleFixedMarkeeClick = (fixedMarkee: FixedMarkee) => {
    setSelectedFixedMarkee(fixedMarkee)
    setIsFixedModalOpen(true)
  }

  const handleFixedModalClose = () => {
    setIsFixedModalOpen(false)
    setSelectedFixedMarkee(null)
  }

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" />

      {/* Hero Section - Fixed Price Messages (Readerboard Style) */}
      {/* IMPORTANT: removed opaque bg so the cosmic background is actually visible */}
      <section className="relative overflow-hidden py-12 border-b border-[#8A8FBF]/20">
        <CosmicHeroBackground />

        {/* Content needs to be above the background */}
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

                  <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100">
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
          <p className="text-center text-[#8A8FBF] mb-12 text-lg">Markee is coming soon to a digital platform near you...</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            <PartnerCard logo="/partners/gardens.png" name="Gardens" description="Community Governance" />
            <PartnerCard logo="/partners/juicebox.png" name="Juicebox" description="Crowdfunding Protocol" />
            <PartnerCard logo="/partners/revnets.png" name="RevNets" description="Tokenized Revenues" />
            <PartnerCard logo="/partners/breadcoop.png" name="Bread Cooperative" description="Digital Co-op" />
          </div>

          <div className="text-center">
            <a
              href="/ecosystem"
              className="inline-block bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#7C9CFF] transition-colors"
            >
              Explore the Ecosystem
            </a>
          </div>
        </div>
      </section>

      {/* Leaderboard - TopDawg Strategy (from Base - canonical chain) */}
      <section className="bg-[#060A2A] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-[#EDEEFF] mb-6">Buy a Message. Own the Network.</h3>

            <p className="text-lg text-[#8A8FBF] mb-6">
              Our platform is community-owned. Buy a message or add funds to a message below to join Markee&apos;s digital cooperative.
            </p>

            <div className="flex gap-4 justify-center mb-8">
              <button
                onClick={handleCreateNew}
                className="bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#7C9CFF] transition-colors"
              >
                Buy a Message
              </button>
              <Link
                href="/how-it-works"
                className="bg-[#0A0F3D] text-[#F897FE] border-2 border-[#F897FE] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#F897FE]/10 transition-colors"
              >
                How it Works
              </Link>
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
        onSuccess={debouncedRefetch}
      />

      <FixedPriceModal
        isOpen={isFixedModalOpen}
        onClose={handleFixedModalClose}
        fixedMarkee={selectedFixedMarkee}
        onSuccess={debouncedRefetch}
      />
    </div>
  )
}
