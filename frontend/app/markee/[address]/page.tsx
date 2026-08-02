'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { formatEther } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { ExpandableMarkeeRow } from '@/components/leaderboard/ExpandableMarkeeRow'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { formatUsd } from '@/lib/utils'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useLeaderboardDetail } from '@/lib/contracts/useLeaderboardDetail'
import type { LeaderboardMarkee } from '@/lib/contracts/useLeaderboardDetail'
import { StreamingBoardDetail } from '@/components/StreamingBoardDetail'
import {
  MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER, BOARD_LB_COLS, HERO_GRAD,
  fmtAddr, useServedOn, MetricsBar, MetricValue, FeaturedCard, EmbedPanel, BoardDetailSkeleton,
} from '@/components/board-detail/shared'

function priceToOvertake(topFunds: bigint) {
  return topFunds + BigInt('1000000000000000')
}

// ── Main page ─────────────────────────────────────────────────────────────────
function FixedMarkeeDetail({ leaderboardAddress }: { leaderboardAddress: string }) {
  const ethPrice = useEthPrice()
  const { address: connectedAddress } = useAccount()

  const { meta, markees: allMarkees, isLoading, refetch: refetchLeaderboard } = useLeaderboardDetail(leaderboardAddress)
  const markees = allMarkees.filter(m => m.totalFundsAdded > 0n)
  const ecoEntry = useServedOn(leaderboardAddress)

  // Views for all markees
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (!markees.length) return
    const addrs = markees.map(m => m.address.toLowerCase()).join(',')
    fetch(`/api/views?addresses=${addrs}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const map = new Map<string, number>()
        for (const [k, v] of Object.entries(data as Record<string, { totalViews: number }>)) {
          map.set(k.toLowerCase(), v.totalViews)
        }
        setViewsMap(map)
      })
      .catch(() => {})
  }, [markees.map(m => m.address).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  // Track + increment view for top markee
  useEffect(() => {
    const top = markees[0]
    if (!top?.message) return
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: top.address, message: top.message }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.totalViews !== undefined) setViewsMap(m => new Map(m).set(top.address.toLowerCase(), data.totalViews)) })
      .catch(() => {})
  }, [markees[0]?.address, !!markees[0]?.message])  // eslint-disable-line react-hooks/exhaustive-deps

  // Modal state
  const [buyOpen,      setBuyOpen]      = useState(false)
  const [addFundsOpen, setAddFundsOpen] = useState(false)
  const [editOpen,     setEditOpen]     = useState(false)
  const [modalTarget,  setModalTarget]  = useState<LeaderboardMarkee | null>(null)
  const [embedOpen,    setEmbedOpen]    = useState(false)
  const [syncStatus,    setSyncStatus]    = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [syncResult,    setSyncResult]    = useState<string | null>(null)
  const [trafficStatus, setTrafficStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [ghTraffic,     setGhTraffic]     = useState<{ count: number; uniques: number } | null>(null)

  // Auto-open embed panel when returning from GitHub OAuth with ?embed=1
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.has('embed')) {
      setEmbedOpen(true)
      const clean = new URL(window.location.href)
      clean.searchParams.delete('embed')
      window.history.replaceState(null, '', clean.toString())
    }
  }, [])

  const openBuy = useCallback(() => setBuyOpen(true), [])
  const openAddFunds = useCallback((m: LeaderboardMarkee) => { setModalTarget(m); setAddFundsOpen(true) }, [])
  const openEdit = useCallback((m: LeaderboardMarkee) => { setModalTarget(m); setEditOpen(true) }, [])
  const refreshAfterTransaction = useCallback(() => {
    void refetchLeaderboard()
  }, [refetchLeaderboard])
  const handleBuySuccess = useCallback(() => {
    refreshAfterTransaction()
    setBuyOpen(false)
  }, [refreshAfterTransaction])
  const handleAddFundsSuccess = useCallback(() => {
    refreshAfterTransaction()
    setAddFundsOpen(false)
    setModalTarget(null)
  }, [refreshAfterTransaction])
  const handleEditSuccess = useCallback(() => {
    refreshAfterTransaction()
    setEditOpen(false)
    setModalTarget(null)
  }, [refreshAfterTransaction])

  const handleSync = useCallback(async () => {
    setSyncStatus('loading')
    setSyncResult(null)
    try {
      const res = await fetch('/api/github/update-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress }),
      })
      const data = await res.json().catch(() => ({})) as {
        success?: boolean; error?: string
        results?: Array<{ success: boolean; error?: string; filePath?: string }>
      }
      if (res.ok && data.success) {
        const ok   = data.results?.filter(r => r.success).length ?? 1
        const fail = data.results?.filter(r => !r.success).length ?? 0
        setSyncStatus('success')
        setSyncResult(fail > 0 ? `Updated ${ok}, ${fail} failed` : `Updated ${ok} file${ok !== 1 ? 's' : ''}`)
      } else {
        setSyncStatus('error')
        const firstResultErr = data.results?.find(r => !r.success)?.error
        const raw = data.error ?? firstResultErr ?? 'Sync failed'
        setSyncResult(raw.toLowerCase().includes('delimiter')
          ? `Delimiters missing — add the snippet from the Embed panel to your file first`
          : raw)
      }
    } catch {
      setSyncStatus('error')
      setSyncResult('Network error')
    }
  }, [leaderboardAddress])

  const topMarkeeAddrRef = useRef<string>('')

  const handleRefreshTraffic = useCallback(async () => {
    setTrafficStatus('loading')
    try {
      const res = await fetch(`/api/github/traffic?address=${leaderboardAddress.toLowerCase()}`)
      const data = await res.json().catch(() => ({})) as { count?: number; uniques?: number; error?: string; syncedViews?: number }
      if (res.ok && data.count !== undefined) {
        setGhTraffic({ count: data.count, uniques: data.uniques ?? 0 })
        setTrafficStatus('success')
        if (data.syncedViews !== undefined && topMarkeeAddrRef.current) {
          setViewsMap(m => new Map(m).set(topMarkeeAddrRef.current, data.syncedViews!))
        }
      } else {
        setTrafficStatus('error')
      }
    } catch {
      setTrafficStatus('error')
    }
  }, [leaderboardAddress])

  const topMarkee  = markees[0] ?? null
  topMarkeeAddrRef.current = topMarkee?.address?.toLowerCase() ?? ''
  const topViews   = topMarkee ? (viewsMap.get(topMarkee.address.toLowerCase()) ?? 0) : 0
  const totalFunds = meta?.totalLeaderboardFunds ?? 0n

  const totalFundsEth   = parseFloat(formatEther(totalFunds))
  const totalFundsLabel = ethPrice ? formatUsd(totalFundsEth * ethPrice) : `${totalFundsEth.toFixed(3)} ETH`
  const topPriceEth     = topMarkee ? parseFloat(formatEther(priceToOvertake(topMarkee.totalFundsAdded))) : 0
  const topPriceLabel   = ethPrice ? formatUsd(topPriceEth * ethPrice) : `${topPriceEth.toFixed(3)} ETH`

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="marketplace" useRegularLinks />

      {isLoading ? (
        <BoardDetailSkeleton />
      ) : !meta ? (
        // Truly not found
        <section style={{ maxWidth: 700, margin: '0 auto', padding: '120px 40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>Leaderboard not found</h1>
          <p style={{ color: TEXT2, fontSize: 16, margin: '14px 0 30px' }}>We couldn't find a Markee leaderboard at that address.</p>
          <a href="/marketplace" style={{ display: 'inline-block', background: PINK, color: BG, fontWeight: 700, padding: '12px 22px', borderRadius: 10, textDecoration: 'none', fontFamily: MONO, fontSize: 14 }}>← Back to Marketplace</a>
        </section>
      ) : !topMarkee ? (
        // Leaderboard exists but no messages yet
        <section style={{ maxWidth: 700, margin: '0 auto', padding: '120px 40px', textAlign: 'center' }}>
          {meta.leaderboardName && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>{meta.leaderboardName}</div>
          )}
          <h1 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>No messages yet</h1>
          <p style={{ color: TEXT2, fontSize: 16, margin: '14px 0 30px' }}>Be the first to buy a message and take the top spot.</p>
          <button
            onClick={openBuy}
            style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '13px 26px', fontWeight: 700, fontSize: 15, fontFamily: MONO, cursor: 'pointer', boxShadow: '0 4px 18px rgba(248,151,254,0.3)' }}
          >
            Buy First Message
          </button>
          <div style={{ marginTop: 20 }}>
            <a href="/marketplace" style={{ color: MUTED, fontSize: 14, textDecoration: 'none', fontFamily: MONO }}>← Back to Marketplace</a>
          </div>
        </section>
      ) : (
        <>
          {/* ── Hero ── */}
          <section style={{ position: 'relative', zIndex: 2, borderBottom: `1px solid ${BORDER}`, background: HERO_GRAD, padding: '44px 40px 30px', overflow: 'hidden' }}>
            <HeroBackground />
            {/* scanlines */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'overlay' }} />

            <FeaturedCard
              markeeAddress={topMarkee.address}
              message={topMarkee.message || 'No message yet'}
              displayName={topMarkee.name || undefined}
              ownerAddress={topMarkee.owner}
              views={topViews}
              pillLabel={`${topPriceLabel} to change`}
              onClick={openBuy}
            />
            <div style={{ height: 28 }} />
            <MetricsBar
              address={leaderboardAddress}
              entry={ecoEntry}
              topViews={topViews}
              markeeCount={markees.length}
              totalLabel="Total funds added"
              totalNode={<MetricValue text={totalFundsLabel} color={GREEN} />}
            />
          </section>

          {/* ── Action bar ── */}
          <section style={{ padding: '16px 40px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
              <button
                onClick={() => setEmbedOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
                  fontFamily: MONO, fontSize: 13, color: TEXT2,
                  transition: 'border-color 140ms, color 140ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                </svg>
                Embed this Markee
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: embedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', marginLeft: 2 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {ecoEntry?.platform === 'github' && (
                <>
                  <button
                    onClick={handleSync}
                    disabled={syncStatus === 'loading'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'transparent', border: `1px solid rgba(248,151,254,0.4)`,
                      borderRadius: 9, padding: '9px 16px', cursor: syncStatus === 'loading' ? 'wait' : 'pointer',
                      fontFamily: MONO, fontSize: 13, color: PINK,
                      opacity: syncStatus === 'loading' ? 0.6 : 1, transition: 'opacity 140ms',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    {syncStatus === 'loading' ? 'Syncing…' : 'Sync Message'}
                  </button>
                  {syncResult && (
                    <span style={{ fontFamily: MONO, fontSize: 12, color: syncStatus === 'success' ? GREEN : 'rgba(255,100,120,0.9)' }}>
                      {syncResult}
                    </span>
                  )}

                  <button
                    onClick={handleRefreshTraffic}
                    disabled={trafficStatus === 'loading'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'transparent', border: `1px solid ${BORDER}`,
                      borderRadius: 9, padding: '9px 16px', cursor: trafficStatus === 'loading' ? 'wait' : 'pointer',
                      fontFamily: MONO, fontSize: 13, color: TEXT2,
                      opacity: trafficStatus === 'loading' ? 0.6 : 1, transition: 'opacity 140ms, border-color 140ms, color 140ms',
                    }}
                    onMouseEnter={e => { if (trafficStatus !== 'loading') { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    {trafficStatus === 'loading' ? 'Fetching…' : 'Refresh Traffic'}
                  </button>
                  {trafficStatus === 'success' && ghTraffic && (
                    <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT2 }}>
                      <span style={{ color: BLUE, fontWeight: 700 }}>{ghTraffic.count.toLocaleString()}</span>
                      {' views · '}
                      <span style={{ color: MUTED }}>{ghTraffic.uniques.toLocaleString()} unique</span>
                    </span>
                  )}
                  {trafficStatus === 'error' && (
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,100,120,0.9)' }}>
                      Failed — check GitHub connection
                    </span>
                  )}
                </>
              )}

            </div>
            {embedOpen && (
              <div style={{ maxWidth: 1100, margin: '14px auto 0' }}>
                <EmbedPanel address={leaderboardAddress} name={meta.leaderboardName} platform={ecoEntry?.platform} />
              </div>
            )}
          </section>

          {/* ── Leaderboard table ── */}
          <section style={{ padding: '8px 40px 20px' }}>
            <div style={{ maxWidth: 1100, margin: '40px auto 0' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: -0.6, color: TEXT }}>Leaderboard</h2>
              <p style={{ margin: '0 0 20px', color: TEXT2, fontSize: 15 }}>The message with the most funds added takes the top spot.</p>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ minWidth: 760, background: BG2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: BOARD_LB_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center', borderLeft: '3px solid transparent' }}>
                    {['', 'Bought by', 'Funds added', 'Current message', 'Views', ''].map((h, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{h}</span>
                    ))}
                  </div>
                  {markees.map((m, i) => (
                    <ExpandableMarkeeRow
                      key={m.address}
                      markee={{
                        address: m.address,
                        message: m.message,
                        name: m.name || fmtAddr(m.owner),
                        owner: m.owner,
                        totalFundsAdded: m.totalFundsAdded,
                      }}
                      rank={i + 1}
                      featured={i === 0}
                      formatFunds={(wei) => {
                        const fundsEth = parseFloat(formatEther(wei))
                        return ethPrice ? formatUsd(fundsEth * ethPrice) : `${fundsEth.toFixed(3)} ETH`
                      }}
                      leaderboardAddress={leaderboardAddress as `0x${string}`}
                      viewCount={viewsMap.get(m.address.toLowerCase()) ?? 0}
                      onAddFunds={() => openAddFunds(m)}
                      actionLabel="Add Funds"
                      onEditMessage={!!connectedAddress && m.owner.toLowerCase() === connectedAddress.toLowerCase() ? () => openEdit(m) : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Bottom CTAs ── */}
          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 40px 96px', display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={openBuy}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '13px 24px', fontWeight: 700, fontSize: 15, fontFamily: MONO, cursor: 'pointer', letterSpacing: 0.3, transition: 'transform 120ms, box-shadow 120ms', boxShadow: '0 4px 18px rgba(248,151,254,0.3)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(248,151,254,0.45)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 18px rgba(248,151,254,0.3)' }}
            >
              Buy a New Message
            </button>
            <a
              href="/create-a-markee"
              style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '13px 24px', fontWeight: 600, fontSize: 15, fontFamily: MONO, textDecoration: 'none', letterSpacing: 0.3, transition: 'border-color 120ms, color 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
            >
              Create Your Own Markee
            </a>
          </section>
        </>
      )}

      <Footer />

      {/* Buy modal — works even when leaderboard is empty */}
      {meta && (
        <BuyMessageModal
          isOpen={buyOpen}
          onClose={() => setBuyOpen(false)}
          onSuccess={handleBuySuccess}
          initialMode="create"
          strategyAddress={leaderboardAddress as `0x${string}`}
          topFundsAdded={topMarkee?.totalFundsAdded ?? 0n}
        />
      )}

      {/* Add Funds modal */}
      {modalTarget && (
        <BuyMessageModal
          isOpen={addFundsOpen}
          onClose={() => { setAddFundsOpen(false); setModalTarget(null) }}
          onSuccess={handleAddFundsSuccess}
          userMarkee={modalTarget as any}
          initialMode="addFunds"
          strategyAddress={modalTarget.pricingStrategy as `0x${string}`}
          topFundsAdded={topMarkee?.totalFundsAdded ?? 0n}
        />
      )}

      {/* Edit modal */}
      {modalTarget && (
        <BuyMessageModal
          isOpen={editOpen}
          onClose={() => { setEditOpen(false); setModalTarget(null) }}
          onSuccess={handleEditSuccess}
          userMarkee={modalTarget as any}
          initialMode="updateMessage"
          strategyAddress={modalTarget.pricingStrategy as `0x${string}`}
        />
      )}

    </div>
  )
}

// A board's VERSION discriminates the strategy: streaming boards report "streaming-*", fixed report "1.3.0".
const VERSION_ABI = [
  { inputs: [], name: 'VERSION', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

// One board-detail route for every board. Detect the pricing strategy on-chain and render the matching
// detail; while VERSION loads we default to the (common) fixed detail, which shows its own skeletons.
export default function MarkeeDetailPage() {
  const params = useParams()
  const leaderboardAddress = params.address as string
  const { data: version } = useReadContract({
    address: leaderboardAddress as `0x${string}`,
    abi: VERSION_ABI,
    functionName: 'VERSION',
    chainId: CANONICAL_CHAIN_ID,
    query: { enabled: /^0x[0-9a-fA-F]{40}$/.test(leaderboardAddress ?? '') },
  })

  if (typeof version === 'string' && version.startsWith('streaming')) {
    return <StreamingBoardDetail board={leaderboardAddress as `0x${string}`} />
  }
  return <FixedMarkeeDetail leaderboardAddress={leaderboardAddress} />
}
