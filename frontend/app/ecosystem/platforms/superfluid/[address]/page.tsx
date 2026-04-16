'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Zap, Trophy, Plus, Copy, Check, Eye,
} from 'lucide-react'
import { useReadContracts, useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal, type MarkeeSlot } from '@/components/modals/BuyMessageModal'
import { useViews } from '@/hooks/useViews'
import type { Markee } from '@/types'

// ─── ABIs ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLeaderboardFunds', outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxMessageLength', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotToMarkee(slot: MarkeeSlot): Markee {
  return {
    address: slot.address,
    message: slot.message,
    owner: slot.owner,
    totalFundsAdded: slot.totalFundsAdded,
    chainId: 8453,
    pricingStrategy: '',
  }
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkeletonBar({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-[#1A1F4D] rounded animate-pulse ${className}`} />
  )
}

function MetaStatsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-8 mt-8">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2">
          <SkeletonBar className="w-4 h-4 rounded-full" />
          <SkeletonBar className="w-8 h-3.5" />
          <SkeletonBar className="w-16 h-3.5" />
        </div>
      ))}
    </div>
  )
}

function TopMessageSkeleton() {
  return (
    <section className="bg-[#0A0F3D] border-y border-[#8A8FBF]/20 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <SkeletonBar className="flex-shrink-0 w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0 space-y-3">
            <SkeletonBar className="w-24 h-3" />
            <SkeletonBar className="w-3/4 h-5" />
            <SkeletonBar className="w-1/2 h-4" />
            <div className="flex gap-4 pt-1">
              <SkeletonBar className="w-16 h-3" />
              <SkeletonBar className="w-20 h-3" />
              <SkeletonBar className="w-16 h-3" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MarkeeRowSkeleton({ rank }: { rank: number }) {
  const messageWidths = ['w-4/5', 'w-3/4', 'w-2/3', 'w-5/6', 'w-1/2']
  const nameWidths = ['w-24', 'w-20', 'w-28', 'w-16', 'w-24']
  const mw = messageWidths[rank % messageWidths.length]
  const nw = nameWidths[rank % nameWidths.length]

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 px-5 py-4 flex items-start gap-4">
      <SkeletonBar className="flex-shrink-0 w-8 h-8 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        <SkeletonBar className={`h-4 ${mw}`} />
        <SkeletonBar className={`h-3 ${nw}`} />
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2.5 pt-0.5">
        <SkeletonBar className="w-20 h-4" />
        <SkeletonBar className="w-14 h-3" />
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuperfluidLeaderboardPage() {
  const params = useParams()
  const leaderboardAddress = (params.address as string) as `0x${string}`

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<MarkeeSlot | null>(null)
  const [initialMode, setInitialMode] = useState<'create' | 'addFunds' | 'updateMessage' | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  // ── Read leaderboard metadata ──────────────────────────────────────────────
  const metaContracts = useMemo(() => [
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'markeeCount' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'admin' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'maxMessageLength' as const },
    { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees' as const, args: [100n] as const },
  ], [leaderboardAddress])

  const { data: meta, isLoading: isMetaLoading, refetch: refetchMeta } = useReadContracts({
    contracts: metaContracts,
  })

  const leaderboardName = meta?.[0]?.result as string | undefined
  const totalFunds = meta?.[1]?.result as bigint | undefined
  const markeeCount = meta?.[2]?.result as bigint | undefined
  const minimumPrice = meta?.[3]?.result as bigint | undefined
  const maxMessageLength = meta?.[5]?.result as bigint | undefined
  const topResult = meta?.[6]?.result as [string[], bigint[]] | undefined

  const topAddresses = topResult?.[0] ?? []
  const topFunds = topResult?.[1] ?? []

  const displayMessageCount = markeeCount !== undefined
    ? (markeeCount > 0n ? markeeCount - 1n : 0n)
    : undefined

  const markeeContracts = useMemo(
    () => topAddresses.flatMap(addr => [
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'owner' as const },
    ]),
    [topAddresses]
  )

  const { data: markeeDetails, isLoading: isDetailsLoading, refetch: refetchDetails } = useReadContracts({
    contracts: markeeContracts,
    query: { enabled: topAddresses.length > 0 },
  })

  const isLoading = isMetaLoading || (topAddresses.length > 0 && isDetailsLoading)

  const markees = useMemo((): MarkeeSlot[] =>
    topAddresses
      .map((addr, i) => ({
        address: addr,
        message: (markeeDetails?.[i * 3]?.result as string) ?? '',
        name: (markeeDetails?.[i * 3 + 1]?.result as string) ?? '',
        owner: (markeeDetails?.[i * 3 + 2]?.result as string) ?? '',
        totalFundsAdded: topFunds[i] ?? 0n,
      }))
      .filter(m => m.totalFundsAdded > 0n),
    [topAddresses, topFunds, markeeDetails]
  )

  // ── Views ──────────────────────────────────────────────────────────────────
  const viewableMarkees = useMemo(() => markees.map(slotToMarkee), [markees])
  const { views, trackView } = useViews(viewableMarkees)

  const refetch = useCallback(() => {
    refetchMeta()
    refetchDetails()
  }, [refetchMeta, refetchDetails])

  const formatFunds = (wei: bigint) => {
    const eth = parseFloat(formatEther(wei))
    if (eth === 0) return '0 ETH'
    if (eth < 0.0001) return '< 0.0001 ETH'
    return `${eth.toFixed(3)} ETH`
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(leaderboardAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const topMarkee = markees[0]

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="create-a-markee" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Link href="/create-a-markee" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Create a Markee</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <Link href="/ecosystem/platforms/superfluid" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Superfluid</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            {isMetaLoading
              ? <SkeletonBar className="w-32 h-3.5" />
              : <span className="text-[#EDEEFF] truncate max-w-xs">{leaderboardName ?? ''}</span>
            }
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-16 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Zap size={28} className="text-[#1DB227]" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  {isMetaLoading
                    ? <SkeletonBar className="w-48 h-7" />
                    : (
                      <>
                        <h1 className="text-2xl font-bold text-[#EDEEFF]">{leaderboardName ?? ''}</h1>
                        <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          Superfluid S5
                        </span>
                      </>
                    )
                  }
                </div>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-mono transition-colors"
                >
                  {leaderboardAddress.slice(0, 8)}…{leaderboardAddress.slice(-6)}
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            <button
              onClick={() => { setSelectedMarkee(null); setBuyModalOpen(true) }}
              className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
            >
              <Plus size={18} />
              Buy a Message
            </button>
          </div>

          {/* Stats */}
          {isMetaLoading ? (
            <MetaStatsSkeleton />
          ) : (
            <div className="flex flex-wrap items-center gap-8 mt-8">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{displayMessageCount?.toString() ?? ''}</span>
                <span className="text-[#8A8FBF]">messages</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                <span className="text-[#7C9CFF] font-semibold">
                  {totalFunds !== undefined ? formatFunds(totalFunds) : '—'}
                </span>
                <span className="text-[#8A8FBF]">total funded</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top message spotlight */}
      {isLoading
        ? <TopMessageSkeleton />
        : topMarkee && (
          <section className="bg-[#0A0F3D] border-y border-[#8A8FBF]/20 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#FFD700]/15 border border-[#FFD700]/40 text-[#FFD700] text-xs font-bold">
                  #1
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">Top Message</div>
                  <p className="text-[#EDEEFF] font-mono text-base leading-relaxed">
                    {topMarkee.message || <span className="opacity-40 italic">No message set</span>}
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    {topMarkee.name && (
                      <span className="text-[#8A8FBF] text-xs">by {topMarkee.name}</span>
                    )}
                    <span className="text-[#F897FE] text-xs font-semibold">{formatFunds(topMarkee.totalFundsAdded)}</span>
                    <button
                      onClick={() => { setSelectedMarkee(topMarkee); setBuyModalOpen(true) }}
                      className="text-[#7C9CFF] text-xs hover:text-[#F897FE] transition-colors"
                    >
                      Add funds →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )
      }

      {/* All Messages */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#EDEEFF]">All Messages</h2>
            <button
              onClick={() => { setSelectedMarkee(null); setBuyModalOpen(true) }}
              className="flex items-center gap-1.5 text-sm text-[#8A8FBF] hover:text-[#F897FE] transition-colors border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-4 py-2 rounded-lg"
            >
              <Plus size={14} />
              Buy a message
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <MarkeeRowSkeleton key={i} rank={i} />
              ))}
            </div>
          ) : markees.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Trophy size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No messages yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Be the first to buy a message on this sign.</p>
              <button
                onClick={() => setBuyModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
              >
                <Plus size={18} />
                Buy the first message
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {markees.map((markee, idx) => (
                <MarkeeRow
                  key={markee.address}
                  markee={markee}
                  rank={idx + 1}
                  formatFunds={formatFunds}
                  trackView={trackView}
                  viewCount={views.get(markee.address.toLowerCase())?.totalViews}
                  onAddFunds={() => { setSelectedMarkee(markee); setInitialMode('addFunds'); setBuyModalOpen(true) }}
                  onEditMessage={() => { setSelectedMarkee(markee); setInitialMode('updateMessage'); setBuyModalOpen(true) }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {buyModalOpen && (
        <BuyMessageModal
          leaderboardAddress={leaderboardAddress}
          minimumPrice={minimumPrice ?? 0n}
          maxMessageLength={Number(maxMessageLength ?? 222n)}
          existingMarkee={selectedMarkee}
          topFundsAdded={markees[0]?.totalFundsAdded}
          initialMode={initialMode}
          platformId="superfluid"
          onClose={() => { setBuyModalOpen(false); setSelectedMarkee(null); setInitialMode(undefined) }}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}

// ─── Markee Row ───────────────────────────────────────────────────────────────

function MarkeeRow({
  markee,
  rank,
  formatFunds,
  trackView,
  viewCount,
  onAddFunds,
  onEditMessage,
}: {
  markee: MarkeeSlot
  rank: number
  formatFunds: (wei: bigint) => string
  trackView: (m: Markee) => void
  viewCount?: number
  onAddFunds: () => void
  onEditMessage: () => void
}) {
  const { address } = useAccount()
  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  useEffect(() => {
    if (markee.message) {
      trackView(slotToMarkee(markee))
    }
  }, [markee.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const rankColors: Record<number, string> = {
    1: 'text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10',
    2: 'text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10',
    3: 'text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10',
  }
  const rankStyle = rankColors[rank] ?? 'text-[#8A8FBF] border-[#8A8FBF]/20 bg-[#8A8FBF]/5'

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-all px-5 py-4 flex items-start gap-4">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${rankStyle}`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#EDEEFF] font-mono text-sm leading-relaxed line-clamp-2">
          {markee.message || <span className="opacity-40 italic">No message</span>}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {markee.name && <span className="text-[#8A8FBF] text-xs">{markee.name}</span>}
          {isOwner && (
            <span className="text-xs bg-[#F897FE]/15 border border-[#F897FE]/30 text-[#F897FE] px-2 py-0.5 rounded-full">
              yours
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        {viewCount !== undefined && (
          <span className="text-[#8A8FBF] text-xs flex items-center gap-1">
            <Eye size={12} className="opacity-60" />
            <span>{viewCount.toLocaleString()}</span>
          </span>
        )}
        <span className="text-[#F897FE] text-sm font-semibold">{formatFunds(markee.totalFundsAdded)}</span>
        <button onClick={onAddFunds} className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
          + add funds
        </button>
        {isOwner && (
          <button onClick={onEditMessage} className="text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
            edit message
          </button>
        )}
      </div>
    </div>
  )
}
