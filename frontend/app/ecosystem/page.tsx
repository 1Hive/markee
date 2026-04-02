'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Globe, Github, Zap, ChevronRight, ExternalLink, Trophy, CheckCircle } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { CreateOpenInternetModal } from '@/components/modals/CreateOpenInternetModal'
import { ModerationProvider } from '@/components/moderation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EcosystemLeaderboard {
  address: string
  name: string
  platform: 'website' | 'github' | 'superfluid'
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  topMessage: string | null
  topMessageOwner: string | null
  creator: string | null
  admin: string | null
  minimumPrice: string
  minimumPriceRaw: string
  topFundsAddedRaw: string
  // website-specific
  logoUrl?: string | null
  siteUrl?: string | null
  verifiedUrl?: string | null
  status?: 'pending' | 'verified'
  isLegacy?: boolean
  isCooperative?: boolean
  percentToBeneficiary?: number
  slug?: string
  // github-specific
  repoAvatarUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFunds(eth: string) {
  const n = parseFloat(eth)
  if (n === 0) return '0 ETH'
  if (n < 0.001) return '< 0.001 ETH'
  return `${n.toFixed(3)} ETH`
}

function platformIcon(platform: string, size = 14) {
  if (platform === 'github') return <Github size={size} className="text-[#8A8FBF]" />
  if (platform === 'superfluid') return <Zap size={size} className="text-[#1DB227]" />
  return <Globe size={size} className="text-[#F897FE]" />
}

function platformLabel(platform: string) {
  if (platform === 'github') return 'GitHub'
  if (platform === 'superfluid') return 'Superfluid'
  return 'Website'
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-[#0A0F3D] rounded-lg p-6 border border-[#8A8FBF]/20 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-[#1A1F4D] flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#1A1F4D] rounded w-3/4" />
          <div className="h-3 bg-[#1A1F4D] rounded w-1/2" />
        </div>
      </div>
      <div className="h-24 bg-[#060A2A] rounded-lg mb-4" />
      <div className="h-8 bg-[#1A1F4D] rounded-lg" />
    </div>
  )
}

// ─── Ecosystem Card ───────────────────────────────────────────────────────────

