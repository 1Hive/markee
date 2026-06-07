'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { useFixedMarkees } from '@/lib/contracts/useFixedMarkees'
import { useReactions } from '@/hooks/useReactions'
import { useViews } from '@/hooks/useViews'
import { useFixedViews } from '@/hooks/useFixedViews'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { FixedPriceModal } from '@/components/modals/FixedPriceModal'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { V13_LEADERBOARDS } from '@/lib/contracts/addresses'
import { Eye } from 'lucide-react'
import { formatEther } from 'viem'

const fmtViews = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function MetricStat({ n, label, color, dot }: { n: string; label: string; color: string; dot: string }) {
  return (
    <div className="metric-cell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="metric-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="metric-dot" style={{ width: 9, height: 9, borderRadius: 99, background: dot, boxShadow: `0 0 12px ${dot}`, flexShrink: 0, display: 'inline-block' }} />
        <span className="metric-num" style={{ fontSize: 34, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      </span>
      <span className="metric-label" style={{ fontSize: 13, color: '#8A8FBF', marginLeft: 17 }}>{label}</span>
    </div>
  )
}

function RevnetWidget() {
  const [amount, setAmount] = useState('0.1')
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const rate = 4200
  const eth = parseFloat(amount) || 0
  const receive = Math.round(eth * rate)
  return (
    <div className="bg-[#0A0F3D] border border-[#8A8FBF]/20 rounded-[16px] p-4 shadow-[0_18px_50px_rgba(6,10,42,0.5)]">
      <label className="block font-mono text-[10px] tracking-[1.5px] uppercase text-[#8A8FBF] mb-2 mt-[2px]">You pay</label>
      <div className="flex items-center gap-2 bg-[#060A2A] border border-[#8A8FBF]/20 rounded-[11px] px-[14px]">
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" aria-label="ETH amount"
          className="flex-1 min-w-0 bg-transparent border-none text-[#EDEEFF] font-mono text-[22px] font-bold py-[14px] outline-none tracking-[-0.5px]" />
        <span className="font-mono text-[14px] font-bold text-[#B8B6D9]">ETH</span>
      </div>
      <div className="flex items-center justify-between px-1 pt-[14px]">
        <span className="text-[#8A8FBF] text-[13px]">You receive</span>
        <span className="text-[#F897FE] font-extrabold font-mono text-[18px] tracking-[-0.3px]">{receive.toLocaleString()} MARKEE</span>
      </div>
      <div className="flex items-center justify-between mt-[14px] pt-[14px] border-t border-[#8A8FBF]/20 font-mono text-[12px]">
        <button onClick={() => setExpanded(v => !v)}
          className="bg-transparent border-none cursor-pointer font-mono text-[12px] inline-flex items-center gap-[6px] p-0"
          style={{ color: expanded ? '#F897FE' : '#B8B6D9' }}>
          <span className="text-[14px] leading-none">{expanded ? '−' : '+'}</span> Add a message
        </button>
      </div>
      {expanded && (
        <div className="mt-3">
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Set a message with your payment."
            className="w-full resize-none bg-[#060A2A] border border-[#8A8FBF]/20 rounded-[11px] px-[14px] py-[11px] text-[#EDEEFF] font-sans text-[14px] outline-none leading-[1.4] box-border" />
        </div>
      )}
      <a href="https://revnet.app/base/markee" target="_blank" rel="noopener noreferrer"
        className="w-full mt-[14px] bg-[#F897FE] text-[#060A2A] border-none rounded-[10px] py-[15px] px-5 font-sans font-bold text-[15px] cursor-pointer shadow-[0_8px_32px_rgba(248,151,254,0.3)] flex items-center justify-center gap-2 no-underline transition-[transform,box-shadow] duration-[120ms] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px]">
        Buy MARKEE ↗
      </a>
    </div>
  )
}

import { formatDistanceToNow } from 'date-fns'
import { NETWORK_PAUSED } from '@/lib/paused'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd, formatEth } from '@/lib/utils'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

export default function Home() {
  const { address } = useAccount()
  const ethPrice = useEthPrice()

  const { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch } = useMarkees()
  const { markees: fixedMarkees, isLoading: isLoadingFixed } = useFixedMarkees()

  // Ecosystem stats (same source as /ecosystem page)
  const [ecoLeaderboards, setEcoLeaderboards] = useState<{ topFundsAddedRaw: string; markeeCount: number; isLegacy?: boolean; platform?: string; totalFundsRaw?: string }[]>([])
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

  const {
    reactions,
    toggleReaction,
    removeReaction,
    isLoading: reactionsLoading,
    error: reactionsError,
  } = useReactions()

  // ── Leaderboard view tracking ────────────────────────────────────────────────
  const { views, trackView } = useViews(markees)

  useEffect(() => {
    if (markees.length === 0) return
    markees.slice(0, 10).forEach(trackView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markees.map(m => m.address).join(',')])

  // ── Hero readerboard view tracking ──────────────────────────────────────────
  const { views: fixedViews, trackView: trackFixedView } = useFixedViews(fixedMarkees)

  useEffect(() => {
    if (fixedMarkees.length === 0) return
    fixedMarkees.forEach(trackFixedView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedMarkees.map(m => m.strategyAddress).join(',')])
  // ────────────────────────────────────────────────────────────────────────────

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false)
  const [selectedFixedMarkee, setSelectedFixedMarkee] = useState<FixedMarkee | null>(null)

  const handleTransactionSuccess = useCallback(() => {
    setTimeout(() => {
      refetch()
    }, 3000)
  }, [refetch])

  const handleCreateNew = useCallback(() => {
    if (NETWORK_PAUSED) return
    setSelectedMarkee(null)
    setModalMode('create')
    setIsModalOpen(true)
  }, [])

  const handleEditMessage = useCallback((markee: Markee) => {
    if (NETWORK_PAUSED) return
    setSelectedMarkee(markee)
    setModalMode('updateMessage')
    setIsModalOpen(true)
  }, [])

  const handleAddFunds = useCallback((markee: Markee) => {
    if (NETWORK_PAUSED) return
    setSelectedMarkee(markee)
    setModalMode('addFunds')
    setIsModalOpen(true)
  }, [])

  const handleReact = useCallback(
    async (markee: Markee, emoji: string) => {
      if (!address) return
      try {
        await toggleReaction(markee.address, emoji, markee.chainId)
      } catch (err) {
        console.error('Failed to toggle reaction:', err)
      }
    },
    [address, toggleReaction]
  )

  const handleRemoveReaction = useCallback(
    async (markee: Markee) => {
      if (!address) return
      try {
        await removeReaction(markee.address)
      } catch (err) {
        console.error('Failed to remove reaction:', err)
      }
    },
    [address, removeReaction]
  )

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }, [])

  const handleFixedMarkeeClick = useCallback((fixedMarkee: FixedMarkee) => {
    if (NETWORK_PAUSED) return
    setSelectedFixedMarkee(fixedMarkee)
    setIsFixedModalOpen(true)
  }, [])

  const handleFixedModalClose = useCallback(() => {
    setIsFixedModalOpen(false)
    setSelectedFixedMarkee(null)
  }, [])

  // Helper to get view counts for a leaderboard markee
  const getViews = (markee: Markee) => {
    const v = views.get(markee.address.toLowerCase())
    return {
      totalViews: v?.totalViews,
      messageViews: v?.messageViews,
    }
  }

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" useRegularLinks />

      {/* Hero */}
      <section className="relative py-24 border-b border-[#8A8FBF]/20 overflow-hidden">
        <HeroBackground />

        <div className="relative z-10 px-4 sm:px-6 lg:px-8">
          <div className="signs-grid">
            {isLoadingFixed ? (
              [1, 2, 3].map(i => (
                <div key={i} className="reader-card animate-pulse">
                  <div className="h-10 bg-[#8A8FBF]/20 rounded w-3/4" />
                </div>
              ))
            ) : (
              fixedMarkees.map((fixedMarkee, index) => {
                const viewData = fixedViews.get(fixedMarkee.strategyAddress.toLowerCase())
                return (
                  <button
                    key={index}
                    onClick={() => handleFixedMarkeeClick(fixedMarkee)}
                    className="reader-card"
                  >
                    {viewData && viewData.totalViews > 0 && (
                      <span className="reader-views">
                        <Eye style={{ width: 11, height: 11 }} />
                        {fmtViews(viewData.totalViews)}
                      </span>
                    )}
                    <span className="reader-text">{fixedMarkee.message || fixedMarkee.name}</span>
                    <div className="reader-pill">
                      {fixedMarkee.priceWei && fixedMarkee.priceWei !== '0'
                        ? ethPrice
                          ? `${formatUsd(parseFloat(formatEther(BigInt(fixedMarkee.priceWei))) * ethPrice)} to change`
                          : `${formatEther(BigInt(fixedMarkee.priceWei))} ETH to change`
                        : 'Change message'}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </section>

      {/* Pay to be seen */}
      <section className="metrics-section bg-[#0A0F3D] py-16 border-b border-[#8A8FBF]/20">
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 40px' }}>
          <h1 className="text-center mb-9" style={{ fontSize: 'clamp(36px,5.5vw,60px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, color: '#EDEEFF' }}>
            Pay to be <span style={{ color: '#F897FE' }}>seen</span>
          </h1>
          <div className="metrics-row">
            <MetricStat
              n={isLoadingEco ? '--' : ecoLeaderboards.length.toLocaleString()}
              label="domains"
              color="#7B6AF4"
              dot="#7B6AF4"
            />
            <MetricStat
              n={isLoadingEco ? '--' : ecoActive.length.toLocaleString()}
              label="active Markees"
              color="#F897FE"
              dot="#F897FE"
            />
            <MetricStat
              n={isLoadingEco ? '--' : ecoMessages.toLocaleString()}
              label="messages bought"
              color="#EDEEFF"
              dot="#EDEEFF"
            />
            <MetricStat
              n={isLoadingEco || !ethPrice ? '--' : formatUsd(parseFloat(ecoTotalFunds) * ethPrice)}
              label="total funds raised"
              color="#1DB227"
              dot="#1DB227"
            />
            <MetricStat
              n={(() => { const t = Array.from(views.values()).reduce((s, v) => s + (v.totalViews || 0), 0); return t > 0 ? fmtViews(t) : '--' })()}
              label="views"
              color="#7C9CFF"
              dot="#7C9CFF"
            />
          </div>
        </div>
      </section>

      {/* Marketplace teaser */}
      <section className="bg-[#060A2A] py-[88px] px-4 sm:px-[40px]">
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {/* Section head */}
          <div className="flex items-end justify-between gap-6 mb-7 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-[14px]">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0 inline-block" />
                Marketplace
              </div>
              <h2 className="m-0 text-[clamp(26px,3.4vw,38px)] font-extrabold tracking-[-0.6px] text-[#EDEEFF]">Buy a message anywhere on the network</h2>
              <p className="mt-[10px] text-[#B8B6D9] text-base max-w-[52ch]">Find your audience on Markee's global network, buy a message, and see it live instantly.</p>
            </div>
          </div>
          {/* Column headers */}
          {!isLoading && markees.length > 0 && (
            <div className="grid gap-4 px-[14px] pb-[10px] font-mono text-[10px] tracking-[1px] text-[#8A8FBF] uppercase hidden md:grid" style={{ gridTemplateColumns: '190px 110px 1fr 74px 120px' }}>
              <span>Served on</span><span>Total raised</span><span>Current Message</span><span>Views</span><span className="text-right">Price to change</span>
            </div>
          )}
          {/* Dense rows */}
          <div className="bg-[#0A0F3D] rounded-[10px] border border-[#8A8FBF]/20 overflow-hidden">
            {isLoading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="h-16 border-b border-[#8A8FBF]/20 last:border-0 animate-pulse bg-[#8A8FBF]/5" />
              ))
            ) : (
              markees.slice(0, 5).map((markee, i) => {
                const v = views.get(markee.address.toLowerCase())
                return (
                  <Link key={markee.address} href={`/markee/${markee.address}`}
                    className="grid gap-4 px-[14px] py-[13px] border-b border-[#8A8FBF]/20 last:border-0 items-center hover:bg-[#8A8FBF]/5 transition-colors"
                    style={{ gridTemplateColumns: '1fr' }}
                  >
                    {/* Mobile: stacked */}
                    <div className="flex flex-col gap-1 md:hidden">
                      <span className="font-mono text-[13px] text-[#EDEEFF] line-clamp-2">{markee.message || '—'}</span>
                      <div className="flex items-center gap-3 text-[11px] text-[#8A8FBF]">
                        <span>{formatEth(markee.totalFundsAdded)} ETH</span>
                        {v?.totalViews ? <span>{fmtViews(v.totalViews)} views</span> : null}
                      </div>
                    </div>
                    {/* Desktop: columnar */}
                    <div className="hidden md:grid gap-4 items-center" style={{ gridTemplateColumns: '190px 110px 1fr 74px 120px' }}>
                      <span className="font-mono text-[12.5px] text-[#B8B6D9] truncate">{(markee as any).name || (markee.address.slice(0,6) + '...' + markee.address.slice(-4))}</span>
                      <span className="font-mono text-[12.5px] text-[#7C9CFF] font-semibold">{formatEth(markee.totalFundsAdded)} ETH</span>
                      <span className="font-mono text-[13px] text-[#EDEEFF] truncate">{markee.message || '—'}</span>
                      <span className="font-mono text-[12px] text-[#8A8FBF]">{v?.totalViews ? fmtViews(v.totalViews) : '—'}</span>
                      <span className="font-mono text-[12px] text-[#B8B6D9] text-right truncate">{formatEth(markee.totalFundsAdded)} ETH</span>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
          {/* CTA */}
          <div className="text-center mt-7">
            <Link href="/ecosystem"
              className="inline-flex items-center gap-2 bg-transparent text-[#F897FE] border border-[#F897FE] rounded-lg px-6 py-[13px] font-bold text-[15px] transition-[background,color] duration-[140ms] hover:bg-[#F897FE] hover:text-[#060A2A]">
              View the Marketplace →
            </Link>
          </div>
        </div>
      </section>

      {/* Raise Funding teaser */}
      <section className="bg-[#0A0F3D] py-[88px] px-4 sm:px-[40px] border-t border-[#8A8FBF]/20">
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="flex items-end justify-between gap-6 mb-7 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-[14px]">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0 inline-block" />
                Raise Funding
              </div>
              <h2 className="m-0 text-[clamp(26px,3.4vw,38px)] font-extrabold tracking-[-0.6px] text-[#EDEEFF]">Create a Markee and start earning</h2>
              <p className="mt-[10px] text-[#B8B6D9] text-base max-w-[52ch]">Add a Markee to your website or open source repo in just a few clicks.</p>
            </div>
          </div>
          <div className="plat-grid-home">
            {[
              { key: 'website', name: 'Website', blurb: 'Any site you own', icon: 'globe', color: '#F897FE', href: '/create-a-markee?platform=website' },
              { key: 'github', name: 'GitHub Repo', blurb: 'README, docs, any markdown', icon: 'github', color: '#EDEEFF', href: '/create-a-markee?platform=github' },
              { key: 'superfluid', name: 'Superfluid Project', blurb: 'Earn SUP incentives', icon: 'zap', color: '#1DB227', href: '/create-a-markee?platform=superfluid' },
            ].map((p) => (
              <Link key={p.key} href={p.href}
                className="flex flex-col gap-[18px] no-underline rounded-[14px] p-[22px] border border-[#8A8FBF]/20 bg-[rgba(6,10,42,0.5)] transition-[border-color,transform] duration-[160ms] hover:border-[rgba(248,151,254,0.35)] hover:-translate-y-[2px]">
                <div className="flex items-start gap-3">
                  <span className="w-12 h-12 rounded-[12px] bg-[#060A2A] border border-[#8A8FBF]/20 flex items-center justify-center flex-shrink-0">
                    {p.icon === 'globe' && <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                    {p.icon === 'github' && <svg width="26" height="26" viewBox="0 0 24 24" fill={p.color}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>}
                    {p.icon === 'zap' && <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#EDEEFF] font-bold text-[15px] leading-[1.25]">{p.name}</div>
                    <div className="text-[#8A8FBF] text-[12.5px] mt-[3px]">{p.blurb}</div>
                  </div>
                </div>
                <div className="flex gap-[22px] border-t border-[#8A8FBF]/20 pt-4">
                  <div>
                    <div className="text-[#EDEEFF] font-bold font-mono text-[16px]">{ecoLeaderboards.filter(lb => lb.isLegacy ? lb.platform === p.key || (p.key === 'website' && !lb.platform) : true).length}</div>
                    <div className="text-[#8A8FBF] text-[11px]">Markees</div>
                  </div>
                  <div>
                    <div className="text-[#7C9CFF] font-bold font-mono text-[16px]">{isLoadingEco ? '...' : (() => { const eth = ecoLeaderboards.reduce((s, lb) => s + parseFloat(lb.totalFundsRaw || '0'), 0); return ethPrice ? formatUsd(eth * ethPrice) : (eth.toFixed(2) + ' ETH') })()}</div>
                    <div className="text-[#8A8FBF] text-[11px]">raised</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-7">
            <Link href="/create-a-markee"
              className="inline-flex items-center gap-[10px] bg-[#F897FE] text-[#060A2A] border-0 rounded-lg px-[26px] py-[14px] font-sans font-bold text-[15px] cursor-pointer shadow-[0_8px_32px_rgba(248,151,254,0.3)] no-underline transition-[transform,box-shadow] duration-[120ms] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px]">
              Create a Markee →
            </Link>
          </div>
        </div>
      </section>

      {/* Own the Network */}
      <section className="relative overflow-hidden bg-[#060A2A] py-[96px] px-4 sm:px-[40px] border-t border-[#8A8FBF]/20">
        <div className="starfield-bg" />
        <div className="relative z-10 max-w-[760px] mx-auto text-center">
          <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-[18px]">
            <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0 inline-block" />
            Own the Network
          </div>
          <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-extrabold tracking-[-1px] text-[#EDEEFF] leading-[1.05]">
            Markee is cooperatively owned
          </h2>
          <p className="mt-5 mx-auto text-[#B8B6D9] text-[17px] max-w-[54ch] leading-[1.6]">
            We're digital-native, owned and governed on the Ethereum network. 100% owned by MARKEE holders, enforced onchain via Revnets and Gardens.
          </p>
          {/* RevnetWidget */}
          <div className="w-full max-w-[440px] mx-auto my-9 text-left">
            <RevnetWidget />
          </div>
          <div className="flex justify-center">
            <Link href="/owners"
              className="bg-transparent text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-lg px-[22px] py-[13px] font-sans text-[15px] no-underline inline-flex items-center gap-2 transition-[border-color,color] duration-[160ms] hover:border-[rgba(248,151,254,0.35)] hover:text-[#EDEEFF]">
              How ownership works →
            </Link>
          </div>
        </div>
      </section>

      <Footer />

      <TopDawgModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={handleTransactionSuccess}
        strategyAddress={selectedMarkee
          ? selectedMarkee.pricingStrategy as `0x${string}`
          : V13_LEADERBOARDS.COOPERATIVE}
        topFundsAdded={markees[0]?.totalFundsAdded}
      />

      <FixedPriceModal
        isOpen={isFixedModalOpen}
        onClose={handleFixedModalClose}
        fixedMarkee={selectedFixedMarkee}
        onSuccess={handleTransactionSuccess}
      />
    </div>
  )
}
