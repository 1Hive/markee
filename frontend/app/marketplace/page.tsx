'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { formatEther } from 'viem'
import { Eye } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO  = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK  = '#F897FE'
const BLUE  = '#7C9CFF'
const PURP  = '#7B6AF4'
const GREEN = '#1DB227'
const BG    = '#060A2A'
const BG2   = '#0A0F3D'
const TEXT  = '#EDEEFF'
const TEXT2 = '#B8B6D9'
const MUTED = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

const PAGE_SIZE = 25

// ── Types ─────────────────────────────────────────────────────────────────────
interface Leaderboard {
  address: string
  platform: 'website' | 'github' | 'superfluid'
  totalFundsRaw: string
  topFundsAddedRaw: string
  markeeCount: number
  topMessage: string | null
  topMessageOwner: string | null
  topMarkeeOwner: string | null
  topMarkeeAddress: string | null
  verifiedUrl?: string
  verifiedUrls?: string[]
  leaderboardName?: string
  logoUrl?: string
  status?: string
  isLegacy?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function servedOnLabel(lb: Leaderboard): string {
  if (lb.platform === 'github') return 'GitHub'
  if (lb.platform === 'superfluid') return 'Superfluid'
  if (lb.verifiedUrl) {
    const domain = extractDomain(lb.verifiedUrl)
    const extra = (lb.verifiedUrls?.length ?? 1) - 1
    return extra > 0 ? `${domain} +${extra}` : domain
  }
  return lb.leaderboardName || lb.address.slice(0, 8) + '...'
}

function priceToOvertake(lb: Leaderboard): bigint {
  return BigInt(lb.topFundsAddedRaw || '0') + BigInt('1000000000000000')
}

// ── Count-up ──────────────────────────────────────────────────────────────────
function useCountUp(target: number, started: boolean, duration = 1600) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!started) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVal(target); return }
    const t0 = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [started, target, duration])
  return val
}

function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setNarrow(mq.matches)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

// ── Stat cell ─────────────────────────────────────────────────────────────────
function StatCell({ n, label, color, dot }: { n: string; label: string; color: string; dot: string }) {
  return (
    <div className="metric-cell">
      <span className="metric-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="metric-dot" style={{ width: 9, height: 9, borderRadius: 99, background: dot, boxShadow: `0 0 12px ${dot}`, flexShrink: 0 }} />
        <span className="metric-num" style={{ fontSize: 34, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      </span>
      <span className="metric-label" style={{ fontSize: 13, color: MUTED, marginLeft: 17 }}>{label}</span>
    </div>
  )
}

function SkeletonStatCell() {
  return (
    <div className="metric-cell">
      <span className="metric-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: 'rgba(138,143,191,0.15)', flexShrink: 0 }} />
        <div style={{ width: 72, height: 28, background: 'rgba(138,143,191,0.08)', borderRadius: 6 }} />
      </span>
      <div style={{ width: 110, height: 12, background: 'rgba(138,143,191,0.08)', borderRadius: 4, marginLeft: 17 }} />
    </div>
  )
}

function MetricsStrip({ stats, loaded }: { stats: { markees: number; messages: number; usd: number; views: number }; loaded: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    let done = false
    const go = () => { if (!done) { done = true; setStarted(true) } }
    const io = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) { go(); io.disconnect() } }) }, { threshold: 0.4 })
    io.observe(el)
    const t = setTimeout(go, 600)
    return () => { io.disconnect(); clearTimeout(t) }
  }, [])

  const markees  = useCountUp(stats.markees,  started)
  const messages = useCountUp(stats.messages, started)
  const usd      = useCountUp(stats.usd,      started)
  const views    = useCountUp(stats.views,    started)
  const narrow   = useNarrow()
  const fmt = (v: number) => narrow ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : v.toLocaleString()

  return (
    <section className="metrics-section" style={{ background: BG2, padding: '40px', borderBottom: `1px solid ${BORDER}` }}>
      <div ref={ref} className="metrics-row" style={{ maxWidth: 1240, margin: '0 auto' }}>
        {loaded ? (
          <>
            <StatCell n={fmt(markees)}   label="active Markees"     color={PINK}  dot={PINK}  />
            <StatCell n={fmt(messages)}  label="messages bought"    color={TEXT}  dot={TEXT}  />
            <StatCell n={`$${fmt(usd)}`} label="total funds raised" color={GREEN} dot={GREEN} />
            <StatCell n={fmt(views)}     label="views"              color={PURP}  dot={PURP}  />
          </>
        ) : (
          [1, 2, 3, 4].map(i => <SkeletonStatCell key={i} />)
        )}
      </div>
    </section>
  )
}

