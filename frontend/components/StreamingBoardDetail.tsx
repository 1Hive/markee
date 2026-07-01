'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, Zap, Trophy, Plus, Copy, Check, Eye } from 'lucide-react'
import { formatEther, type Address } from 'viem'
import { useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StreamModal, type StreamTarget } from '@/components/modals/StreamModal'
import { CreateMessageModal } from '@/components/modals/CreateMessageModal'
import { useStreamingMarkees, type StreamingMarkee } from '@/lib/contracts/useStreamingMarkees'
import { useStreamingBoardTotal } from '@/hooks/useStreamingBoardTotal'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { ratePerSecToMonthly } from '@/lib/superfluid/streaming'
import { NETWORK_PAUSED } from '@/lib/paused'

// ── Theme tokens (shared with StreamModal) ─────────────────────────────────────
const BG = '#060A2A'
const BG2 = '#0A0F3D'
const PINK = '#F897FE'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED = '#8A8FBF'
const TEXT = '#EDEEFF'
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"

// Effective rate (wei/sec) → human "X ETH/mo".
function formatRate(weiPerSec: bigint): string {
  const eth = parseFloat(formatEther(ratePerSecToMonthly(weiPerSec)))
  if (eth === 0) return '0 ETH/mo'
  if (eth < 0.00005) return '< 0.0001 ETH/mo' // would round to 0.0000 at 4 dp
  return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
}

function formatViews(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`bg-[#1A1F4D] rounded animate-pulse ${className}`} />
}

function MarkeeRowSkeleton() {
  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 px-5 py-4 flex items-start gap-4">
      <SkeletonBar className="flex-shrink-0 w-8 h-8 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        <SkeletonBar className="h-4 w-4/5" />
        <SkeletonBar className="h-3 w-24" />
      </div>
      <SkeletonBar className="w-24 h-4" />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function StreamingBoardDetail({ board }: { board: Address }) {
  const { meta, markees, isLoading, refetch } = useStreamingMarkees(board)

  const boardTotal = useStreamingBoardTotal(board)
  const ethPrice = useEthPrice()
  const liveStreamedWei = useFlowingAmount(
    boardTotal?.totalRaw ?? 0n,
    boardTotal?.streamedAt ?? 0,
    boardTotal?.rateRaw ?? 0n,
  )
  const streamedEth = parseFloat(formatEther(liveStreamedWei))
  const hasFlow = boardTotal !== null && (boardTotal.totalRaw > 0n || boardTotal.rateRaw > 0n)

  const [target, setTarget] = useState<StreamTarget | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const canStream = !NETWORK_PAUSED && meta.version !== undefined

  const messageCount = meta.markeeCount !== undefined
    ? (meta.markeeCount > 0n ? meta.markeeCount - 1n : 0n)
    : undefined

  const topMarkee = markees[0]
  const [topViews, setTopViews] = useState<number | null>(null)

  // Track a view for the board's top message, mirroring the fixed reader. The POST both increments
  // (production only, gated server-side) and returns the current total for display.
  useEffect(() => {
    const top = markees[0]
    if (!top?.address || !top?.message) return
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: top.address, message: top.message }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (typeof data?.totalViews === 'number') setTopViews(data.totalViews) })
      .catch(() => {})
  }, [markees[0]?.address, !!markees[0]?.message]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyAddress = () => {
    navigator.clipboard.writeText(board)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const backMarkee = (m: StreamingMarkee) =>
    setTarget({ address: m.address, message: m.message, name: m.name })

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="create-a-markee" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Link href="/create-a-markee" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Create a Markee</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#8A8FBF]">Streaming</span>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            {isLoading && !meta.name
              ? <SkeletonBar className="w-32 h-3.5" />
              : <span className="text-[#EDEEFF] truncate max-w-xs">{meta.name ?? ''}</span>
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
                  {isLoading && !meta.name
                    ? <SkeletonBar className="w-48 h-7" />
                    : (
                      <>
                        <h1 className="text-2xl font-bold text-[#EDEEFF]">{meta.name ?? ''}</h1>
                        <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          Streaming
                        </span>
                      </>
                    )
                  }
                </div>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-mono transition-colors"
                >
                  {board.slice(0, 8)}…{board.slice(-6)}
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            {canStream && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
              >
                <Plus size={18} />
                Add a message
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-8 mt-8">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{messageCount?.toString() ?? '—'}</span>
              <span className="text-[#8A8FBF]">messages</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trophy size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">
                {topMarkee ? formatRate(topMarkee.rate) : '—'}
              </span>
              <span className="text-[#8A8FBF]">top rate</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Eye size={14} className="text-[#8A8FBF]" />
              <span className="text-[#EDEEFF] font-semibold">
                {topViews !== null ? formatViews(topViews) : '—'}
              </span>
              <span className="text-[#8A8FBF]">views</span>
            </div>
          </div>

          {/* Live total streamed — ticks up in real time at the board's aggregate inflow rate */}
          {hasFlow && (
            <div className="mt-8">
              <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-1.5">
                Total streamed to this board
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1DB227] animate-pulse" />
                <span className="text-3xl md:text-4xl font-bold text-[#EDEEFF] font-mono tabular-nums">
                  {streamedEth.toFixed(6)}
                </span>
                <span className="text-[#8A8FBF] text-lg font-mono">ETHx</span>
                {ethPrice && (
                  <span className="text-[#7C9CFF] text-sm font-mono">
                    ≈ {formatUsd(streamedEth * ethPrice)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top message spotlight */}
      {topMarkee && (
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
                  {topMarkee.name && <span className="text-[#8A8FBF] text-xs">by {topMarkee.name}</span>}
                  <span className="text-[#F897FE] text-xs font-semibold">{formatRate(topMarkee.rate)}</span>
                  {canStream && (
                    <button
                      onClick={() => backMarkee(topMarkee)}
                      className="text-[#7C9CFF] text-xs hover:text-[#F897FE] transition-colors"
                    >
                      Stream to back →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* All Messages */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#EDEEFF]">Leaderboard</h2>
            {canStream && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 text-sm text-[#8A8FBF] hover:text-[#F897FE] transition-colors border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-4 py-2 rounded-lg"
              >
                <Plus size={14} />
                Add a message
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <MarkeeRowSkeleton key={i} />)}
            </div>
          ) : markees.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Trophy size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No backed messages yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Add a message and open a stream to claim the top spot.</p>
              {canStream && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
                >
                  <Plus size={18} />
                  Add the first message
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {markees.map((markee, idx) => (
                <MarkeeRow
                  key={markee.address}
                  markee={markee}
                  rank={idx + 1}
                  onBack={canStream ? () => backMarkee(markee) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {target && (
        <StreamModal
          isOpen={true}
          board={board}
          markee={target}
          onClose={() => setTarget(null)}
          onSuccess={refetch}
        />
      )}

      {createOpen && (
        <CreateMessageModal
          board={board}
          onClose={() => setCreateOpen(false)}
          onCreated={(addr, message, name) => {
            setCreateOpen(false)
            refetch()
            setTarget({ address: addr, message, name })
          }}
        />
      )}
    </div>
  )
}

// ── Markee row ─────────────────────────────────────────────────────────────────

function MarkeeRow({
  markee,
  rank,
  onBack,
}: {
  markee: StreamingMarkee
  rank: number
  onBack?: () => void
}) {
  const { address } = useAccount()
  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

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
        <span className="text-[#F897FE] text-sm font-semibold">{formatRate(markee.rate)}</span>
        {onBack && (
          <button onClick={onBack} className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
            stream to back
          </button>
        )}
      </div>
    </div>
  )
}
