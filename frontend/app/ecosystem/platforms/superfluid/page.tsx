'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Zap, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Star, ExternalLink, Eye, User,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import Image from 'next/image'
import { RewardsModal } from '@/components/modals/RewardsModal'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { useViews } from '@/hooks/useViews'
import type { Markee } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPERFLUID_FACTORY_ADDRESS = '0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d' as const
const LEGACY_TOPDAWG_ADDRESS = '0x7a6ce4d457ac1a31513bdeff924ff942150d293e'

const FACTORY_ABI = [
  {
    inputs: [
      { name: '_beneficiaryAddress', type: 'address' },
      { name: '_leaderboardName', type: 'string' },
    ],
    name: 'createLeaderboard',
    outputs: [
      { name: 'leaderboardAddress', type: 'address' },
      { name: 'seedMarkeeAddress', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuperfluidLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  minimumPrice: string
  minimumPriceRaw: string
  topFundsAddedRaw: string
  topMessage: string | null
  topMessageOwner: string | null
}

interface FeaturedMessage {
  message: string
  owner: string
  totalFundsAdded: string
  totalFunds: string
  markeeCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMarkeeShape(lb: SuperfluidLeaderboard): Markee {
  return {
    address: lb.address,
    message: lb.topMessage ?? '',
    owner: lb.admin,
    totalFundsAdded: BigInt(lb.totalFundsRaw ?? '0'),
    chainId: 8453,
    pricingStrategy: '',
  }
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`bg-[#1A1F4D] rounded animate-pulse ${className}`} />
}

function HeroStatsSkeleton() {
  return (
    <div className="flex items-center gap-6 mt-10 flex-wrap">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-2">
          <SkeletonBar className="w-3 h-3 rounded-full" />
          <SkeletonBar className="w-10 h-3.5" />
          <SkeletonBar className="w-20 h-3.5" />
        </div>
      ))}
    </div>
  )
}

