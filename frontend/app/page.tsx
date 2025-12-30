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

/**
 * CosmicHeroBackground
 * - Canvas stars + subtle “floating letters” in multiple layers
 * - Mouse/scroll parallax (very gentle)
 * - Dim / non-distracting by design
 *
 * This component is intended to sit as an absolutely-positioned background *inside* the hero section.
 */
function CosmicHeroBackground({
  density = 1,
}: {
  density?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const pointerRef = useRef({ x: 0, y: 0 }) // [-0.5..0.5] normalized
  const scrollRef = useRef(0) // 0..1 of viewport scroll
  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  }, [])

  const letters = useMemo(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), [])

  // Pre-generate “particles” once (stable) — kept in a ref so we don’t reinit on rerenders.
  const starsRef = useRef<
    Array<{ x: number; y: number; r: number; a: number; layer: 0 | 1 | 2; tw: number }>
  >([])
  const glyphsRef = useRef<
    Array<{
      x: number
      y: number
      s: number
      a: number
      ch: string
      layer: 0 | 1 | 2
      drift: number
      rot: number
      rotV: number
    }>
  >([])

  const initScene = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Size canvas to device pixels
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const parent = canvas.parentElement
    const w = parent?.clientWidth ?? window.innerWidth
    const h = parent?.clientHeight ?? 520

    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Build particles relative to size
    const starCount = Math.floor((w * h * 0.00012) * density) // tuned: subtle
    const glyphCount = Math.floor((w * h * 0.00003) * density) // fewer letters than stars

    starsRef.current = Array.from({ length: starCount }).map(() => {
      const layer = (Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2) as 0 | 1 | 2
      const rBase = layer === 0 ? 0.8 : layer === 1 ? 1.2 : 1.7
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: rBase + Math.random() * 0.9,
        a: 0.06 + Math.random() * 0.12, // dim
        layer,
        tw: Math.random() * 0.8 + 0.2, // twinkle factor
      }
    })

    glyphsRef.current = Array.from({ length: glyphCount }).map(() => {
      const layer = (Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2) as 0 | 1 | 2
      const size = (layer === 0 ? 10 : layer === 1 ? 14 : 18) + Math.random() * 8
      const alpha = (layer === 0 ? 0.04 : layer === 1 ? 0.06 : 0.08) + Math.random() * 0.03 // very dim
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        s: size,
        a: alpha,
        ch: letters[Math.floor(Math.random() * letters.length)]!,
        layer,
        drift: (Math.random() - 0.5) * 0.18, // slow vertical drift
        rot: (Math.random() - 0.5) * 0.25,
        rotV: (Math.random() - 0.5) * 0.003,
      }
    })
  }, [density, letters])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onResize = () => initScene()
    window.addEventListener('resize', onResize)

    const onMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      pointerRef.current.x = e.clientX / w - 0.5
      pointerRef.current.y = e.clientY / h - 0.5
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const onScroll = () => {
      const y = window.scrollY || 0
      const vh = window.innerHeight || 1
      scrollRef.current = Math.max(0, Math.min(1, y / vh))
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    initScene()
    onScroll()

    const tick = (t: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d', { alpha: true })
      if (!ctx) return

      const parent = canvas.parentElement
      const w = parent?.clientWidth ?? window.innerWidth
      const h = parent?.clientHeight ?? 520

      ctx.clearRect(0, 0, w, h)

      // Background wash (keep it subtle; use your palette)
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, 'rgba(10, 15, 61, 0.92)') // deep-space
      g.addColorStop(0.55, 'rgba(23, 32, 144, 0.55)') // electric-blue (dimmed)
      g.addColorStop(1, 'rgba(6, 10, 42, 0.95)') // midnight-navy
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // Parallax offsets (very gentle)
      const px = pointerRef.current.x
      const py = pointerRef.current.y
      const sp = scrollRef.current

      const layerOffset = (layer: 0 | 1 | 2) => {
        const strength = layer === 0 ? 6 : layer === 1 ? 10 : 16
        const scrollStrength = layer === 0 ? 8 : layer === 1 ? 14 : 22
        return {
          ox: px * strength,
          oy: py * strength + sp * scrollStrength,
        }
      }

      // Stars
      for (const s of starsRef.current) {
        const { ox, oy } = layerOffset(s.layer)
        const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.tw + s.x * 0.02)
        ctx.globalAlpha = s.a * tw
        ctx.beginPath()
        ctx.arc(s.x + ox, s.y + oy, s.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(237, 238, 255, 1)' // soft-white
        ctx.fill()
      }

      // Letters (dim; mild drift)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const gl of glyphsRef.current) {
        const { ox, oy } = layerOffset(gl.layer)

        if (!reduceMotion) {
          gl.y += gl.drift
          gl.rot += gl.rotV
          if (gl.y < -40) gl.y = h + 40
          if (gl.y > h + 40) gl.y = -40
        }

        ctx.save()
        ctx.translate(gl.x + ox, gl.y + oy)
        ctx.rotate(gl.rot)
        ctx.globalAlpha = gl.a

        // Use a slightly tinted “ink” so it matches the site
        ctx.fillStyle = 'rgba(184, 182, 217, 1)' // lavender-gray
        ctx.font = `${gl.s}px var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
        ctx.fillText(gl.ch, 0, 0)
        ctx.restore()
      }

      // Vignette / dim overlay (keeps content readable)
      const v = ctx.createRadialGradient(w * 0.5, h * 0.35, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.75)
      v.addColorStop(0, 'rgba(6, 10, 42, 0)')
      v.addColorStop(1, 'rgba(6, 10, 42, 0.55)')
      ctx.globalAlpha = 1
      ctx.fillStyle = v
      ctx.fillRect(0, 0, w, h)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [initScene, reduceMotion])

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden rounded-none">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-hidden="true"
      />
      {/* Extra dimmer layer so it never competes with the UI */}
      <div className="pointer-events-none absolute inset-0 bg-[#060A2A]/30" />
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
    // Clear any pending refetch
    if (refetchTimeout) {
      clearTimeout(refetchTimeout)
    }

    // Schedule new refetch after 3 seconds
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
      // Error is already handled in the hook
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
      <section className="relative bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20 overflow-hidden">
        {/* Cosmic background (hero-only) */}
        <CosmicHeroBackground />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {isLoadingFixed ? (
              // Loading state
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
              // Real data - Readerboard styled (all from Base - canonical chain)
              fixedMarkees.map((fixedMarkee, index) => (
                <button
                  key={index}
                  onClick={() => handleFixedMarkeeClick(fixedMarkee)}
                  className="group readerboard-card cursor-pointer transition-all hover:shadow-2xl hover:shadow-[#7B6AF4]/20 hover:-translate-y-1"
                >
                  {/* Readerboard inner area with grooves */}
                  <div className="readerboard-inner">
                    {/* Message text */}
                    <div className="readerboard-text">{fixedMarkee.message || fixedMarkee.name}</div>
                  </div>

                  {/* Hover price indicator */}
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
          background: repeating-linear-gradient(
            0deg,
            #0a0f3d 0px,
            #0a0f3d 28px,
            #060a2a 28px,
            #060a2a 30px
          );
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
              Our platform is community-owned. Buy a message or add funds to a message below to join Markee&apos;s digital
              cooperative.
            </p>

            {/* CTA Buttons */}
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
            {/* Status indicator */}
            <div className="flex items-center gap-3 ml-auto">
              {(isFetchingFresh || reactionsLoading) && (
                <div className="flex items-center gap-2 text-sm text-[#8A8FBF]">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#F897FE]"></div>
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

          {/* Error display for reactions */}
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
              {/* #1 Spot - Full Width */}
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
                      onReact={handleReact}
                      reactions={reactions.get(markee.address.toLowerCase())}
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

      {/* Top Dawg Modal */}
      <TopDawgModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={debouncedRefetch}
      />

      {/* Fixed Price Modal */}
      <FixedPriceModal
        isOpen={isFixedModalOpen}
        onClose={handleFixedModalClose}
        fixedMarkee={selectedFixedMarkee}
        onSuccess={debouncedRefetch}
      />
    </div>
  )
}
