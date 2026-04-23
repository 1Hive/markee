'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { useReactions } from '@/hooks/useReactions'
import { useViews } from '@/hooks/useViews'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { Eye, Search } from 'lucide-react'
import { formatEth, formatAddress } from '@/lib/utils'
import type { Markee } from '@/types'

export default function Home() {
  const { address } = useAccount()

  const { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch } = useMarkees()

  // Ecosystem stats
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

  const { reactions, toggleReaction, removeReaction, isLoading: reactionsLoading } = useReactions()

  const { views, trackView } = useViews(markees)

  useEffect(() => {
    if (markees.length === 0) return
    markees.slice(0, 10).forEach(trackView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markees.map(m => m.address).join(',')])

  // Search state
  const [search, setSearch] = useState('')

  // Rank lookup map
  const rankMap = useMemo(() => {
    const m = new Map<string, number>()
    markees.forEach((markee, i) => m.set(markee.address, i + 1))
    return m
  }, [markees])

  // Leaderboard rows = #2+ filtered by search
  const leaderboardMarkees = useMemo(() => {
    const base = markees.slice(1)
    if (!search.trim()) return base
    const s = search.toLowerCase()
    return base.filter(m =>
      m.message.toLowerCase().includes(s) ||
      (m.name || '').toLowerCase().includes(s) ||
      m.address.toLowerCase().includes(s) ||
      m.owner.toLowerCase().includes(s)
    )
  }, [markees, search])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const handleTransactionSuccess = useCallback(() => {
    setTimeout(() => refetch(), 3000)
  }, [refetch])

  const handleCreateNew = useCallback(() => {
    setSelectedMarkee(null)
    setModalMode('create')
    setIsModalOpen(true)
  }, [])

  const handleAddFunds = useCallback((markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('addFunds')
    setIsModalOpen(true)
  }, [])

  const handleEditMessage = useCallback((markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('updateMessage')
    setIsModalOpen(true)
  }, [])

  const handleReact = useCallback(async (markee: Markee, emoji: string) => {
    if (!address) return
    try { await toggleReaction(markee.address, emoji, markee.chainId) }
    catch (err) { console.error('Failed to toggle reaction:', err) }
  }, [address, toggleReaction])

  const handleRemoveReaction = useCallback(async (markee: Markee) => {
    if (!address) return
    try { await removeReaction(markee.address) }
    catch (err) { console.error('Failed to remove reaction:', err) }
  }, [address, removeReaction])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }, [])

  const top = markees[0]

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" useRegularLinks />

      {/* ── Hero — Featured #1 Markee ───────────────────────────────────── */}
      {!isLoading && top && (() => {
        const topViews = views.get(top.address.toLowerCase())?.totalViews
        const hasName = top.name && top.name.trim()

        return (
          <section
            className="relative flex flex-col justify-center overflow-hidden border-b border-[#8A8FBF]/20"
            style={{
              minHeight: 'min(78vh, 720px)',
              padding: 'clamp(48px,8vh,80px) clamp(16px,5vw,80px) 100px',
              background: [
                'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
                'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
                'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
              ].join(', '),
            }}
          >
            {/* Scanlines */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)',
                mixBlendMode: 'overlay' as const,
              }}
            />

            {/* Static star field */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: [
                  'radial-gradient(1.5px 1.5px at 15% 12%, rgba(237,238,255,0.8), transparent)',
                  'radial-gradient(1px 1px at 35% 8%, rgba(237,238,255,0.6), transparent)',
                  'radial-gradient(1.5px 1.5px at 55% 22%, rgba(237,238,255,0.7), transparent)',
                  'radial-gradient(1px 1px at 75% 5%, rgba(237,238,255,0.5), transparent)',
                  'radial-gradient(1.5px 1.5px at 88% 18%, rgba(237,238,255,0.8), transparent)',
                  'radial-gradient(1px 1px at 22% 40%, rgba(237,238,255,0.4), transparent)',
                  'radial-gradient(1.5px 1.5px at 60% 52%, rgba(237,238,255,0.6), transparent)',
                  'radial-gradient(1px 1px at 90% 45%, rgba(237,238,255,0.5), transparent)',
                  'radial-gradient(1px 1px at 42% 70%, rgba(237,238,255,0.3), transparent)',
                  'radial-gradient(1.5px 1.5px at 8% 65%, rgba(237,238,255,0.7), transparent)',
                  'radial-gradient(1px 1px at 70% 78%, rgba(237,238,255,0.4), transparent)',
                  'radial-gradient(1.5px 1.5px at 50% 88%, rgba(237,238,255,0.5), transparent)',
                  'radial-gradient(1px 1px at 28% 92%, rgba(237,238,255,0.3), transparent)',
                  'radial-gradient(1.5px 1.5px at 82% 35%, rgba(237,238,255,0.6), transparent)',
                  'radial-gradient(1px 1px at 64% 60%, rgba(237,238,255,0.4), transparent)',
                ].join(', '),
              }}
            />

            {/* FEATURED MESSAGE label */}
            <div className="relative z-10 flex items-center gap-2.5 mb-6 font-jetbrains text-xs text-[#8A8FBF] tracking-[0.15em] uppercase">
              <span
                className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse"
                style={{ boxShadow: '0 0 12px #F897FE' }}
              />
              <span>FEATURED MESSAGE</span>
              <span className="flex-1 h-px bg-[#8A8FBF]/20 ml-2" />
              {topViews !== undefined && (
                <span className="text-[#7C9CFF]">{topViews.toLocaleString()} views</span>
              )}
            </div>

            {/* Big message in translucent bordered box */}
            <div className="relative z-10 max-w-[1200px]">
              <div
                className="font-jetbrains font-bold leading-[1.05] tracking-[-0.02em] mb-7 inline-block rounded-2xl"
                style={{
                  fontSize: 'clamp(24px, 4vw, 45px)',
                  padding: 'clamp(20px, 3vw, 44px) clamp(22px, 3.5vw, 56px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.04)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span style={{
                  background: 'linear-gradient(120deg, #EDEEFF 0%, #F897FE 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  {top.message}
                </span>
              </div>

              {/* Owner / meta row */}
              <div className="flex items-center gap-4 flex-wrap text-[15px] text-[#B8B6D9]">
                <span className="text-[#8A8FBF]">—</span>
                <span className="text-[#EDEEFF]">{hasName ? top.name : formatAddress(top.owner)}</span>
                {hasName && (
                  <span className="font-jetbrains text-xs text-[#8A8FBF]">{formatAddress(top.owner)}</span>
                )}
                <span className="w-[3px] h-[3px] rounded-full bg-[#8A8FBF]" />
                <span className="font-jetbrains font-semibold text-xs text-[#7C9CFF]">
                  {formatEth(top.totalFundsAdded)} ETH raised
                </span>
              </div>
            </div>

            {/* CTA row */}
            <div className="relative z-10 mt-12 flex items-center gap-3.5 flex-wrap">
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-2.5 font-bold text-base text-[#060A2A] bg-[#F897FE] rounded-lg transition-transform active:scale-[0.98] hover:opacity-90"
                style={{
                  padding: '16px 28px',
                  boxShadow: '0 8px 32px rgba(248,151,254,0.3)',
                }}
              >
                {formatEth(top.totalFundsAdded + 1000000000000000n)} ETH to change message
                <span className="text-lg">→</span>
              </button>
              <a
                href="/how-it-works"
                className="text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-lg text-[15px] hover:bg-[#8A8FBF]/10 transition-colors"
                style={{ padding: '15px 22px' }}
              >
                How it works
              </a>
            </div>
          </section>
        )
      })()}

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <section className="bg-[#0A0F3D] border-b border-[#8A8FBF]/20" style={{ padding: '48px clamp(16px,5vw,40px)' }}>
        <div
          className="max-w-[1200px] mx-auto grid gap-8 items-center"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
        >
          <div>
            <div className="font-jetbrains text-[38px] font-bold leading-none tracking-[-0.03em] text-[#F897FE]">
              {isLoadingEco
                ? <span className="opacity-40">—</span>
                : ecoActive.length}
            </div>
            <div className="mt-1.5 text-[#8A8FBF] text-[13px]">active Markees</div>
          </div>
          <div>
            <div className="font-jetbrains text-[38px] font-bold leading-none tracking-[-0.03em] text-[#EDEEFF]">
              {isLoadingEco
                ? <span className="opacity-40">—</span>
                : ecoMessages.toLocaleString()}
            </div>
            <div className="mt-1.5 text-[#8A8FBF] text-[13px]">messages bought</div>
          </div>
          <div>
            <div className="font-jetbrains text-[38px] font-bold leading-none tracking-[-0.03em] text-[#7C9CFF]">
              {isLoadingEco
                ? <span className="opacity-40">—</span>
                : parseFloat(ecoTotalFunds) < 0.001
                  ? '< 0.001'
                  : parseFloat(ecoTotalFunds).toFixed(3)}
              {!isLoadingEco && <span className="text-2xl ml-1 opacity-60">ETH</span>}
            </div>
            <div className="mt-1.5 text-[#8A8FBF] text-[13px]">total funds raised</div>
          </div>
          <div className="sm:text-right">
            <a
              href="/create-a-markee"
              className="inline-block text-[#F897FE] border border-[#F897FE] rounded-lg font-semibold text-[14px] hover:bg-[#F897FE]/10 transition-colors"
              style={{ padding: '14px 22px' }}
            >
              Create a Markee →
            </a>
          </div>
        </div>
      </section>

      {/* ── Leaderboard ──────────────────────────────────────────────────── */}
      <section
        className="max-w-[1240px] mx-auto"
        style={{ padding: '56px clamp(16px,5vw,40px) 80px' }}
      >
        {/* Title row */}
        <div className="flex items-end justify-between flex-wrap gap-5 mb-5">
          <div>
            <h2 className="m-0 text-[28px] font-bold text-[#EDEEFF] tracking-tight">Top Markees</h2>
            <p className="mt-1 m-0 text-[#8A8FBF] text-[13px]">
              Everyone below can be bumped. Pay to jump the queue.
            </p>
          </div>
          {(isFetchingFresh || reactionsLoading) && (
            <div className="flex items-center gap-2 text-sm text-[#8A8FBF]">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#F897FE]" />
              <span>Updating…</span>
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="flex gap-2.5 mb-[18px]">
          <div className="flex-1 relative flex items-center bg-[#0A0F3D] border border-[#8A8FBF]/20 rounded-lg px-3">
            <Search size={14} className="text-[#8A8FBF] shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search messages, owners, 0x…"
              className="flex-1 bg-transparent border-none text-[#EDEEFF] py-2.5 px-2.5 text-[13px] outline-none placeholder:text-[#8A8FBF]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="bg-transparent border-none text-[#8A8FBF] cursor-pointer text-lg leading-none hover:text-[#EDEEFF] transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Dense table */}
        {isLoading ? (
          <div className="bg-[#0A0F3D] rounded-[10px] border border-[#8A8FBF]/20 h-64 animate-pulse" />
        ) : markees.length > 0 && (
          <div className="bg-[#0A0F3D] rounded-[10px] border border-[#8A8FBF]/20 overflow-x-auto">
            {/* Column header */}
            <div
              className="font-jetbrains font-semibold text-[10px] text-[#8A8FBF] tracking-[0.1em] uppercase bg-[#060A2A] border-b border-[#8A8FBF]/20"
              style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 80px 110px 110px', gap: 14, padding: '10px 14px', minWidth: 640 }}
            >
              <span>RANK</span>
              <span>MESSAGE</span>
              <span />
              <span>VIEWS</span>
              <span>RAISED</span>
              <span style={{ textAlign: 'right' }}>TOP PRICE</span>
            </div>

            {/* Rows */}
            <div style={{ minWidth: 640 }}>
              {leaderboardMarkees.map((markee, i) => {
                const viewData = views.get(markee.address.toLowerCase())
                const hasName = markee.name && markee.name.trim()
                const rank = rankMap.get(markee.address) ?? i + 2
                const viewCount = viewData?.totalViews
                const fmtViews = viewCount === undefined ? '—'
                  : viewCount >= 1_000_000 ? `${(viewCount / 1_000_000).toFixed(1)}M`
                  : viewCount >= 1_000 ? `${(viewCount / 1_000).toFixed(1)}k`
                  : String(viewCount)

                return (
                  <div
                    key={markee.address}
                    onClick={() => handleAddFunds(markee)}
                    className="cursor-pointer border-b border-[#8A8FBF]/20 last:border-0 transition-colors hover:bg-[#F897FE]/[0.04]"
                    style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 80px 110px 110px', gap: 14, padding: '10px 14px', alignItems: 'center' }}
                  >
                    <span className="font-jetbrains text-[12px] text-[#8A8FBF] tabular-nums">#{rank}</span>
                    <div className="min-w-0">
                      <div className="font-jetbrains text-[13px] text-[#EDEEFF] truncate">{markee.message}</div>
                    </div>
                    <span className="text-[11px] text-[#8A8FBF] italic truncate">
                      — {hasName ? markee.name : formatAddress(markee.owner)}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[#8A8FBF]">
                      <Eye size={11} className="opacity-70 shrink-0" />
                      {fmtViews}
                    </span>
                    <span className="font-jetbrains text-[12px] text-[#7C9CFF] tabular-nums text-right">
                      {formatEth(markee.totalFundsAdded)} ETH
                    </span>
                    <span className="font-jetbrains text-[12px] text-[#F897FE] tabular-nums text-right">
                      {formatEth(markee.totalFundsAdded + 1000000000000000n)} ETH
                    </span>
                  </div>
                )
              })}
              {leaderboardMarkees.length === 0 && (
                <div className="py-12 text-center text-[#8A8FBF] text-[13px]">No results for &ldquo;{search}&rdquo;</div>
              )}
            </div>
          </div>
        )}
      </section>

      <Footer />

      <TopDawgModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={handleTransactionSuccess}
        topFundsAdded={markees[0]?.totalFundsAdded}
      />
    </div>
  )
}