function LeaderboardCardSkeleton() {
  return (
    <div className="bg-[#0A0F3D] p-6 rounded-lg border border-[#8A8FBF]/20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <SkeletonBar className="w-12 h-12 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="w-3/4 h-5" />
          <SkeletonBar className="w-1/2 h-3" />
        </div>
      </div>

      {/* Message box */}
      <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 min-h-[120px] space-y-2.5 flex flex-col justify-center">
        <SkeletonBar className="w-full h-3.5" />
        <SkeletonBar className="w-4/5 h-3.5" />
        <SkeletonBar className="w-1/3 h-3 ml-auto mt-auto" />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between mb-4">
        <SkeletonBar className="w-28 h-3" />
        <SkeletonBar className="w-16 h-3" />
      </div>

      {/* Button */}
      <SkeletonBar className="w-full h-9 rounded-lg" />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuperfluidPlatformPage() {
  const { address: walletAddress } = useAccount()
  const [leaderboards, setLeaderboards] = useState<SuperfluidLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [rewardsModalOpen, setRewardsModalOpen] = useState(false)
  const [featuredMessage, setFeaturedMessage] = useState<FeaturedMessage | null>(null)
  const [featuredModalOpen, setFeaturedModalOpen] = useState(false)

  const fetchLeaderboards = useCallback(async (silent = false, bust = false) => {
    try {
      if (!silent) setIsLoadingLeaderboards(true)
      else setIsRefreshing(true)

      const params = new URLSearchParams({ t: Date.now().toString() })
      if (bust) params.set('bust', '1')
      const res = await fetch(`/api/superfluid/leaderboards?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setLeaderboards(data.leaderboards ?? [])
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')
        if (data.featuredMessage) setFeaturedMessage(data.featuredMessage)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingLeaderboards(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchLeaderboards()
  }, [fetchLeaderboards])

  // ── Views ──────────────────────────────────────────────────────────────────
  const viewableMarkees = useMemo(() => leaderboards.map(toMarkeeShape), [leaderboards])
  const { views, trackView } = useViews(viewableMarkees)

  const formatFunds = (eth: string) => {
    const n = parseFloat(eth)
    if (n === 0) return '0 ETH'
    if (n < 0.001) return '< 0.001 ETH'
    return `${n.toFixed(4)} ETH`
  }

  const myLeaderboards = walletAddress
    ? leaderboards.filter(l =>
        ((l as any).creator ?? l.admin).toLowerCase() === walletAddress.toLowerCase()
      )
    : []

  // Public listing: only boards where a real purchase has been made
  const activeLeaderboards = leaderboards.filter(l => BigInt(l.topFundsAddedRaw ?? '0') > 0n)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Ecosystem</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">Superfluid</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30 overflow-hidden flex-shrink-0">
                <Image src="/partners/superfluid.png" alt="Superfluid" width={48} height={48} className="object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold text-[#EDEEFF]">Superfluid</h1>
                  <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1DB227] animate-pulse" />
                    Season 5 Rewards Active
                  </span>
                </div>
                <p className="text-[#8A8FBF] max-w-xl">
                  A digital sign for your Superfluid project anyone can pay to edit. Top funds added gets the featured spot in each Markee message.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRewardsModalOpen(true)}
                className="flex items-center gap-2 bg-[#0A0F3D] text-[#F897FE] border border-[#F897FE]/40 px-5 py-3 rounded-lg font-semibold hover:bg-[#F897FE]/10 transition-colors whitespace-nowrap"
              >
                <Star size={16} />
                View SUP Rewards
              </button>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
              >
                <Plus size={18} />
                Create a Markee
              </button>
            </div>
          </div>

          {/* Stats */}
          {isLoadingLeaderboards ? (
            <HeroStatsSkeleton />
          ) : (
            <div className="flex items-center gap-6 mt-10 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{activeLeaderboards.length}</span>
                <span className="text-[#8A8FBF]">active signs</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                <span className="text-[#7C9CFF] font-semibold">{formatFunds(totalPlatformFunds)}</span>
                <span className="text-[#8A8FBF]">total funded</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#1DB227] font-semibold">1 pt / 0.0001 ETH</span>
                <span className="text-[#8A8FBF]">funded</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#1DB227] font-semibold">1 pt / follow</span>
                <span className="text-[#8A8FBF]">on Markee Farcaster</span>
                <a
                  href="https://farcaster.xyz/markee"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
                  aria-label="Follow Markee on Farcaster"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
              <button
                onClick={() => fetchLeaderboards(true)}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors text-xs disabled:opacity-40 ml-auto"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Raise Funds for Your Project',
                body: 'Create a Markee and set a beneficiary to receive funds from all paid messages.',
              },
              {
                step: '2',
                title: 'Buy Messages from Top Superfluid Projects',
                body: 'Featured messages get the most impressions and go towards funding your favorite projects.',
              },
              {
                step: '3',
                title: 'Get Rewarded',
                body: "Every purchase mints MARKEE tokens for the buyer and earns SUP in Superfluid's Season 5 Rewards.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1DB227]/15 border border-[#1DB227]/40 flex items-center justify-center text-[#1DB227] text-sm font-bold">
                  {step}
                </div>
                <div>
                  <h3 className="text-[#EDEEFF] font-semibold mb-1">{title}</h3>
                  <p className="text-[#8A8FBF] text-sm">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Message — Legacy TopDawg */}
      {featuredMessage?.message && (() => {
        const minIncrement = BigInt('1000000000000000') // 0.001 ETH
        const topFunds = BigInt(featuredMessage.totalFundsAdded ?? '0')
        const buyPrice = topFunds + minIncrement
        const buyPriceFormatted = (Number(buyPrice) / 1e18).toFixed(3)
        const totalFundsEth = (Number(BigInt(featuredMessage.totalFunds ?? '0')) / 1e18).toFixed(4)

        return (
          <section className="py-10 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
            <div className="max-w-2xl mx-auto px-4">
              <a
                href="https://campaigns.superfluid.org"
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center justify-center gap-2 bg-[#060A2A] border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 hover:bg-[#F897FE]/5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-medium px-4 py-2 rounded-t-lg transition-all"
              >
                <ExternalLink size={12} />
                campaigns.superfluid.org
              </a>

              <div className="rounded-t-none rounded-b-lg overflow-hidden border border-t-0 border-[#F897FE]/20">
                <div
                  className="bg-[#060A2A] rounded-t-none rounded-b-lg border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors p-5 cursor-pointer"
                  onClick={() => window.location.href = 'https://www.markee.xyz/ecosystem/superfluid'}
                >
                  <div className="bg-[#0A0F3D] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 flex flex-col min-h-[80px]">
                    <p className="text-[#EDEEFF] font-mono text-sm break-words flex-1">
                      {featuredMessage.message}
                    </p>
                    {featuredMessage.owner && (
                      <p className="text-[#8A8FBF] text-xs text-right mt-2">
                        — {featuredMessage.owner.slice(0, 6)}…{featuredMessage.owner.slice(-4)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs mb-4">
                    <span className="text-[#7C9CFF] font-medium">
                      {totalFundsEth} ETH total raised.
                    </span>
                    <span className="text-[#8A8FBF]">
                      {Math.max(0, (featuredMessage.markeeCount ?? 0) - 1)} {(featuredMessage.markeeCount ?? 0) - 1 === 1 ? 'message' : 'messages'}
                    </span>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={e => { e.stopPropagation(); setFeaturedModalOpen(true) }}
                      className="w-full sm:w-auto bg-[#F897FE] text-[#060A2A] px-6 py-2 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors text-sm"
                    >
                      {buyPriceFormatted} ETH to change
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )
      })()}

      {/* My Markees — visible only to the connected admin */}
      {walletAddress && myLeaderboards.length > 0 && (
        <section className="py-10 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-6">
              <User size={18} className="text-[#F897FE]" />
              <h2 className="text-xl font-bold text-[#EDEEFF]">My Markees</h2>
              <Link
                href="/account"
                className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
                title="My account"
              >
                <ExternalLink size={13} />
              </Link>
              <span className="text-[#8A8FBF] text-sm ml-auto">
                {myLeaderboards.length} {myLeaderboards.length === 1 ? 'sign' : 'signs'} you created
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {myLeaderboards.map(lb => (
                <MyMarkeeCard key={lb.address} leaderboard={lb} formatFunds={formatFunds} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Signs grid */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoadingLeaderboards ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <LeaderboardCardSkeleton key={i} />
              ))}
            </div>
          ) : activeLeaderboards.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Zap size={40} className="text-[#1DB227] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No active signs yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Be the first Superfluid project to buy a message.</p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
              >
                <Plus size={18} />
                Create a Markee
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={20} className="text-[#F897FE]" />
                <h2 className="text-2xl font-bold text-[#EDEEFF]">Active Signs</h2>
                <span className="text-[#8A8FBF] text-sm">ranked by total funds added</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {activeLeaderboards.map((lb, idx) => (
                  <LeaderboardCard
                    key={lb.address}
                    leaderboard={lb}
                    rank={idx + 1}
                    formatFunds={formatFunds}
                    trackView={trackView}
                    viewCount={views.get(lb.address.toLowerCase())?.totalViews}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />

      {createModalOpen && (
        <CreateMarkeeModal
          myLeaderboards={myLeaderboards}
          walletAddress={walletAddress}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => fetchLeaderboards(false, true)}
        />
      )}

      <RewardsModal
        isOpen={rewardsModalOpen}
        onClose={() => setRewardsModalOpen(false)}
        title="Season 5 SUP Rewards"
        description="Earn points by buying messages and adding funds to any Superfluid message."
      />

      <TopDawgModal
        isOpen={featuredModalOpen}
        onClose={() => setFeaturedModalOpen(false)}
        onSuccess={() => { setFeaturedModalOpen(false); fetchLeaderboards(true) }}
        strategyAddress={LEGACY_TOPDAWG_ADDRESS as `0x${string}`}
        partnerName="Superfluid"
        partnerSplitPercentage={62}
        topFundsAdded={featuredMessage?.totalFundsAdded ? BigInt(featuredMessage.totalFundsAdded) : undefined}
      />
    </div>
  )
}

// ─── My Markee Card (admin-only compact card) ─────────────────────────────────

function MyMarkeeCard({
  leaderboard,
  formatFunds,
}: {
  leaderboard: SuperfluidLeaderboard
  formatFunds: (eth: string) => string
}) {
  const router = useRouter()
  const hasPurchase = BigInt(leaderboard.topFundsAddedRaw ?? '0') > 0n

  return (
    <div
      onClick={() => router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)}
      className="bg-[#060A2A] rounded-lg border border-[#F897FE]/20 hover:border-[#F897FE]/60 transition-colors cursor-pointer p-4 flex items-center gap-4"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#0A0F3D] border border-[#8A8FBF]/20 flex-shrink-0">
        <Zap size={18} className="text-[#1DB227]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#EDEEFF] text-sm truncate">{leaderboard.name}</p>
        <p className="text-[#8A8FBF] text-xs mt-0.5">
          {formatFunds(leaderboard.totalFunds)} raised · {Math.max(0, leaderboard.markeeCount - 1)} {leaderboard.markeeCount - 1 === 1 ? 'message' : 'messages'}
        </p>
      </div>
      {!hasPurchase && (
        <span className="text-[10px] font-semibold text-[#8A8FBF] bg-[#8A8FBF]/10 border border-[#8A8FBF]/20 px-2 py-0.5 rounded-full flex-shrink-0">
          No bids yet
        </span>
      )}
    </div>
  )
}

// ─── Leaderboard Card ─────────────────────────────────────────────────────────

function LeaderboardCard({
  leaderboard,
  rank,
  formatFunds,
  trackView,
  viewCount,
}: {
  leaderboard: SuperfluidLeaderboard
  rank: number
  formatFunds: (eth: string) => string
  trackView: (m: Markee) => void
  viewCount?: number
}) {
  const router = useRouter()

  useEffect(() => {
    if (leaderboard.topMessage) {
      trackView(toMarkeeShape(leaderboard))
    }
  }, [leaderboard.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const minPriceRaw = BigInt(leaderboard.minimumPriceRaw ?? '0')
  const topFunds = BigInt(leaderboard.topFundsAddedRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = Number(buyPrice) / 1e18

  return (
    <div
      onClick={() => router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)}
      className="bg-[#0A0F3D] p-6 rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0">
          <Zap size={22} className="text-[#1DB227]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#EDEEFF] text-lg truncate">{leaderboard.name}</h3>
          <span className="text-[#8A8FBF] text-xs font-mono">
            {leaderboard.address.slice(0, 8)}…{leaderboard.address.slice(-6)}
          </span>
        </div>
      </div>

      {leaderboard.topMessage ? (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 hover:border-[#7C9CFF]/50 transition-colors flex flex-col min-h-[120px]">
          <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2 flex-1">
            {leaderboard.topMessage}
          </p>
          {leaderboard.topMessageOwner && (
            <p className="text-[#8A8FBF] text-xs text-right mt-auto">
              - {leaderboard.topMessageOwner}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center min-h-[120px] flex flex-col items-center justify-center">
          <div className="text-4xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">Be the first to buy a message</p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-[#7C9CFF] font-medium">
          {formatFunds(leaderboard.totalFunds)} total raised.
        </span>
        <div className="flex items-center gap-3 text-[#8A8FBF]">
          {viewCount !== undefined && (
            <span className="flex items-center gap-1">
              <Eye size={12} className="opacity-60" />
              <span>{viewCount.toLocaleString()}</span>
            </span>
          )}
          <span>
            {Math.max(0, leaderboard.markeeCount - 1)}{' '}
            {leaderboard.markeeCount - 1 === 1 ? 'message' : 'messages'}
          </span>
        </div>
      </div>

      <button
        onClick={e => {
          e.stopPropagation()
          router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)
        }}
        className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
      >
        {buyPriceFormatted.toFixed(3)} ETH to change
      </button>
    </div>
  )
}

// ─── Create Markee Modal ──────────────────────────────────────────────────────

function CreateMarkeeModal({
  myLeaderboards,
  walletAddress,
  onClose,
  onSuccess,
}: {
  myLeaderboards: SuperfluidLeaderboard[]
  walletAddress?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const router = useRouter()
  const { isConnected } = useAccount()
  const [leaderboardName, setLeaderboardName] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    let foundAddress: string | null = null
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === SUPERFLUID_FACTORY_ADDRESS.toLowerCase() &&
        log.topics[1]
      ) {
        foundAddress = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    setNewLeaderboardAddress(foundAddress)
    onSuccess()
  }, [isSuccess, receipt, onSuccess])

  const handleCreate = () => {
    setError(null)
    if (!leaderboardName.trim()) { setError('Enter a name for your sign.'); return }
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setError('Enter a valid Ethereum address.')
      return
    }
    writeContract({
      address: SUPERFLUID_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [beneficiary as `0x${string}`, leaderboardName.trim()],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">Markee created!</p>
            <p className="text-[#8A8FBF] text-sm text-center">
              Your sign is live on the Superfluid platform.
            </p>
            <div className="flex flex-col gap-3 w-full mt-2">
              <button
                onClick={() =>
                  newLeaderboardAddress &&
                  router.push(`/ecosystem/platforms/superfluid/${newLeaderboardAddress}`)
                }
                className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
              >
                View your Markee →
              </button>
              <button
                onClick={onClose}
                className="text-[#8A8FBF] text-sm hover:text-[#EDEEFF] transition-colors text-center"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                <Zap size={20} className="text-[#1DB227]" />
              </div>
              <div>
                <h2 className="text-[#EDEEFF] font-bold text-lg">Create a Markee</h2>
                <p className="text-[#8A8FBF] text-xs">Superfluid Season 5</p>
              </div>
            </div>

            {myLeaderboards.length > 0 && (
              <div className="mb-6">
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-3">Your Signs</div>
                <div className="space-y-2">
                  {myLeaderboards.map(lb => (
                    <div
                      key={lb.address}
                      className="flex items-center justify-between bg-[#060A2A] rounded-lg px-4 py-3 border border-[#8A8FBF]/15"
                    >
                      <p className="text-[#EDEEFF] text-sm truncate">{lb.name}</p>
                      <a
                        href={`/ecosystem/platforms/superfluid/${lb.address}`}
                        className="flex-shrink-0 text-xs text-[#F897FE] hover:text-[#7C9CFF] transition-colors ml-4"
                      >
                        View →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isConnected ? (
              <div className="space-y-3">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to create a Markee.</p>
                <ConnectButton />
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Sign Name <span className="text-[#F897FE]">*</span>
                  </label>
                  <input
                    type="text"
                    value={leaderboardName}
                    onChange={e => setLeaderboardName(e.target.value)}
                    placeholder="e.g. My Superfluid Project"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
                  />
                  <p className="text-[#8A8FBF] text-xs mt-1.5">Shown publicly on the platform.</p>
                </div>

                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Treasury Address <span className="text-[#F897FE]">*</span>
                  </label>
                  <input
                    type="text"
                    value={beneficiary}
                    onChange={e => setBeneficiary(e.target.value)}
                    placeholder="0x…"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                  />
                  <p className="text-[#8A8FBF] text-xs mt-1.5">62% of every payment goes here.</p>
                </div>

                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-sm">
                  <div className="text-[#8A8FBF] text-xs mb-3 uppercase tracking-wider">Revenue split</div>
                  <div className="flex justify-between">
                    <span className="text-[#EDEEFF]">Your treasury</span>
                    <span className="text-[#F897FE] font-semibold">62%</span>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[#EDEEFF]">Markee Cooperative</span>
                    <span className="text-[#7C9CFF] font-semibold">38%</span>
                  </div>
                </div>

                {(error || writeError) && (
                  <div className="flex items-start gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error ?? writeError?.message}</span>
                  </div>
                )}

                <button
                  onClick={handleCreate}
                  disabled={isPending || isConfirming}
                  className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}
                    </>
                  ) : (
                    'Create a Markee'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
