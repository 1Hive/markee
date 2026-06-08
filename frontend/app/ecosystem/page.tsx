'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Globe2, Github, Zap } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  topMarkeeAddress?: string | null
  status?: 'pending' | 'verified'
  isLegacy?: boolean
  isCooperative?: boolean
  percentToBeneficiary?: number
  slug?: string
  repoAvatarUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
  repoVerified?: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtCompact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setNarrow(mq.matches)
    const handler = () => setNarrow(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return narrow
}

function useCountUp(target: number, started: boolean, duration = 1600) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!started) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVal(target); return }
    const t0 = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, target, duration])
  return val
}

function rowHref(lb: EcosystemLeaderboard): string {
  if (lb.platform === 'superfluid') return `/ecosystem/platforms/superfluid/${lb.address}`
  if (lb.platform === 'github') return `/ecosystem/platforms/github/${lb.address}`
  return `/ecosystem/website/${lb.address}`
}

function isVerified(lb: EcosystemLeaderboard): boolean {
  if (lb.platform === 'github') return lb.repoVerified === true
  return lb.status === 'verified'
}

function servedOnDisplay(lb: EcosystemLeaderboard): string {
  if (lb.platform === 'website') {
    const url = lb.verifiedUrl ?? lb.siteUrl
    return url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : lb.name
  }
  if (lb.platform === 'github') return lb.repoFullName ?? lb.name
  // superfluid: prefer verifiedUrl domain, fall back to name
  const url = lb.verifiedUrl
  return url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : lb.name
}

function logoSrc(lb: EcosystemLeaderboard): string | null {
  if (lb.logoUrl) return lb.logoUrl
  if (lb.repoAvatarUrl) return lb.repoAvatarUrl
  return null
}

function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  if (platform === 'github') return <Github size={size} className="text-[#8A8FBF]" />
  if (platform === 'superfluid') return <Zap size={size} className="text-[#1DB227]" />
  return <Globe2 size={size} className="text-[#F897FE]" />
}

// ─── MetricStat ────────────────────────────────────────────────────────────────

function MetricStat({ display, label, color, dot }: { display: string; label: string; color: string; dot: string }) {
  return (
    <div className="metric-cell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="metric-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="metric-dot" style={{ width: 9, height: 9, borderRadius: 99, background: dot, boxShadow: `0 0 12px ${dot}`, flexShrink: 0, display: 'inline-block' }} />
        <span className="metric-num" style={{ fontSize: 34, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{display}</span>
      </span>
      <span className="metric-label" style={{ fontSize: 13, color: '#8A8FBF', marginLeft: 17 }}>{label}</span>
    </div>
  )
}

function MetricsStrip({ domains, activeMarkees, messages, usdRaw, totalViews, ethPriceVal }: {
  domains: number; activeMarkees: number; messages: number; usdRaw: number; totalViews: number; ethPriceVal: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const narrow = useNarrow()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let done = false
    const go = () => { if (!done) { done = true; setStarted(true) } }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { go(); io.disconnect() } })
    }, { threshold: 0.4 })
    io.observe(el)
    const t = setTimeout(go, 600)
    return () => { io.disconnect(); clearTimeout(t) }
  }, [])

  const usdTarget = ethPriceVal ? Math.round(usdRaw * ethPriceVal) : 0
  const vDomains = useCountUp(domains, started)
  const vMarkees = useCountUp(activeMarkees, started)
  const vMessages = useCountUp(messages, started)
  const vUsd = useCountUp(usdTarget, started)
  const vViews = useCountUp(totalViews, started)
  const fmt = (v: number) => narrow ? fmtCompact(v) : v.toLocaleString()

  return (
    <section className="metrics-section bg-[#0A0F3D] py-10 border-b border-[#8A8FBF]/20">
      <div ref={ref} className="metrics-row" style={{ maxWidth: 1080, margin: '0 auto', padding: '0 40px' }}>
        <MetricStat display={fmt(vDomains)} label="domains" color="#7B6AF4" dot="#7B6AF4" />
        <MetricStat display={fmt(vMarkees)} label="active Markees" color="#F897FE" dot="#F897FE" />
        <MetricStat display={fmt(vMessages)} label="messages bought" color="#EDEEFF" dot="#EDEEFF" />
        <MetricStat display={ethPriceVal ? `$${fmt(vUsd)}` : `${usdRaw.toFixed(2)} ETH`} label="total funds raised" color="#1DB227" dot="#1DB227" />
        <MetricStat display={fmt(vViews)} label="views" color="#7C9CFF" dot="#7C9CFF" />
      </div>
    </section>
  )
}

