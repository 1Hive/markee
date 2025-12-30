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
 * Cosmic hero background (canvas) with floating capital letters.
 * - Dim opacity so it’s not distracting.
 * - Slight parallax based on mouse + scroll.
 * - If canvas fails, fallback to an opaque gradient background.
 */
function CosmicHeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const [canvasFailed, setCanvasFailed] = useState(false)

  // Parallax state (kept in refs to avoid rerenders)
  const parallaxRef = useRef({ mx: 0, my: 0, sy: 0 })

  const letters = useMemo(() => {
    // Mostly capital letters + a few symbols that look nice in mono
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const extras = '△◻︎◆◇✶✷✸'
    return (pool + pool + pool + extras).split('')
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setCanvasFailed(true)
      return
    }

    // Device pixel ratio scaling
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return

      const { width, height } = parent.getBoundingClientRect()

      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    const onMouseMove = (e: MouseEvent) => {
      const parent = canvas.parentElement
      if (!parent) return
      const r = parent.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1
      const ny = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1
      parallaxRef.current.mx = nx
      parallaxRef.current.my = ny
    }

    const onScroll = () => {
      // small normalized scroll effect
      const y = window.scrollY || 0
      parallaxRef.current.sy = Math.max(-1, Math.min(1, y / 900))
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })

    // Particles
    const parent = canvas.parentElement
    const bounds = parent?.getBoundingClientRect()
    const baseW = bounds?.width ?? 1200
    const baseH = bounds?.height ?? 360

    const starCount = Math.round((baseW * baseH) / 22000) + 40
    const letterCount = Math.round((baseW * baseH) / 30000) + 18

    const rand = (min: number, max: number) => min + Math.random() * (max - min)

    type Star = { x: number; y: number; r: number; a: number; tw: number }
    type Glyph = { x: number; y: number; s: number; vy: number; vx: number; ch: string; rot: number; vr: number; a: number }

    const stars: Star[] = Array.from({ length: starCount }).map(() => ({
      x: rand(0, baseW),
      y: rand(0, baseH),
      r: rand(0.6, 1.7),
      a: rand(0.08, 0.22), // dim
      tw: rand(0.002, 0.01),
    }))

    const glyphs: Glyph[] = Array.from({ length: letterCount }).map(() => ({
      x: rand(0, baseW),
      y: rand(0, baseH),
      s: rand(10, 18),
      vy: rand(0.04, 0.12),
      vx: rand(-0.03, 0.03),
      ch: letters[Math.floor(Math.random() * letters.length)],
      rot: rand(-0.4, 0.4),
      vr: rand(-0.002, 0.002),
      a: rand(0.05, 0.12), // very dim
    }))

    let t = 0

    const draw = () => {
      const parentNow = canvas.parentElement
      if (!parentNow) return

      const { width, height } = parentNow.getBoundingClientRect()
      if (width <= 0 || height <= 0) return

      // Clear
      ctx.clearRect(0, 0, width, height)

      // Base background: a couple soft nebula blobs (very subtle)
      const g1 = ctx.createRadialGradient(width * 0.25, height * 0.3, 20, width * 0.25, height * 0.3, Math.max(width, height) * 0.7)
      g1.addColorStop(0, 'rgba(75, 58, 204, 0.10)') // nebula-violet
      g1.addColorStop(1, 'rgba(6, 10, 42, 0.00)') // midnight-navy
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, width, height)

      const g2 = ctx.createRadialGradient(width * 0.75, height * 0.55, 20, width * 0.75, height * 0.55, Math.max(width, height) * 0.8)
      g2.addColorStop(0, 'rgba(248, 151, 254, 0.06)') // soft-pink
      g2.addColorStop(1, 'rgba(10, 15, 61, 0.00)') // deep-space
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, width, height)

      // Parallax offsets
      const { mx, my, sy } = parallaxRef.current
      const pxStars = mx * 10
      const pyStars = my * 8 + sy * 10
      const pxGlyphs = mx * 18
      const pyGlyphs = my * 14 + sy * 18

      // Stars (twinkle)
      t += 1
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.tw)
        ctx.globalAlpha = s.a * (0.7 + 0.6 * tw)
        ctx.beginPath()
        ctx.arc(s.x + pxStars, s.y + pyStars, s.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(237, 238, 255, 1)' // soft-white
        ctx.fill()
      }

      // Glyphs
      ctx.font = `600 14px var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (const g of glyphs) {
        // drift upward and wrap
        g.y -= g.vy
        g.x += g.vx
        g.rot += g.vr

        if (g.y < -40) g.y = height + 40
        if (g.x < -40) g.x = width + 40
        if (g.x > width + 40) g.x = -40

        const x = g.x + pxGlyphs
        const y = g.y + pyGlyphs

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(g.rot)

        ctx.globalAlpha = g.a

        // Slight glow-like effect: draw twice
        ctx.fillStyle = 'rgba(124, 156, 255, 1)' // cool-sky-blue
        ctx.fillText(g.ch, 0, 0)

        ctx.globalAlpha = g.a * 0.6
        ctx.fillStyle = 'rgba(147, 90, 240, 1)' // lavender-accent
        ctx.fillText(g.ch, 1, 1)

        ctx.restore()
      }

      // reset alpha
      ctx.globalAlpha = 1

      rafRef.current = requestAnimationFrame(draw)
    }

    try {
      rafRef.current = requestAnimationFrame(draw)
    } catch {
      setCanvasFailed(true)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [letters])

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Fallback background if canvas fails */}
      <div
        className={[
          'absolute inset-0',
          'bg-[#0A0F3D]',
          // subtle depth even without canvas
          '[background-image:radial-gradient(900px_500px_at_20%_25%,rgba(75,58,204,0.22),transparent_55%),radial-gradient(900px_600px_at_80%_55%,rgba(248,151,254,0.12),transparent_60%),linear-gradient(180deg,#060A2A_0%,#0A0F3D_70%,#060A2A_100%)]',
        ].join(' ')}
        style={{ opacity: canvasFailed ? 1 : 0 }}
      />

      {/* Canvas layer */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{
          opacity: canvasFailed ? 0 : 0.55, // dim overall
        }}
      />

      {/* Scrim to keep hero content readable regardless */}
      <div className="absolute inset-0 bg-[#0A0F3D]/55" />
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
      <section className="relative overflow-hidden py-12 border-b border-[#8A8FBF]/20">
        {/* Cosmic background ONLY for hero */}
        <CosmicHeroBackground />

        {/* Content above background */}
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
          background: #EDEEFF;
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
            #0A0F3D 0px,
            #0A0F3D 28px,
            #060A2A 28px,
            #060A2A 30px
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
          color: #EDEEFF;
          text-align: center;
          word-wrap: break-word;
          max-width: 100%;
          transition: all 0.2s ease;
        }

        .group:hover .readerboard-text {
          color: #7B6AF4;
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