// ── Platform glyph for SERVED ON ──────────────────────────────────────────────
function ServedLogo({ lb }: { lb: Leaderboard }) {
  const box: React.CSSProperties = { width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BORDER}`, overflow: 'hidden' }
  if (lb.platform === 'github') {
    return <span style={{ ...box, background: 'rgba(237,238,255,0.08)' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill={TEXT2}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
    </span>
  }
  if (lb.platform === 'superfluid') {
    return <span style={{ ...box, background: 'rgba(29,178,39,0.14)' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    </span>
  }
  if (lb.logoUrl) {
    return <span style={{ ...box }}><img src={lb.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
  }
  const raw = lb.verifiedUrl ? extractDomain(lb.verifiedUrl) : (lb.leaderboardName || '?')
  const ch = (raw[0] || '?').toUpperCase()
  const tints = [PINK, BLUE, PURP]
  const tint = tints[raw.length % tints.length]
  return <span style={{ ...box, background: `${tint}22`, color: tint, fontFamily: MONO, fontWeight: 700, fontSize: 11 }}>{ch}</span>
}

// ── Sortable column header ─────────────────────────────────────────────────────
function SortHead({ label, col, sortKey, sortDir, onSort, align = 'left' }: { label: string; col: string; sortKey: string; sortDir: string; onSort: (col: string) => void; align?: 'left' | 'right' }) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onSort(col)}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        justifySelf: align === 'right' ? 'end' : 'start',
        fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
        color: active ? PINK : MUTED, transition: 'color 120ms',
      }}
    >
      {label}
      <span style={{ fontSize: 8, opacity: active ? 1 : 0.4, lineHeight: 1 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}

// ── Pagination button ─────────────────────────────────────────────────────────
function PagerBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        minWidth: 34, height: 34, padding: '0 9px', borderRadius: 7,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? PINK : 'transparent',
        color: active ? BG : (disabled ? MUTED : TEXT2),
        border: `1px solid ${active ? PINK : BORDER}`,
        fontFamily: MONO, fontSize: 13, fontWeight: active ? 700 : 500,
        opacity: disabled ? 0.4 : 1,
        transition: 'background 120ms, color 120ms, border-color 120ms',
      }}
    >
      {children}
    </button>
  )
}

// ── Featured hero card ────────────────────────────────────────────────────────
function FeaturedHero({ lb, views, ethPrice }: { lb: Leaderboard; views: number; ethPrice: number | null }) {
  const [hover, setHover] = useState(false)
  const priceEth = parseFloat(formatEther(priceToOvertake(lb)))
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`

  return (
    <section
      className="relative overflow-hidden"
      style={{ padding: '40px 40px 52px', borderBottom: `1px solid ${BORDER}`, background: ['radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)', 'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)', 'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)'].join(', ') }}
    >
      <HeroBackground />
      <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <a
          href={`/markee/${lb.address}`}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: 'relative', display: 'block', textDecoration: 'none',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
            borderRadius: 16, padding: '18px 26px 22px',
            backdropFilter: 'blur(4px)',
            transition: 'border-color 180ms, transform 180ms, box-shadow 180ms',
            transform: hover ? 'translateY(-2px)' : 'none',
            boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
          }}
        >
          {/* top-right: views */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 13, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: BLUE }}>
              <Eye size={10} style={{ opacity: 0.7 }} /> {formatViews(views)}
            </span>
          </div>

          {/* message text */}
          <div style={{
            fontFamily: MONO, fontWeight: 700,
            fontSize: 'clamp(19px, 2.6vw, 30px)', lineHeight: 1.12, letterSpacing: '-0.02em',
            textWrap: 'balance' as any,
            background: `linear-gradient(120deg, ${TEXT} 0%, ${PINK} 100%)`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {lb.topMessage || lb.leaderboardName || '—'}
          </div>

          {/* bottom-right: author */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, fontSize: 13, color: TEXT2, flexWrap: 'wrap' }}>
            <span style={{ color: MUTED }}>-</span>
            {lb.topMessageOwner && <span style={{ color: TEXT }}>{lb.topMessageOwner}</span>}
            {lb.topMarkeeOwner && (
              <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11 }}>
                {lb.topMarkeeOwner.slice(0, 6)}...{lb.topMarkeeOwner.slice(-4)}
              </span>
            )}
          </div>

          {/* hover pill */}
          <span style={{
            position: 'absolute', bottom: -15, left: '50%',
            transform: `translateX(-50%) ${hover ? 'translateY(0)' : 'translateY(4px)'}`,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: PINK, color: BG, fontFamily: MONO, fontWeight: 700, fontSize: 13,
            padding: '8px 18px', borderRadius: 8, whiteSpace: 'nowrap' as const,
            boxShadow: '0 8px 28px rgba(248,151,254,0.42)',
            opacity: hover ? 1 : 0, transition: 'opacity 180ms, transform 180ms',
            pointerEvents: 'none', zIndex: 3,
          }}>
            {priceLabel} to change
          </span>
        </a>
      </div>
    </section>
  )
}