function EcosystemCard({
  lb,
  onBuyLegacy,
}: {
  lb: EcosystemLeaderboard
  onBuyLegacy?: (lb: EcosystemLeaderboard) => void
}) {
  const router = useRouter()

  const logoSrc = lb.logoUrl ?? (lb.platform === 'github' ? lb.repoAvatarUrl : null)
  const hasLogo = !!logoSrc

  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const topFunds = BigInt(lb.topFundsAddedRaw ?? '0')
  const minPriceRaw = BigInt(lb.minimumPriceRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = (Number(buyPrice) / 1e18).toFixed(3)

  function handleCardClick() {
    if (lb.platform === 'superfluid') {
      router.push(`/ecosystem/platforms/superfluid/${lb.address}`)
    } else if (lb.platform === 'github') {
      router.push(`/ecosystem/platforms/github`)
    }
    // website cards aren't clickable by default
  }

  function handleBuyClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (lb.isLegacy && onBuyLegacy) {
      onBuyLegacy(lb)
    } else if (lb.platform === 'superfluid') {
      router.push(`/ecosystem/platforms/superfluid/${lb.address}`)
    } else if (lb.platform === 'github') {
      router.push(`/ecosystem/platforms/github`)
    }
  }

  const isClickable = lb.platform === 'superfluid' || lb.platform === 'github'

  return (
    <div
      onClick={isClickable ? handleCardClick : undefined}
      className={`bg-[#0A0F3D] p-6 rounded-lg border border-[#8A8FBF]/20 transition-colors
        ${isClickable ? 'cursor-pointer hover:border-[#F897FE]' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0 overflow-hidden">
          {hasLogo ? (
            <img src={logoSrc!} alt={lb.name} className="w-9 h-9 object-contain" />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              {platformIcon(lb.platform, 22)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-[#EDEEFF] text-lg truncate">{lb.name}</h3>
            {lb.status === 'verified' && lb.verifiedUrl && (
              <a
                href={lb.verifiedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-[#1DB227] text-xs hover:text-[#1DB227]/80 transition-colors"
                title="Verified website"
              >
                <CheckCircle size={12} />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#8A8FBF] mt-0.5">
            {platformIcon(lb.platform, 11)}
            <span>{platformLabel(lb.platform)}</span>
          </div>
        </div>
      </div>

      {/* Message box */}
      {lb.topMessage ? (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 flex flex-col min-h-[100px]">
          <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2 flex-1">
            {lb.topMessage}
          </p>
          {lb.topMessageOwner && (
            <p className="text-[#8A8FBF] text-xs text-right mt-auto">
              — {lb.topMessageOwner.startsWith('0x')
                ? `${lb.topMessageOwner.slice(0, 6)}…${lb.topMessageOwner.slice(-4)}`
                : lb.topMessageOwner}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center min-h-[100px] flex flex-col items-center justify-center">
          <div className="text-4xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">No messages yet</p>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs mb-4 text-[#8A8FBF]">
        <span className="text-[#7C9CFF] font-medium">{formatFunds(lb.totalFunds)}</span>
        <span>{Math.max(0, lb.markeeCount - 1)} {lb.markeeCount - 1 === 1 ? 'message' : 'messages'}</span>
      </div>

      {/* Buy button — only for active boards */}
      {lb.markeeCount > 0 && (
        <button
          onClick={handleBuyClick}
          className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors"
        >
          {buyPriceFormatted} ETH to change
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EcosystemPage() {
  const [leaderboards, setLeaderboards] = useState<EcosystemLeaderboard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [topDawgModalData, setTopDawgModalData] = useState<EcosystemLeaderboard | null>(null)

  const fetchLeaderboards = async (bust = false) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ t: Date.now().toString() })
      if (bust) params.set('bust', '1')
      const res = await fetch(`/api/ecosystem/leaderboards?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setLeaderboards(data.leaderboards ?? [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchLeaderboards() }, [])

  // Categorize by status
  const verified = leaderboards.filter(l =>
    l.markeeCount > 0 && l.platform === 'website' && l.status === 'verified'
  )
  const unverified = leaderboards.filter(l =>
    l.markeeCount > 0 && !(l.platform === 'website' && l.status === 'verified')
  )
  const awaiting = leaderboards.filter(l => l.markeeCount === 0)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-6">Raise funds with Markee</h1>
          <p className="text-xl md:text-2xl text-[#8A8FBF] mb-8 max-w-3xl mx-auto">
            Explore the Universe of Markee messages growing across the internet ✨
          </p>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-8 py-4 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
          >
            Create a Markee
          </button>
        </div>
      </section>

      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Platform cards */}
          <div className="mb-16">
            <h2 className="text-lg font-semibold text-[#8A8FBF] mb-5">Raise Funding for Your:</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Website */}
              <div className="flex flex-col gap-4 bg-[#0A0F3D] rounded-lg border border-[#F897FE]/30 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                    <Globe size={26} className="text-[#F897FE]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm">Website</h3>
                    <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                      Add a Markee message to any website you own, we'll help with the integration.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors"
                >
                  Create a Markee
                </button>
              </div>

              {/* GitHub */}
              <Link
                href="/ecosystem/platforms/github"
                className="group flex items-center gap-5 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/50 transition-all p-5"
              >
                <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                  <Github size={26} className="text-[#EDEEFF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[#EDEEFF] font-semibold text-sm group-hover:text-[#F897FE] transition-colors">
                    GitHub Repo
                  </h3>
                  <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                    Add a Markee to your README, SKILL file, or any markdown in your project.
                  </p>
                  <div className="flex items-center gap-1 text-[#7C9CFF] text-xs group-hover:text-[#F897FE] transition-colors mt-2">
                    See GitHub Markees <ChevronRight size={13} />
                  </div>
                </div>
              </Link>

              {/* Superfluid */}
              <Link
                href="/ecosystem/platforms/superfluid"
                className="group flex items-center gap-5 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/50 transition-all p-5"
              >
                <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20 overflow-hidden">
                  <Image src="/partners/superfluid.png" alt="Superfluid" width={36} height={36} className="object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[#EDEEFF] font-semibold text-sm group-hover:text-[#F897FE] transition-colors">
                    Superfluid Project
                  </h3>
                  <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                    Builders in the Superfluid ecosystem can create a Markee and earn SUP rewards.
                  </p>
                  <div className="flex items-center gap-1 text-[#7C9CFF] text-xs group-hover:text-[#F897FE] transition-colors mt-2">
                    Superfluid platform <ChevronRight size={13} />
                  </div>
                </div>
              </Link>

            </div>
          </div>

          {/* Leaderboard sections */}
          <ModerationProvider>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <>
                {/* Top Verified Markees */}
                {verified.length > 0 && (
                  <div className="mb-16">
                    <div className="flex items-center gap-3 mb-6">
                      <Trophy size={20} className="text-[#F897FE]" />
                      <h2 className="text-2xl font-bold text-[#EDEEFF]">Top Verified Markees</h2>
                      <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-3 py-1 rounded-full">
                        <CheckCircle size={11} />
                        Verified
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {verified.map(lb => (
                        <div key={lb.address} className="relative">
                          {lb.verifiedUrl && (
                            <a
                              href={lb.verifiedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 hover:bg-[#F897FE]/5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-medium px-4 py-2 rounded-t-lg transition-all"
                            >
                              <ExternalLink size={12} />
                              {lb.verifiedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </a>
                          )}
                          <div className={`${lb.verifiedUrl ? 'rounded-t-none rounded-b-lg overflow-hidden border border-t-0 border-[#F897FE]/20' : ''}`}>
                            <EcosystemCard lb={lb} onBuyLegacy={l => setTopDawgModalData(l)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unverified Markees */}
                {unverified.length > 0 && (
                  <div className="mb-16">
                    <div className="flex items-center gap-3 mb-6">
                      <h2 className="text-2xl font-bold text-[#EDEEFF]">Unverified Markees</h2>
                      <span className="bg-[#8A8FBF]/15 border border-[#8A8FBF]/30 text-[#8A8FBF] text-xs font-semibold px-3 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {unverified.map(lb => (
                        <EcosystemCard key={lb.address} lb={lb} onBuyLegacy={l => setTopDawgModalData(l)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Awaiting Activation */}
                {awaiting.length > 0 && (
                  <div className="mb-16">
                    <div className="flex items-center gap-3 mb-6">
                      <h2 className="text-2xl font-bold text-[#EDEEFF]">Awaiting Activation</h2>
                      <span className="flex items-center gap-1.5 bg-[#7C9CFF]/15 border border-[#7C9CFF]/30 text-[#7C9CFF] text-xs font-semibold px-3 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7C9CFF] animate-pulse" />
                        Pending
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-75">
                      {awaiting.map(lb => (
                        <EcosystemCard key={lb.address} lb={lb} onBuyLegacy={l => setTopDawgModalData(l)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </ModerationProvider>
        </div>
      </section>

      <Footer />

      {/* Create Website Markee modal */}
      <CreateOpenInternetModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => { setCreateModalOpen(false); fetchLeaderboards(true) }}
      />

      {/* Legacy TopDawg buy modal */}
      {topDawgModalData && (
        <TopDawgModal
          isOpen={!!topDawgModalData}
          onClose={() => setTopDawgModalData(null)}
          onSuccess={() => { setTopDawgModalData(null); fetchLeaderboards(true) }}
          strategyAddress={topDawgModalData.address as `0x${string}`}
          partnerName={topDawgModalData.isCooperative ? undefined : topDawgModalData.name}
          partnerSplitPercentage={
            topDawgModalData.isCooperative ? undefined :
            (topDawgModalData.percentToBeneficiary ?? 6200) / 100
          }
          topFundsAdded={
            topDawgModalData.topFundsAddedRaw
              ? BigInt(topDawgModalData.topFundsAddedRaw)
              : undefined
          }
        />
      )}
    </div>
  )
}