// ─── FeaturedMarkee ────────────────────────────────────────────────────────────

function FeaturedMarkee({ lb, onBid, views }: { lb: EcosystemLeaderboard; onBid: () => void; views: number }) {
  const [hover, setHover] = useState(false)
  return (
    <section
      className="relative overflow-hidden border-b border-[#8A8FBF]/20 py-11 px-4 sm:px-10"
      style={{
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%), linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
      }}
    >
      <HeroBackground />
      <div className="relative z-10 max-w-[920px] mx-auto">
        <div className="flex items-center gap-2 mb-4 font-mono text-[12px] text-[#8A8FBF] tracking-[2px] uppercase">
          <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE]" />
          Top Message
          <span className="flex-1 h-px bg-[#8A8FBF]/20 ml-2" />
        </div>
        <button
          onClick={onBid}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className="relative w-full text-left cursor-pointer rounded-[16px] p-[18px_26px_22px] backdrop-blur-sm transition-[border-color,transform,box-shadow] duration-[180ms]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
            transform: hover ? 'translateY(-2px)' : 'none',
            boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
          }}
        >
          <div className="flex items-center justify-end mb-3 font-mono text-[10.5px] tracking-[1.5px] uppercase">
            <span className="inline-flex items-center gap-1 text-[#7C9CFF]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {views > 0 ? fmtCompact(views) : '—'}
            </span>
          </div>
          <div
            className="font-mono font-bold leading-[1.12] tracking-[-0.02em]"
            style={{
              fontSize: 'clamp(20px,3vw,34px)',
              background: 'linear-gradient(120deg, #EDEEFF 0%, #F897FE 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {lb.topMessage || lb.name || 'Be the first to buy a message'}
          </div>
          <div className="mt-[14px] flex items-center justify-end gap-2 text-[13px] flex-wrap">
            <span className="text-[#8A8FBF]">—</span>
            <span className="text-[#EDEEFF]">{lb.name}</span>
            <span className="text-[#8A8FBF] font-mono text-[11px]">
              {lb.address.slice(0, 6)}...{lb.address.slice(-4)}
            </span>
          </div>
          {/* price pill */}
          <span
            className="absolute bottom-[-15px] left-1/2 inline-flex items-center gap-1.5 bg-[#F897FE] text-[#060A2A] font-mono font-bold text-[13px] px-[18px] py-2 rounded-lg whitespace-nowrap shadow-[0_8px_28px_rgba(248,151,254,0.42)] pointer-events-none z-[3] transition-[opacity,transform] duration-[180ms]"
            style={{
              transform: `translateX(-50%) translateY(${hover ? '0' : '4px'})`,
              opacity: hover ? 1 : 0,
            }}
          >
            View &amp; Buy →
          </span>
        </button>
      </div>
    </section>
  )
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortHead({ label, col, sortKey, sortDir, onSort, align = 'left' }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (c: SortKey) => void; align?: 'left' | 'right'
}) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onSort(col)}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        justifySelf: align === 'right' ? 'end' : 'start',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
        color: active ? '#F897FE' : '#8A8FBF', transition: 'color 120ms',
      }}
    >
      {label}
      <span style={{ fontSize: 8, opacity: active ? 1 : 0.4, lineHeight: 1 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}

// ─── Filter / sort constants ────────────────────────────────────────────────────

const FACTORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'website', label: 'Websites' },
  { key: 'github', label: 'GitHub Repos' },
  { key: 'superfluid', label: 'Superfluid' },
] as const