// ── Dense table row ───────────────────────────────────────────────────────────
function TableRow({ lb, views, ethPrice, onBuy }: { lb: Leaderboard; views: number; ethPrice: number | null; onBuy: () => void }) {
  const [hover, setHover] = useState(false)
  const totalEth  = parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
  const priceEth  = parseFloat(formatEther(priceToOvertake(lb)))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`

  return (
    <a
      href={`/markee/${lb.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px',
        gap: 16, padding: '11px 14px', textDecoration: 'none',
        borderBottom: `1px solid ${BORDER}`,
        background: hover ? 'rgba(248,151,254,0.04)' : 'transparent',
        transition: 'background 120ms', cursor: 'pointer',
      }}
    >
      {/* SERVED ON */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: TEXT2, minWidth: 0 }}>
        <ServedLogo lb={lb} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: lb.platform === 'website' ? MONO : 'inherit' }}>
          {servedOnLabel(lb)}
        </span>
      </span>

      {/* TOTAL RAISED */}
      <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {totalLabel}
      </span>

      {/* CURRENT MESSAGE */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lb.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
        </div>
      </div>

      {/* VIEWS */}
      <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Eye size={10} style={{ opacity: 0.7 }} />
        {views > 0 ? formatViews(views) : '—'}
      </span>

      {/* PRICE TO CHANGE */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onBuy() }}
          style={{
            width: '100%', textAlign: 'center',
            background: PINK, color: BG, border: 'none', borderRadius: 7,
            padding: '8px 10px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5,
            cursor: 'pointer', whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(248,151,254,0.28)',
            transition: 'transform 120ms, box-shadow 120ms',
          }}
          onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 18px rgba(248,151,254,0.45)' }}
          onMouseLeave={e => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(248,151,254,0.28)' }}
        >
          {priceLabel}
        </button>
      </div>
    </a>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const ethPrice = useEthPrice()

  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([])
  const [loading, setLoading]           = useState(true)
  const [viewsMap, setViewsMap]         = useState<Map<string, number>>(new Map())
  const [ecoStats, setEcoStats]         = useState({ markees: 0, messages: 0, usd: 0 })

  const [buyModal, setBuyModal] = useState<Leaderboard | null>(null)

  const [search,  setSearch]   = useState('')
  const [factory, setFactory]  = useState('all')
  const [sortKey, setSortKey]  = useState('raised')
  const [sortDir, setSortDir]  = useState<'asc' | 'desc'>('desc')
  const [page,    setPage]     = useState(0)

  // Fetch leaderboard list
  useEffect(() => {
    fetch(`/api/ecosystem/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const lbs: Leaderboard[] = data.leaderboards ?? []
        setLeaderboards(lbs)

        const active   = lbs.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n)
        const messages = active.reduce((sum, lb) => sum + (lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)), 0)
        const totalEth = parseFloat(data.totalPlatformFunds ?? '0')
        setEcoStats({ markees: active.length, messages, usd: ethPrice ? Math.round(totalEth * ethPrice) : 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethPrice])

  // Batch-fetch views for all top markees
  useEffect(() => {
    const addrs = leaderboards.map(lb => lb.topMarkeeAddress).filter(Boolean) as string[]
    if (addrs.length === 0) return
    const params = addrs.map(a => a.toLowerCase()).join(',')
    fetch(`/api/views?addresses=${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const m = new Map<string, number>()
        for (const [addr, v] of Object.entries(data as Record<string, { totalViews: number }>)) {
          m.set(addr.toLowerCase(), v.totalViews)
        }
        setViewsMap(m)
      })
      .catch(() => {})
  }, [leaderboards])

  // Filter
  const filtered = useMemo(() => {
    let arr = leaderboards.filter(lb =>
      BigInt(lb.topFundsAddedRaw || '0') > 0n && lb.topMessage
    )
    if (factory !== 'all') arr = arr.filter(lb => lb.platform === factory)
    if (search.trim()) {
      const s = search.toLowerCase()
      arr = arr.filter(lb =>
        (lb.topMessage || '').toLowerCase().includes(s) ||
        (lb.topMessageOwner || '').toLowerCase().includes(s) ||
        (lb.leaderboardName || '').toLowerCase().includes(s) ||
        (lb.verifiedUrl || '').toLowerCase().includes(s) ||
        lb.address.toLowerCase().includes(s)
      )
    }
    return arr
  }, [leaderboards, factory, search])

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'views') {
        const av = viewsMap.get((a.topMarkeeAddress || '').toLowerCase()) ?? 0
        const bv = viewsMap.get((b.topMarkeeAddress || '').toLowerCase()) ?? 0
        return (av - bv) * dir
      }
      if (sortKey === 'price') {
        const ap = priceToOvertake(a)
        const bp = priceToOvertake(b)
        return (ap > bp ? 1 : ap < bp ? -1 : 0) * dir
      }
      // raised (default)
      const af = BigInt(a.totalFundsRaw || '0')
      const bf = BigInt(b.totalFundsRaw || '0')
      return (af > bf ? 1 : af < bf ? -1 : 0) * dir
    })
  }, [filtered, sortKey, sortDir, viewsMap])

  // Reset page on filter/sort changes
  useEffect(() => { setPage(0) }, [search, factory, sortKey, sortDir])

  const onSort = useCallback((col: string) => {
    setSortKey(prev => {
      setSortDir(dir => prev === col ? (dir === 'asc' ? 'desc' : 'asc') : 'desc')
      return col
    })
  }, [])

  const pageRows   = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page])
  const pageCount  = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))

  // Top leaderboard for featured hero (by totalFunds, must have a message)
  const featured = useMemo(() => leaderboards.filter(lb => lb.topMessage).sort((a, b) => {
    const af = BigInt(a.totalFundsRaw || '0'), bf = BigInt(b.totalFundsRaw || '0')
    return bf > af ? 1 : bf < af ? -1 : 0
  })[0] ?? null, [leaderboards])

  const featuredViews = featured?.topMarkeeAddress
    ? (viewsMap.get(featured.topMarkeeAddress.toLowerCase()) ?? 0)
    : 0

  const totalViews = useMemo(
    () => Array.from(viewsMap.values()).reduce((sum, v) => sum + v, 0),
    [viewsMap]
  )

  const FACTORIES = [
    { key: 'all',        label: 'All' },
    { key: 'website',    label: 'Websites' },
    { key: 'github',     label: 'GitHub Repos' },
    { key: 'superfluid', label: 'Superfluid' },
  ]

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="marketplace" useRegularLinks />

      {/* ── Featured hero ── */}
      {featured && <FeaturedHero lb={featured} views={featuredViews} ethPrice={ethPrice} />}

      {/* ── Metrics strip ── */}
      <MetricsStrip stats={{ ...ecoStats, views: totalViews }} loaded={!loading} />

      {/* ── Leaderboard table ── */}
      <section style={{ padding: '34px 40px 90px', maxWidth: 1240, margin: '0 auto' }}>
        {/* heading */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: PINK, marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
              Marketplace
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 800, color: TEXT, letterSpacing: -0.6 }}>
              Search the Markee network
            </h2>
            <p style={{ margin: '8px 0 0', color: TEXT2, fontSize: 16, maxWidth: '56ch' }}>
              Find and buy messages from any Markee on the internet.
            </p>
          </div>
          <a
            href="/raise-funding"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '13px 24px', fontSize: 15, fontWeight: 600,
              textDecoration: 'none', cursor: 'pointer', transition: 'border-color 160ms, color 160ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TEXT; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TEXT2; (e.currentTarget as HTMLElement).style.borderColor = BORDER }}
          >
            Create Your Own Markee →
          </a>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* search */}
          <div style={{ flex: 1, minWidth: 220, position: 'relative', display: 'flex', alignItems: 'center', background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 12px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: MUTED, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search messages, owners, 0x…"
              style={{ flex: 1, background: 'transparent', border: 'none', color: TEXT, padding: '11px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
            )}
          </div>

          {/* factory toggle */}
          <div style={{ display: 'flex', gap: 4, padding: 3, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            {FACTORIES.map(f => (
              <button
                key={f.key}
                onClick={() => setFactory(f.key)}
                style={{
                  background: factory === f.key ? PURP : 'transparent',
                  color: factory === f.key ? TEXT : MUTED,
                  border: 'none', borderRadius: 5, padding: '7px 12px',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  whiteSpace: 'nowrap', fontFamily: 'inherit',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* table */}
        <div style={{ background: BG2, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px', gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }}>Served on</span>
            <SortHead label="Total raised"    col="raised" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }}>Current Message</span>
            <SortHead label="Views"           col="views"  sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Price to change" col="price"  sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
          </div>

          {/* rows */}
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px', gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}` }}>
                {[1, 2, 3, 4, 5].map(j => (
                  <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
                ))}
              </div>
            ))
          ) : pageRows.length === 0 ? (
            <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
              No messages match that search.
            </div>
          ) : (
            pageRows.map(lb => (
              <TableRow
                key={lb.address}
                lb={lb}
                views={viewsMap.get((lb.topMarkeeAddress || '').toLowerCase()) ?? 0}
                ethPrice={ethPrice}
                onBuy={() => setBuyModal(lb)}
              />
            ))
          )}
        </div>

        {/* pagination */}
        {pageCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, fontFamily: MONO, fontSize: 13 }}>
            <PagerBtn disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</PagerBtn>
            {Array.from({ length: pageCount }).map((_, i) => (
              <PagerBtn key={i} active={i === page} onClick={() => setPage(i)}>{i + 1}</PagerBtn>
            ))}
            <PagerBtn disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>→</PagerBtn>
          </div>
        )}
      </section>

      <Footer />

      {buyModal && (
        <BuyMessageModal
          isOpen={true}
          strategyAddress={buyModal.address as `0x${string}`}
          topFundsAdded={BigInt(buyModal.topFundsAddedRaw || '0')}
          platformId={buyModal.platform === 'superfluid' ? 'superfluid' : buyModal.platform === 'github' ? 'github' : undefined}
          onClose={() => setBuyModal(null)}
          onSuccess={() => setBuyModal(null)}
        />
      )}
    </div>
  )
}
