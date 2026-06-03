'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Zap, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Star, ExternalLink, Eye, User,
  Rocket, Shield, Trash2,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import Image from 'next/image'
import { RewardsModal } from '@/components/modals/RewardsModal'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { NETWORK_PAUSED } from '@/lib/paused'
import { useViews } from '@/hooks/useViews'
import type { Markee } from '@/types'
import { FACTORIES } from '@/lib/contracts/addresses'
import type { BoostedMarkee } from '@/app/api/superfluid/boosted/route'
import { useSignMessage } from 'wagmi'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPERFLUID_FACTORY_ADDRESS = FACTORIES.SUPERFLUID

const BOOSTED_MULTIPLIER = 5
const MODERATION_CHAIN_ID = 8453

const ADMIN_ADDRESSES = [
  '0x809c9f8dd8ca93a41c3adca4972fa234c28f7714',
  '0xaf4401e765dff079ab6021bbb8d46e53e27613db',
]

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
  topMarkeeAddress: string | null
  boosted: boolean
}

interface BoostedLeaderboardEntry {
  address: string
  name: string
  logoUrl?: string
  projectUrl?: string
  leaderboard: SuperfluidLeaderboard | null
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

function formatFunds(eth: string) {
  const n = parseFloat(eth)
  if (n === 0) return '0 ETH'
  if (n < 0.001) return '< 0.001 ETH'
  return `${n.toFixed(3)} ETH`
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

function BoostedCardSkeleton() {
  return (
    <div className="bg-[#0A0F3D] p-4 rounded-lg border border-[#8A8FBF]/20 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <SkeletonBar className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="w-3/4 h-4" />
          <SkeletonBar className="w-1/3 h-3" />
        </div>
      </div>
      <div className="bg-[#060A2A] rounded-lg p-3 mb-3 border border-[#8A8FBF]/20 h-[90px] space-y-2 flex flex-col justify-center">
        <SkeletonBar className="w-full h-3" />
        <SkeletonBar className="w-4/5 h-3" />
      </div>
      <div className="flex items-center justify-between mb-3">
        <SkeletonBar className="w-28 h-3" />
        <SkeletonBar className="w-16 h-3" />
      </div>
      <SkeletonBar className="w-full h-9 rounded-lg" />
    </div>
  )
}

function LeaderboardCardSkeleton() {
  return (
    <div className="bg-[#0A0F3D] p-4 rounded-lg border border-[#8A8FBF]/20">
      <div className="flex items-center gap-3 mb-3">
        <SkeletonBar className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="w-3/4 h-4" />
          <SkeletonBar className="w-1/2 h-3" />
        </div>
      </div>
      <div className="bg-[#060A2A] rounded-lg p-3 mb-3 border border-[#8A8FBF]/20 h-[90px] space-y-2 flex flex-col justify-center">
        <SkeletonBar className="w-full h-3" />
        <SkeletonBar className="w-4/5 h-3" />
      </div>
      <div className="flex items-center justify-between mb-3">
        <SkeletonBar className="w-28 h-3" />
        <SkeletonBar className="w-16 h-3" />
      </div>
      <SkeletonBar className="w-full h-9 rounded-lg" />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuperfluidPlatformPage() {
  const { address: walletAddress } = useAccount()
  const [leaderboards, setLeaderboards] = useState<SuperfluidLeaderboard[]>([])
  const [boostedLeaderboards, setBoostedLeaderboards] = useState<BoostedLeaderboardEntry[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [rewardsModalOpen, setRewardsModalOpen] = useState(false)

  const [activeBoostedModal, setActiveBoostedModal] = useState<SuperfluidLeaderboard | null>(null)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)

  const isAdmin = walletAddress
    ? ADMIN_ADDRESSES.includes(walletAddress.toLowerCase())
    : false

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
        setBoostedLeaderboards(data.boostedLeaderboards ?? [])
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')
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
  const viewableMarkees = useMemo(() => {
    const all = leaderboards.map(toMarkeeShape)
    boostedLeaderboards.forEach(b => { if (b.leaderboard) all.push(toMarkeeShape(b.leaderboard)) })
    return all
  }, [leaderboards, boostedLeaderboards])
  const { views, trackView } = useViews(viewableMarkees)

  const myLeaderboards = walletAddress
    ? leaderboards.filter(l =>
        ((l as any).creator ?? l.admin).toLowerCase() === walletAddress.toLowerCase()
      )
    : []

  // Regular active signs: exclude boosted leaderboards from this list
  const boostedAddressSet = new Set(boostedLeaderboards.map(b => b.address.toLowerCase()))
  const activeLeaderboards = leaderboards.filter(l =>
    BigInt(l.topFundsAddedRaw ?? '0') > 0n && !boostedAddressSet.has(l.address.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="create-a-markee" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/create-a-markee" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Create a Markee</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">Superfluid</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-16 overflow-hidden">
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
                    Season 6 Rewards Active
                  </span>
                </div>
                <p className="text-[#8A8FBF] max-w-xl">
                  A digital sign for your Superfluid project anyone can pay to edit. Boosted Markees earn 5x SUP points. Fund your favorite ecosystem project and earn!
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
              {!NETWORK_PAUSED && (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
                >
                  <Plus size={18} />
                  Create a Markee
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          {isLoadingLeaderboards ? (
            <HeroStatsSkeleton />
          ) : (
            <div className="flex items-center gap-6 mt-10 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{activeLeaderboards.length + boostedLeaderboards.length}</span>
                <span className="text-[#8A8FBF]">active signs</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                <span className="text-[#7C9CFF] font-semibold">{formatFunds(totalPlatformFunds)}</span>
                <span className="text-[#8A8FBF]">total funded</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#1DB227] font-semibold">10M pts / ETH</span>
                <span className="text-[#8A8FBF]">standard</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Rocket size={12} className="text-[#F897FE]" />
                <span className="text-[#F897FE] font-semibold">50M pts / ETH</span>
                <span className="text-[#8A8FBF]">on Boosted Markees</span>
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
                onClick={() => fetchLeaderboards(true, true)}
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

      {/* Boosted Markees */}
      <section className="py-10 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-5">
            <Rocket size={18} className="text-[#F897FE]" />
            <h2 className="text-xl font-bold text-[#EDEEFF]">Boosted Markees</h2>
            <span className="flex items-center gap-1 bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE] text-xs font-bold px-2 py-0.5 rounded-full">
              {BOOSTED_MULTIPLIER}× pts
            </span>
            <span className="text-[#8A8FBF] text-sm hidden sm:inline">Season 6 ecosystem projects: buy a message and earn 5x the SUP points</span>
          </div>

          {isLoadingLeaderboards ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => <BoostedCardSkeleton key={i} />)}
            </div>
          ) : boostedLeaderboards.length === 0 ? (
            <div className="text-center py-8 text-[#8A8FBF] text-sm">
              No boosted markees configured yet.
              {isAdmin && (
                <button
                  onClick={() => setAdminPanelOpen(true)}
                  className="ml-2 text-[#F897FE] hover:underline"
                >
                  Add one →
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {boostedLeaderboards.map(entry => (
                <BoostedCard
                  key={entry.address}
                  entry={entry}
                  trackView={trackView}
                  viewCount={entry.leaderboard ? views.get(entry.leaderboard.address.toLowerCase())?.totalViews : undefined}
                  onBuy={() => entry.leaderboard && setActiveBoostedModal(entry.leaderboard)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 bg-[#060A2A] border-b border-[#8A8FBF]/20">
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
                title: 'Buy Messages on Boosted Signs',
                body: 'Fund ecosystem project signs to earn 5× SUP points. Every purchase also goes towards funding the project.',
              },
              {
                step: '3',
                title: 'Earn Season 6 SUP Rewards',
                body: "Every purchase earns SUP in Superfluid's Season 6 Rewards. Boosted Markees earn 5x. Fund your favorite projects.",
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

      {/* My Markees */}
      {walletAddress && myLeaderboards.length > 0 && (
        <section className="py-10 bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
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
              <span className="text-[#8A8FBF] text-sm">
                {myLeaderboards.length} {myLeaderboards.length === 1 ? 'sign' : 'signs'} you created
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {myLeaderboards.map(lb => (
                <MyMarkeeCard key={lb.address} leaderboard={lb} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Markee Signs */}
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
              <p className="text-[#EDEEFF] font-semibold mb-2">No community signs yet this season</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Create a Markee for your Superfluid project to appear here.</p>
              {!NETWORK_PAUSED && (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
                >
                  <Plus size={18} />
                  Create a Markee
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={20} className="text-[#F897FE]" />
                <h2 className="text-2xl font-bold text-[#EDEEFF]">All Markee Signs</h2>
                <span className="text-[#8A8FBF] text-sm">ranked by Season 6 funds added</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {activeLeaderboards.map((lb, idx) => (
                  <LeaderboardCard
                    key={lb.address}
                    leaderboard={lb}
                    rank={idx + 1}
                    trackView={trackView}
                    viewCount={views.get(lb.address.toLowerCase())?.totalViews}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Admin Panel */}
      {isAdmin && (
        <section className="py-10 bg-[#0A0F3D] border-t border-[#8A8FBF]/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setAdminPanelOpen(p => !p)}
              className="flex items-center gap-2 text-[#8A8FBF] hover:text-[#F897FE] transition-colors text-sm mb-4"
            >
              <Shield size={14} />
              {adminPanelOpen ? 'Hide' : 'Show'} Admin Panel
            </button>
            {adminPanelOpen && (
              <AdminPanel
                boostedLeaderboards={boostedLeaderboards}
                walletAddress={walletAddress!}
                onUpdate={() => fetchLeaderboards(true, true)}
              />
            )}
          </div>
        </section>
      )}

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
        title="Season 6 SUP Rewards"
        description="Earn points by buying messages. Boosted Markees earn 5× points."
      />

      {/* Boosted buy modal */}
      {activeBoostedModal && (
        <BoostedBuyModal
          leaderboard={activeBoostedModal}
          onClose={() => setActiveBoostedModal(null)}
          onSuccess={() => { setActiveBoostedModal(null); fetchLeaderboards(true, true) }}
        />
      )}
    </div>
  )
}

// ─── Boosted Card ────────────────────────────────────────────────────────────

function BoostedCard({
  entry,
  trackView,
  viewCount,
  onBuy,
}: {
  entry: BoostedLeaderboardEntry
  trackView: (m: Markee) => void
  viewCount?: number
  onBuy: () => void
}) {
  const lb = entry.leaderboard
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    if (lb?.topMessage) trackView(toMarkeeShape(lb))
  }, [lb?.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const minIncrement = BigInt('1000000000000000')
  const minPriceRaw = BigInt(lb?.minimumPriceRaw ?? '3000000000000000')
  const topFunds = BigInt(lb?.topFundsAddedRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = (Number(buyPrice) / 1e18).toFixed(3)

  return (
    <div className="bg-[#0A0F3D] p-4 rounded-lg border border-[#F897FE]/25 hover:border-[#F897FE]/60 transition-colors">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0 overflow-hidden">
          {entry.logoUrl && !logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.logoUrl} alt={entry.name} className="object-contain w-7 h-7" onError={() => setLogoError(true)} />
          ) : (
            <span className="text-[#F897FE] text-base font-bold">{entry.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/ecosystem/platforms/superfluid/${entry.address}`}
            className="font-bold text-[#EDEEFF] text-base truncate hover:text-[#F897FE] transition-colors block"
          >
            {entry.name}
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Rocket size={10} className="text-[#F897FE] flex-shrink-0" />
            <span className="text-xs text-[#F897FE] font-bold">{BOOSTED_MULTIPLIER}x pts</span>
          </div>
        </div>
      </div>

      {/* Message — fixed height so all cards stay the same size */}
      <div className="bg-[#060A2A] rounded-lg p-3 mb-3 border border-[#8A8FBF]/20 h-[90px] overflow-hidden">
        {lb?.topMessage ? (
          <p className="text-[#EDEEFF] font-mono text-xs leading-snug line-clamp-4 break-words">{lb.topMessage}</p>
        ) : (
          <p className="text-[#8A8FBF] text-xs italic h-full flex items-center justify-center">Be the first to buy a message</p>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-[#7C9CFF] font-medium">
          {lb ? formatFunds(lb.totalFunds) : '0 ETH'} total raised.
        </span>
        <div className="flex items-center gap-3 text-[#8A8FBF]">
          {viewCount !== undefined && (
            <span className="flex items-center gap-1">
              <Eye size={12} className="opacity-60" />
              <span>{viewCount.toLocaleString()}</span>
            </span>
          )}
          {lb && (
            <span>
              {Math.max(0, lb.markeeCount - 1)}{' '}
              {lb.markeeCount - 1 === 1 ? 'message' : 'messages'}
            </span>
          )}
        </div>
      </div>

      {/* Buy button */}
      {!NETWORK_PAUSED && (
        <button
          onClick={onBuy}
          className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
        >
          {buyPriceFormatted} ETH to change
        </button>
      )}
    </div>
  )
}

// ─── Boosted Buy Modal ───────────────────────────────────────────────────────

function BoostedBuyModal({
  leaderboard,
  onClose,
  onSuccess,
}: {
  leaderboard: SuperfluidLeaderboard
  onClose: () => void
  onSuccess: () => void
}) {
  return (
    <BuyMessageModal
      leaderboardAddress={leaderboard.address as `0x${string}`}
      minimumPrice={BigInt(leaderboard.minimumPriceRaw ?? '0')}
      maxMessageLength={222}
      existingMarkee={null}
      initialMode="create"
      topFundsAdded={BigInt(leaderboard.topFundsAddedRaw ?? '0')}
      platformId="superfluid"
      onClose={onClose}
      onSuccess={onSuccess}
    />
  )
}

// ─── My Markee Card ──────────────────────────────────────────────────────────

function MyMarkeeCard({ leaderboard }: { leaderboard: SuperfluidLeaderboard }) {
  const router = useRouter()
  const hasPurchase = BigInt(leaderboard.topFundsAddedRaw ?? '0') > 0n

  return (
    <div
      onClick={() => router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)}
      className="bg-[#060A2A] rounded-lg border border-[#F897FE]/20 hover:border-[#F897FE]/60 transition-colors cursor-pointer p-4 flex items-center gap-4"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#0A0F3D] border border-[#8A8FBF]/20 flex-shrink-0">
        {leaderboard.boosted ? (
          <Rocket size={16} className="text-[#F897FE]" />
        ) : (
          <Zap size={18} className="text-[#1DB227]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#EDEEFF] text-sm truncate">{leaderboard.name}</p>
        <p className="text-[#8A8FBF] text-xs mt-0.5">
          {formatFunds(leaderboard.totalFunds)} raised · {Math.max(0, leaderboard.markeeCount - 1)} {leaderboard.markeeCount - 1 === 1 ? 'message' : 'messages'}
        </p>
      </div>
      {leaderboard.boosted && (
        <span className="text-[10px] font-bold text-[#F897FE] bg-[#F897FE]/10 border border-[#F897FE]/20 px-2 py-0.5 rounded-full flex-shrink-0">
          {BOOSTED_MULTIPLIER}×
        </span>
      )}
      {!hasPurchase && !leaderboard.boosted && (
        <span className="text-[10px] font-semibold text-[#7C9CFF] bg-[#7C9CFF]/10 border border-[#7C9CFF]/20 px-2 py-0.5 rounded-full flex-shrink-0">
          Awaiting Activation
        </span>
      )}
    </div>
  )
}

// ─── Leaderboard Card ────────────────────────────────────────────────────────

function LeaderboardCard({
  leaderboard,
  rank,
  trackView,
  viewCount,
}: {
  leaderboard: SuperfluidLeaderboard
  rank: number
  trackView: (m: Markee) => void
  viewCount?: number
}) {
  const router = useRouter()

  useEffect(() => {
    if (leaderboard.topMessage) {
      trackView(toMarkeeShape(leaderboard))
    }
  }, [leaderboard.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const minIncrement = BigInt('1000000000000000')
  const minPriceRaw = BigInt(leaderboard.minimumPriceRaw ?? '0')
  const topFunds = BigInt(leaderboard.topFundsAddedRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = Number(buyPrice) / 1e18

  return (
    <div
      onClick={() => router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)}
      className="bg-[#0A0F3D] p-4 rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0">
          <Zap size={18} className="text-[#1DB227]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#EDEEFF] text-base truncate">{leaderboard.name}</h3>
          <span className="text-[#8A8FBF] text-xs font-mono">
            {leaderboard.address.slice(0, 8)}…{leaderboard.address.slice(-6)}
          </span>
        </div>
      </div>

      {/* Message — fixed height so all cards stay the same size */}
      <div className="bg-[#060A2A] rounded-lg p-3 mb-3 border border-[#8A8FBF]/20 h-[90px] overflow-hidden hover:border-[#7C9CFF]/50 transition-colors">
        {leaderboard.topMessage ? (
          <p className="text-[#EDEEFF] font-mono text-xs leading-snug line-clamp-4 break-words">
            {leaderboard.topMessage}
          </p>
        ) : (
          <p className="text-[#8A8FBF] text-xs italic h-full flex items-center justify-center">Be the first to buy a message</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs mb-3">
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

// ─── Admin Panel ─────────────────────────────────────────────────────────────

function AdminPanel({
  boostedLeaderboards,
  walletAddress,
  onUpdate,
}: {
  boostedLeaderboards: BoostedLeaderboardEntry[]
  walletAddress: string
  onUpdate: () => void
}) {
  const { signMessageAsync } = useSignMessage()
  const [addAddress, setAddAddress] = useState('')
  const [addName, setAddName] = useState('')
  const [addLogo, setAddLogo] = useState('')
  const [addProject, setAddProject] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function signAndPost(action: 'add' | 'remove', address: string, metadata?: { name: string; logoUrl?: string; projectUrl?: string }) {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `markee-boosted:${action}:${MODERATION_CHAIN_ID}:${address.toLowerCase()}:${timestamp}`
      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/superfluid/boosted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          address,
          name: metadata?.name,
          logoUrl: metadata?.logoUrl || undefined,
          projectUrl: metadata?.projectUrl || undefined,
          adminAddress: walletAddress,
          signature,
          timestamp,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Request failed'); return }
      setSuccess(`${action === 'add' ? 'Added' : 'Removed'} successfully`)
      setAddAddress('')
      setAddName('')
      setAddLogo('')
      setAddProject('')
      onUpdate()
    } catch (e: any) {
      setError(e.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#060A2A] rounded-xl border border-[#F897FE]/20 p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-[#F897FE]" />
        <h3 className="text-[#EDEEFF] font-bold">Boosted Markees Admin</h3>
      </div>

      {/* Current list */}
      {boostedLeaderboards.length > 0 && (
        <div className="space-y-2">
          <p className="text-[#8A8FBF] text-xs uppercase tracking-wider">Current Boosted ({boostedLeaderboards.length})</p>
          <div className="space-y-2">
            {boostedLeaderboards.map(entry => (
              <div key={entry.address} className="flex items-center gap-3 bg-[#0A0F3D] rounded-lg px-3 py-2 border border-[#8A8FBF]/15">
                <div className="w-6 h-6 rounded bg-[#060A2A] border border-[#8A8FBF]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {entry.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.logoUrl} alt={entry.name} width={16} height={16} className="object-contain w-4 h-4" />
                  ) : (
                    <span className="text-[9px] text-[#F897FE] font-bold">{entry.name.charAt(0)}</span>
                  )}
                </div>
                <span className="text-[#EDEEFF] text-xs flex-1 min-w-0">
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-[#8A8FBF] ml-2 font-mono">{entry.address.slice(0, 8)}…</span>
                </span>
                <button
                  onClick={() => signAndPost('remove', entry.address)}
                  disabled={loading}
                  className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="space-y-3">
        <p className="text-[#8A8FBF] text-xs uppercase tracking-wider">Add Boosted Markee</p>
        <input
          type="text"
          placeholder="Leaderboard address (0x…)"
          value={addAddress}
          onChange={e => setAddAddress(e.target.value)}
          className="w-full bg-[#0A0F3D] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-3 py-2 text-[#EDEEFF] text-sm font-mono outline-none"
        />
        <input
          type="text"
          placeholder="Project name"
          value={addName}
          onChange={e => setAddName(e.target.value)}
          className="w-full bg-[#0A0F3D] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-3 py-2 text-[#EDEEFF] text-sm outline-none"
        />
        <input
          type="text"
          placeholder="Logo URL (optional)"
          value={addLogo}
          onChange={e => setAddLogo(e.target.value)}
          className="w-full bg-[#0A0F3D] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-3 py-2 text-[#EDEEFF] text-sm outline-none"
        />
        <input
          type="text"
          placeholder="Project URL (optional)"
          value={addProject}
          onChange={e => setAddProject(e.target.value)}
          className="w-full bg-[#0A0F3D] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-3 py-2 text-[#EDEEFF] text-sm outline-none"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        {success && <p className="text-green-400 text-xs">{success}</p>}
        <button
          onClick={() => {
            if (!/^0x[0-9a-fA-F]{40}$/.test(addAddress)) { setError('Invalid address'); return }
            if (!addName.trim()) { setError('Name is required'); return }
            signAndPost('add', addAddress, { name: addName, logoUrl: addLogo || undefined, projectUrl: addProject || undefined })
          }}
          disabled={loading}
          className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add to Boosted
        </button>
      </div>
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
              RevNet active. 62% to your treasury, 38% to Markee Cooperative.
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
                <p className="text-[#8A8FBF] text-xs">Superfluid Season 6</p>
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
