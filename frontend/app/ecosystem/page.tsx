'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Globe2, Github, Zap, ExternalLink, Trophy, CheckCircle, Eye } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { CreateOpenInternetModal } from '@/components/modals/CreateOpenInternetModal'
import { ModerationProvider } from '@/components/moderation'

const INITIAL_SHOW = 9

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
  logoUrl?: string | null
  siteUrl?: string | null
  verifiedUrl?: string | null
  verifiedUrls?: string[]
  status?: 'pending' | 'verified'
  isLegacy?: boolean
  isCooperative?: boolean
  percentToBeneficiary?: number
  slug?: string
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

function hasRealPurchase(lb: EcosystemLeaderboard) {
  return BigInt(lb.topFundsAddedRaw ?? '0') > 0n
}

function platformIcon(platform: string, size = 14) {
  if (platform === 'github') return <Github size={size} className="text-[#8A8FBF]" />
  if (platform === 'superfluid') return <Zap size={size} className="text-[#1DB227]" />
  return <Globe2 size={size} className="text-[#F897FE]" />
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

const sessionTracked = new Set<string>()

function EcosystemCard({
  lb,
  onBuyLegacy,
  viewCount,
  onViewTracked,
}: {
  lb: EcosystemLeaderboard
  onBuyLegacy?: (lb: EcosystemLeaderboard) => void
  viewCount?: number
  onViewTracked?: (address: string, count: number) => void
}) {
  const router = useRouter()
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current || sessionTracked.has(lb.address.toLowerCase())) return
    tracked.current = true
    sessionTracked.add(lb.address.toLowerCase())
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: lb.address, message: lb.topMessage ?? '' }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.totalViews != null) onViewTracked?.(lb.address, data.totalViews) })
      .catch(() => {})
  }, [lb.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const logoSrc = lb.logoUrl ?? (lb.platform === 'github' ? lb.repoAvatarUrl : null)

  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const topFunds = BigInt(lb.topFundsAddedRaw ?? '0')
  const minPriceRaw = BigInt(lb.minimumPriceRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = (Number(buyPrice) / 1e18).toFixed(3)
  const messageCount = lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)

  const detailHref =
    lb.platform === 'superfluid' ? `/ecosystem/platforms/superfluid/${lb.address}` :
    lb.platform === 'github' ? `/ecosystem/platforms/github` :
    !lb.isLegacy ? `/ecosystem/website/${lb.address}` :
    null

  function handleCardClick() {
    if (detailHref) router.push(detailHref)
  }

  function handleBuyClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (lb.isLegacy && onBuyLegacy) onBuyLegacy(lb)
    else if (detailHref) router.push(detailHref)
  }

  const isClickable = !!detailHref

  return (
    <div
      onClick={isClickable ? handleCardClick : undefined}
      className={`bg-[#0A0F3D] p-6 rounded-lg border border-[#8A8FBF]/20 transition-colors
        ${isClickable ? 'cursor-pointer hover:border-[#F897FE]' : ''}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0 overflow-hidden">
          {logoSrc ? (
            <img src={logoSrc} alt={lb.name} className="w-9 h-9 object-contain" />
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
                className="text-[#1DB227] hover:text-[#1DB227]/80 transition-colors"
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

      <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 flex flex-col min-h-[100px]">
        <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2 flex-1">
          {lb.topMessage}
        </p>
        {lb.topMessageOwner && (
          <p className="text-[#8A8FBF] text-xs text-right mt-auto">
            {lb.topMessageOwner.startsWith('0x')
              ? `${lb.topMessageOwner.slice(0, 6)}…${lb.topMessageOwner.slice(-4)}`
              : lb.topMessageOwner}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs mb-4 text-[#8A8FBF]">
        <span className="text-[#7C9CFF] font-medium">{formatFunds(lb.totalFunds)}</span>
        <div className="flex items-center gap-3">
          {viewCount != null && (
            <span className="flex items-center gap-1">
              <Eye size={11} className="opacity-60" />
              {viewCount.toLocaleString()}
            </span>
          )}
          <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
        </div>
      </div>

      <button
        onClick={handleBuyClick}
        className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors"
      >
        {buyPriceFormatted} ETH to change
      </button>
    </div>
  )
}

// ─── Show-more section ────────────────────────────────────────────────────────

function LeaderboardSection({
  title,
  subtitle,
  badge,
  items,
  renderCard,
  withUrlBar,
}: {
  title: string
  subtitle?: React.ReactNode
  badge: React.ReactNode
  items: EcosystemLeaderboard[]
  renderCard: (lb: EcosystemLeaderboard) => React.ReactNode
  withUrlBar?: (lb: EcosystemLeaderboard) => string | null
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, INITIAL_SHOW)
  const hasMore = items.length > INITIAL_SHOW

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-2">
        {badge}
        <h2 className="text-2xl font-bold text-[#EDEEFF]">{title}</h2>
        <span className="text-[#8A8FBF] text-sm">{items.length}</span>
      </div>
      {subtitle}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${subtitle ? '' : 'mt-4'}`}>
        {visible.map(lb => {
          const url = withUrlBar?.(lb)
          if (url) {
            return (
              <div key={lb.address} className="relative">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 hover:bg-[#F897FE]/5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-medium px-4 py-2 rounded-t-lg transition-all"
                >
                  <ExternalLink size={12} />
                  {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
                <div className="rounded-t-none rounded-b-lg overflow-hidden border border-t-0 border-[#F897FE]/20">
                  {renderCard(lb)}
                </div>
              </div>
            )
          }
          return <div key={lb.address}>{renderCard(lb)}</div>
        })}
      </div>
      {hasMore && !showAll && (
        <div className="text-center mt-6">
          <button
            onClick={() => setShowAll(true)}
            className="text-[#8A8FBF] hover:text-[#EDEEFF] text-sm font-medium border border-[#8A8FBF]/30 hover:border-[#8A8FBF]/60 px-6 py-2 rounded-lg transition-colors"
          >
            Show all {items.length} Markees
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EcosystemPage() {
  const [leaderboards, setLeaderboards] = useState<EcosystemLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoading, setIsLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [topDawgModalData, setTopDawgModalData] = useState<EcosystemLeaderboard | null>(null)
  const [viewCounts, setViewCounts] = useState<Map<string, number>>(new Map())

  const fetchLeaderboards = async (bust = false) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ t: Date.now().toString() })
      if (bust) params.set('bust', '1')
      const res = await fetch(`/api/ecosystem/leaderboards?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const lbs: EcosystemLeaderboard[] = data.leaderboards ?? []
        setLeaderboards(lbs)
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')

        // Fetch view counts for all active leaderboard addresses
        const active = lbs.filter(l => BigInt(l.topFundsAddedRaw ?? '0') > 0n)
        if (active.length > 0) {
          const addrs = active.map(l => l.address.toLowerCase()).join(',')
          fetch(`/api/views?addresses=${addrs}`)
            .then(r => r.ok ? r.json() : {})
            .then((data: Record<string, { totalViews: number }>) => {
              setViewCounts(new Map(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v.totalViews])))
            })
            .catch(() => {})
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function handleViewTracked(address: string, count: number) {
    setViewCounts(prev => new Map(prev).set(address.toLowerCase(), count))
  }

  useEffect(() => { fetchLeaderboards() }, [])

  // Only show boards where a real purchase has been made
  const active = leaderboards.filter(hasRealPurchase)
  const verified = active.filter(l => l.platform === 'website' && l.status === 'verified')
  const unverified = active.filter(l => !(l.platform === 'website' && l.status === 'verified'))

  // Hero stats
  const totalMessages = active.reduce((sum, lb) => {
    return sum + (lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1))
  }, 0)

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

          {/* Stats */}
          {!isLoading && active.length > 0 && (
            <div className="flex items-center justify-center gap-8 mt-10 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{active.length}</span>
                <span className="text-[#8A8FBF]">active Markees</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#EDEEFF] font-semibold">{totalMessages.toLocaleString()}</span>
                <span className="text-[#8A8FBF]">messages bought</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                <span className="text-[#7C9CFF] font-semibold">{formatFunds(totalPlatformFunds)}</span>
                <span className="text-[#8A8FBF]">total raised</span>
              </div>
            </div>
          )}
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
                    <Globe2 size={26} className="text-[#F897FE]" />
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
                  Create a Markee for your Website
                </button>
              </div>

              {/* GitHub */}
              <div className="flex flex-col gap-4 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                    <Github size={26} className="text-[#EDEEFF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm">GitHub Repo</h3>
                    <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                      Add a Markee to your README, SKILL file, or any markdown in your project.
                    </p>
                  </div>
                </div>
                <Link
                  href="/ecosystem/platforms/github"
                  className="w-full flex items-center justify-center bg-[#0A0F3D] text-[#F897FE] border border-[#F897FE]/40 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#F897FE]/10 transition-colors"
                >
                  See Github Markees and Create
                </Link>
              </div>

              {/* Superfluid */}
              <div className="flex flex-col gap-4 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20 overflow-hidden">
                    <Image src="/partners/superfluid.png" alt="Superfluid" width={36} height={36} className="object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm">Superfluid Project</h3>
                    <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                      Builders in the Superfluid ecosystem can create a Markee and earn SUP rewards.
                    </p>
                  </div>
                </div>
                <Link
                  href="/ecosystem/platforms/superfluid"
                  className="w-full flex items-center justify-center bg-[#0A0F3D] text-[#F897FE] border border-[#F897FE]/40 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#F897FE]/10 transition-colors"
                >
                  See Superfluid Markees and Create
                </Link>
              </div>

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
                {verified.length > 0 && (
                  <LeaderboardSection
                    title="Top Verified Markees"
                    badge={
                      <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-3 py-1 rounded-full">
                        <CheckCircle size={11} />
                        Verified
                      </span>
                    }
                    items={verified}
                    withUrlBar={lb => lb.verifiedUrls?.[0] ?? lb.verifiedUrl ?? null}
                    renderCard={lb => (
                      <EcosystemCard
                        lb={lb}
                        onBuyLegacy={l => setTopDawgModalData(l)}
                        viewCount={viewCounts.get(lb.address.toLowerCase())}
                        onViewTracked={handleViewTracked}
                      />
                    )}
                  />
                )}

                {unverified.length > 0 && (
                  <LeaderboardSection
                    title="Unverified Markees"
                    subtitle={
                      <p className="text-[#8A8FBF] text-sm mb-6 ml-1">
                        These messages haven&apos;t been linked to a website yet.{' '}
                        <Link href="/account" className="text-[#F897FE] hover:underline">
                          Go to Your Account
                        </Link>{' '}
                        to verify your Markees.
                      </p>
                    }
                    badge={
                      <Trophy size={20} className="text-[#F897FE]" />
                    }
                    items={unverified}
                    renderCard={lb => (
                      <EcosystemCard
                        lb={lb}
                        onBuyLegacy={l => setTopDawgModalData(l)}
                        viewCount={viewCounts.get(lb.address.toLowerCase())}
                        onViewTracked={handleViewTracked}
                      />
                    )}
                  />
                )}
              </>
            )}
          </ModerationProvider>
        </div>
      </section>

      <Footer />

      <CreateOpenInternetModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => { setCreateModalOpen(false); fetchLeaderboards(true) }}
      />

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