type TabKey = (typeof FACTORY_TABS)[number]['key']
type SortKey = 'raised' | 'views' | 'price'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function EcosystemPage() {
  const ethPrice = useEthPrice()

  const [leaderboards, setLeaderboards] = useState<EcosystemLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [viewCounts, setViewCounts] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  // Filter / sort / search state
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [sortKey, setSortKey] = useState<SortKey>('raised')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  // Fetch leaderboards
  useEffect(() => {
    setIsLoading(true)
    const params = new URLSearchParams({ t: Date.now().toString() })
    fetch(`/api/ecosystem/leaderboards?${params}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        const lbs: EcosystemLeaderboard[] = data.leaderboards ?? []
        setLeaderboards(lbs)
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')

        // Fetch view counts
        const active = lbs.filter(l => BigInt(l.topFundsAddedRaw ?? '0') > 0n)
        const markeeAddrs = active
          .map(l => l.topMarkeeAddress?.toLowerCase())
          .filter((a): a is string => !!a)
        if (markeeAddrs.length > 0) {
          fetch(`/api/views?addresses=${markeeAddrs.join(',')}`)
            .then(r => (r.ok ? r.json() : {}))
            .then((d: Record<string, { totalViews: number }>) => {
              const map = new Map<string, number>()
              for (const lb of active) {
                const key = lb.topMarkeeAddress?.toLowerCase()
                if (key && d[key] != null) map.set(lb.address.toLowerCase(), d[key].totalViews)
              }
              setViewCounts(map)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  // Derived ecosystem stats
  const ecoActive = useMemo(
    () => leaderboards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n),
    [leaderboards],
  )
  const ecoMessages = useMemo(
    () =>
      ecoActive.reduce(
        (sum, lb) => sum + (lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)),
        0,
      ),
    [ecoActive],
  )
  const totalViews = useMemo(
    () => Array.from(viewCounts.values()).reduce((s, v) => s + v, 0),
    [viewCounts],
  )

  // Top leaderboard for featured hero — verified only
  const featured = useMemo(
    () =>
      leaderboards
        .filter(isVerified)
        .sort((a, b) => Number(BigInt(b.topFundsAddedRaw ?? '0') - BigInt(a.topFundsAddedRaw ?? '0')))[0] ?? null,
    [leaderboards],
  )

  // Filtered + sorted leaderboards
  const filtered = useMemo(() => {
    let list = leaderboards.filter(isVerified)
    if (activeTab !== 'all') list = list.filter(lb => lb.platform === activeTab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        lb =>
          lb.name.toLowerCase().includes(q) ||
          (lb.topMessage ?? '').toLowerCase().includes(q) ||
          lb.address.toLowerCase().includes(q),
      )
    }
    list = [...list].sort((a, b) => {
      let diff = 0
      if (sortKey === 'raised') {
        diff = Number(BigInt(b.topFundsAddedRaw ?? '0') - BigInt(a.topFundsAddedRaw ?? '0'))
      } else if (sortKey === 'views') {
        const av = viewCounts.get(a.address.toLowerCase()) ?? 0
        const bv = viewCounts.get(b.address.toLowerCase()) ?? 0
        diff = bv - av
      } else if (sortKey === 'price') {
        const minInc = BigInt('1000000000000000')
        const aTop = BigInt(a.topFundsAddedRaw ?? '0')
        const bTop = BigInt(b.topFundsAddedRaw ?? '0')
        const aMin = BigInt(a.minimumPriceRaw ?? '0')
        const bMin = BigInt(b.minimumPriceRaw ?? '0')
        const aPrice = aTop + minInc > aMin ? aTop + minInc : aMin
        const bPrice = bTop + minInc > bMin ? bTop + minInc : bMin
        diff = Number(bPrice - aPrice)
      }
      return sortDir === 'desc' ? diff : -diff
    })
    return list
  }, [leaderboards, activeTab, search, sortKey, sortDir, viewCounts])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  function handleTabChange(key: TabKey) {
    setActiveTab(key)
    setPage(0)
  }

  function handleSearch(val: string) {
    setSearch(val)
    setPage(0)
  }


  // Row helper: compute buy price
  function buyPriceEth(lb: EcosystemLeaderboard): string {
    const minInc = BigInt('1000000000000000')
    const top = BigInt(lb.topFundsAddedRaw ?? '0')
    const minP = BigInt(lb.minimumPriceRaw ?? '0')
    const price = top + minInc > minP ? top + minInc : minP
    return (Number(price) / 1e18).toFixed(3)
  }

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="marketplace" />

      {/* Featured hero */}
      {!isLoading && featured && (
        <FeaturedMarkee
          lb={featured}
          views={viewCounts.get(featured.address.toLowerCase()) ?? 0}
          onBid={() => {
            window.location.href = rowHref(featured)
          }}
        />
      )}

      {/* Metrics strip */}
      {!isLoading && (
        <MetricsStrip
          domains={leaderboards.length}
          activeMarkees={ecoActive.length}
          messages={ecoMessages}
          usdRaw={parseFloat(totalPlatformFunds)}
          totalViews={totalViews}
          ethPriceVal={ethPrice ?? null}
        />
      )}

      {/* Leaderboard */}
      <section className="py-14 px-4 sm:px-10 bg-[#060A2A]">
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {/* Heading */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-4">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0" />
              Marketplace
            </div>
            <h1 className="text-4xl font-bold text-[#EDEEFF] mb-2">Search the Markee network</h1>
            <p className="text-[#B8B6D9] text-base">Find and buy messages from any Markee on the internet.</p>
          </div>

          {/* Filters row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Search with icon + clear */}
            <div style={{ flex: 1, minWidth: 220, position: 'relative', display: 'flex', alignItems: 'center', background: '#0A0F3D', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8, padding: '0 12px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#8A8FBF', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M21 21l-4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="search messages, owners, 0x..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: '#EDEEFF', padding: '11px 10px', fontSize: 13, outline: 'none', fontFamily: "'JetBrains Mono', monospace" }}
              />
              {search && (
                <button onClick={() => handleSearch('')} style={{ background: 'transparent', border: 'none', color: '#8A8FBF', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>
            {/* Platform tabs */}
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: 3, background: '#0A0F3D', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8 }}>
              {FACTORY_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  style={{
                    background: activeTab === tab.key ? '#4B3ACC' : 'transparent',
                    color: activeTab === tab.key ? '#EDEEFF' : '#8A8FBF',
                    border: 'none', borderRadius: 5, padding: '7px 12px', fontSize: 12,
                    fontWeight: activeTab === tab.key ? 700 : 500, cursor: 'pointer',
                    whiteSpace: 'nowrap', fontFamily: 'inherit', transition: 'background 120ms, color 120ms',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers (desktop) */}
          <div
            className="hidden md:grid gap-4 px-[14px] pb-[10px]"
            style={{ gridTemplateColumns: '200px 120px 1fr 80px 130px', background: '#060A2A' }}
          >
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8FBF' }}>Served on</span>
            <SortHead label="Total raised" col="raised" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8FBF' }}>Current Message</span>
            <SortHead label="Views" col="views" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortHead label="Price to change" col="price" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
          </div>

          {/* Rows */}
          <div className="bg-[#0A0F3D] rounded-[10px] border border-[#8A8FBF]/20 overflow-hidden">
            {isLoading ? (
              [1, 2, 3, 4, 5, 6].map(i => (
                <div
                  key={i}
                  className="h-16 border-b border-[#8A8FBF]/20 last:border-0 animate-pulse bg-[#8A8FBF]/5"
                />
              ))
            ) : pageItems.length === 0 ? (
              <div className="py-16 text-center text-[#8A8FBF] font-mono text-[14px]">
                No Markees found
              </div>
            ) : (
              pageItems.map(lb => {
                const views = viewCounts.get(lb.address.toLowerCase()) ?? 0
                const platform = lb.platform
                const href = rowHref(lb)
                return (
                  <Link
                    key={lb.address}
                    href={href}
                    className="block border-b border-[#8A8FBF]/20 last:border-0 hover:bg-[#8A8FBF]/5 transition-colors"
                  >
                    {/* Mobile */}
                    <div className="flex flex-col gap-1 px-4 py-3 md:hidden">
                      <div className="flex items-center gap-2">
                        {logoSrc(lb)
                          ? <img src={logoSrc(lb)!} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                          : <PlatformIcon platform={platform} size={13} />
                        }
                        <span className="font-mono text-[13px] text-[#EDEEFF] truncate">{servedOnDisplay(lb)}</span>
                      </div>
                      <span className="font-mono text-[12px] text-[#8A8FBF] line-clamp-1">
                        {lb.topMessage || '—'}
                      </span>
                      <div className="flex items-center gap-3 text-[11px] text-[#8A8FBF] font-mono">
                        <span className="text-[#7C9CFF]">{parseFloat(lb.totalFunds).toFixed(3)} ETH</span>
                        {views > 0 && <span>{fmtCompact(views)} views</span>}
                        <span className="ml-auto text-[#F897FE]">{buyPriceEth(lb)} ETH</span>
                      </div>
                    </div>
                    {/* Desktop */}
                    <div
                      className="hidden md:grid gap-4 px-[14px] py-[13px] items-center"
                      style={{ gridTemplateColumns: '200px 120px 1fr 80px 130px' }}
                    >
                      {/* Served on */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span style={{
                          width: 22, height: 22, borderRadius: 5, flexShrink: 0, overflow: 'hidden',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#060A2A', border: '1px solid rgba(138,143,191,0.2)',
                        }}>
                          {logoSrc(lb)
                            ? <img src={logoSrc(lb)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <PlatformIcon platform={platform} size={12} />
                          }
                        </span>
                        <span className="font-mono text-[12.5px] text-[#B8B6D9] truncate">{servedOnDisplay(lb)}</span>
                      </div>
                      {/* Total raised */}
                      <span className="font-mono text-[12.5px] text-[#7C9CFF] font-semibold">
                        {parseFloat(lb.totalFunds).toFixed(3)} ETH
                      </span>
                      {/* Current message */}
                      <span className="font-mono text-[13px] text-[#EDEEFF] truncate">
                        {lb.topMessage || '—'}
                      </span>
                      {/* Views */}
                      <span className="font-mono text-[12px] text-[#8A8FBF]">
                        {views > 0 ? fmtCompact(views) : '—'}
                      </span>
                      {/* Price */}
                      <span className="font-mono text-[12px] text-[#B8B6D9] text-right">
                        {buyPriceEth(lb)} ETH
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg border border-[#8A8FBF]/30 font-mono text-[13px] text-[#8A8FBF] disabled:opacity-40 hover:border-[#8A8FBF]/60 hover:text-[#EDEEFF] transition-colors disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`px-3 py-2 rounded-lg border font-mono text-[13px] transition-colors ${
                    i === page
                      ? 'border-[#F897FE] text-[#F897FE]'
                      : 'border-[#8A8FBF]/30 text-[#8A8FBF] hover:border-[#8A8FBF]/60 hover:text-[#EDEEFF]'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page === pageCount - 1}
                className="px-4 py-2 rounded-lg border border-[#8A8FBF]/30 font-mono text-[13px] text-[#8A8FBF] disabled:opacity-40 hover:border-[#8A8FBF]/60 hover:text-[#EDEEFF] transition-colors disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
