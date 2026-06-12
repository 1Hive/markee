'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useFixedMarkees } from '@/lib/contracts/useFixedMarkees'
import { useFixedViews } from '@/hooks/useFixedViews'
import { usePartnerMarkees } from '@/lib/contracts/usePartnerMarkees'
import { useEthPrice } from '@/hooks/useEthPrice'
import { V13_LEADERBOARDS } from '@/lib/contracts/addresses'
import { formatUsd } from '@/lib/utils'
import { FixedPriceModal } from '@/components/modals/FixedPriceModal'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'
import { RevnetBuyWidget } from '@/components/widgets/RevnetBuyWidget'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'

const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// ── Eyebrow label ─────────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: MONO, fontSize: 11, letterSpacing: 2,
      textTransform: 'uppercase', color: '#F897FE',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: '#F897FE', display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
      {children}
    </div>
  )
}

function formatEthCompact(wei: string): string {
  const n = parseFloat(formatEther(BigInt(wei)))
  if (n === 0) return '0'
  if (n === Math.floor(n)) return `${n}`
  // up to 4 sig decimal places, strip trailing zeros
  return parseFloat(n.toFixed(4)).toString()
}

// ── Hero reader sign ───────────────────────────────────────────────────────────
function ReaderSign({ fixedMarkee, views, onClick }: {
  fixedMarkee: FixedMarkee
  views?: { totalViews: number }
  onClick: () => void
}) {
  const hasPrice = fixedMarkee.priceWei !== '0' && fixedMarkee.priceWei !== '0x0'

  return (
    <button onClick={onClick} className="reader-card" style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      {views && views.totalViews > 0 && (
        <span className="reader-views">
          <Eye size={10} />
          {formatViews(views.totalViews)}
        </span>
      )}
      <span className="reader-text">{fixedMarkee.message || fixedMarkee.name}</span>
      {hasPrice && (
        <div className="reader-pill">
          {formatEthCompact(fixedMarkee.priceWei)} ETH to change
        </div>
      )}
    </button>
  )
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
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
      <span className="metric-label" style={{ fontSize: 13, color: '#8A8FBF', marginLeft: 17 }}>{label}</span>
    </div>
  )
}

// ── Metrics row ───────────────────────────────────────────────────────────────
function MetricsRow({ stats }: { stats: { markees: number; messages: number; usd: number; views: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let done = false
    const go = () => { if (!done) { done = true; setStarted(true) } }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { go(); io.disconnect() } })
    }, { threshold: 0.4 })
    io.observe(el)
    const t = setTimeout(go, 600)
    return () => { io.disconnect(); clearTimeout(t) }
  }, [])

  const markees = useCountUp(stats.markees, started)
  const messages = useCountUp(stats.messages, started)
  const usd = useCountUp(stats.usd, started)
  const views = useCountUp(stats.views, started)
  const narrow = useNarrow()
  const f = (v: number) => narrow
    ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
    : v.toLocaleString()

  return (
    <div ref={ref} className="metrics-row">
      <StatCell n={f(markees)} label="active Markees" color="#F897FE" dot="#F897FE" />
      <StatCell n={f(messages)} label="messages bought" color="#EDEEFF" dot="#EDEEFF" />
      <StatCell n={`$${f(usd)}`} label="total funds raised" color="#1DB227" dot="#1DB227" />
      <StatCell n={f(views)} label="views" color="#7B6AF4" dot="#7B6AF4" />
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({ kicker, title, sub, action }: {
  kicker: string
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
      <div>
        <div style={{ marginBottom: 14 }}><Eyebrow>{kicker}</Eyebrow></div>
        <h2 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 800, letterSpacing: -0.6, color: '#EDEEFF' }}>{title}</h2>
        {sub && <p style={{ margin: '10px 0 0', color: '#B8B6D9', fontSize: 16, maxWidth: '52ch' }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Platform glyphs ───────────────────────────────────────────────────────────
function PlatformGlyph({ icon, size = 26, color }: { icon: string; size?: number; color: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24' as const, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (icon === 'globe') return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
  if (icon === 'github') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  )
  if (icon === 'zap') return (
    <svg {...common}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
  return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
}

const PLATFORMS = [
  { key: 'website', name: 'Website', blurb: 'Any site you own', icon: 'globe', color: '#F897FE' },
  { key: 'github', name: 'GitHub Repo', blurb: 'README, docs, any markdown', icon: 'github', color: '#EDEEFF' },
  { key: 'superfluid', name: 'Superfluid Project', blurb: 'Earn SUP incentives', icon: 'zap', color: '#1DB227' },
] as const

function PlatformCard({ p, stats }: { p: typeof PLATFORMS[number]; stats?: { markees: number; usd: number } }) {
  const [hover, setHover] = useState(false)
  return (
    <Link
      href="/raise-funding"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 18, textDecoration: 'none',
        background: 'rgba(6,10,42,0.5)',
        border: `1px solid ${hover ? 'rgba(248,151,254,0.35)' : 'rgba(138,143,191,0.2)'}`,
        borderRadius: 14, padding: 22, cursor: 'pointer',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'border-color 160ms, transform 160ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{
          width: 48, height: 48, borderRadius: 12,
          background: '#060A2A', border: '1px solid rgba(138,143,191,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <PlatformGlyph icon={p.icon} color={p.color} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#EDEEFF', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{p.name}</div>
          <div style={{ color: '#8A8FBF', fontSize: 12.5, marginTop: 3 }}>{p.blurb}</div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(138,143,191,0.2)', paddingTop: 16 }}>
        {stats && (stats.markees > 0 || stats.usd > 0) ? (
          <div style={{ display: 'flex', gap: 28 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 22, color: '#EDEEFF', lineHeight: 1, letterSpacing: -0.5 }}>{stats.markees.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#8A8FBF', marginTop: 4 }}>Markees</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 22, color: '#7C9CFF', lineHeight: 1, letterSpacing: -0.5 }}>${stats.usd.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#8A8FBF', marginTop: 4 }}>raised</div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#8A8FBF', fontFamily: MONO, fontSize: 12 }}>Create a Markee →</div>
        )}
      </div>
    </Link>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#F897FE', color: '#060A2A',
        border: 'none', borderRadius: 10, padding: '14px 28px',
        fontWeight: 700, fontSize: 15, textDecoration: 'none', cursor: 'pointer',
        boxShadow: hover ? '0 12px 40px rgba(248,151,254,0.42)' : '0 8px 32px rgba(248,151,254,0.3)',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'transform 120ms, box-shadow 120ms',
      }}
    >
      {children}
    </a>
  )
}

function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false)
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', color: hover ? '#EDEEFF' : '#B8B6D9',
        border: `1px solid ${hover ? 'rgba(248,151,254,0.35)' : 'rgba(138,143,191,0.2)'}`,
        borderRadius: 10, padding: '13px 24px',
        fontWeight: 600, fontSize: 15, textDecoration: 'none', cursor: 'pointer',
        transition: 'border-color 160ms, color 160ms',
      }}
    >
      {children}
    </a>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const { markees: fixedMarkees, isLoading: isLoadingFixed } = useFixedMarkees()
  const { views: fixedViews, trackView: trackFixedView } = useFixedViews(fixedMarkees)
  const [modalMarkee, setModalMarkee] = useState<FixedMarkee | null>(null)
  const [buyModal, setBuyModal] = useState<{ leaderboardAddress: `0x${string}`; topFundsAdded: bigint } | null>(null)
  const { partnerData, isLoading: isLoadingPartners } = usePartnerMarkees()
  const ethPrice = useEthPrice()

  // Ecosystem stats for the metrics row + per-platform stats for platform cards
  const [ecoStats, setEcoStats] = useState({ domains: 0, markees: 0, messages: 0, usd: 0, views: 0 })
  const [platformStats, setPlatformStats] = useState<Record<string, { markees: number; usd: number }>>({})
  useEffect(() => {
    fetch(`/api/ecosystem/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(async data => {
        if (!data) return
        const leaderboards: { address: string; platform: string; topFundsAddedRaw: string; totalFundsRaw: string; markeeCount: number; isLegacy?: boolean }[] = data.leaderboards ?? []
        const active = leaderboards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n)
        const messages = active.reduce(
          (sum, lb) => sum + (lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)),
          0
        )
        const totalEth = parseFloat(data.totalPlatformFunds ?? '0')

        // Per-platform stats for the Raise Funding section cards
        const pAcc: Record<string, { markees: number; eth: number }> = {
          website: { markees: 0, eth: 0 },
          github: { markees: 0, eth: 0 },
          superfluid: { markees: 0, eth: 0 },
        }
        for (const lb of leaderboards) {
          const p = lb.platform
          if (pAcc[p]) {
            pAcc[p].markees += lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)
            pAcc[p].eth += parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
          }
        }
        setPlatformStats({
          website:    { markees: pAcc.website.markees,    usd: ethPrice ? Math.round(pAcc.website.eth    * ethPrice) : 0 },
          github:     { markees: pAcc.github.markees,     usd: ethPrice ? Math.round(pAcc.github.eth     * ethPrice) : 0 },
          superfluid: { markees: pAcc.superfluid.markees, usd: ethPrice ? Math.round(pAcc.superfluid.eth * ethPrice) : 0 },
        })

        // Fetch total views across all leaderboard addresses
        let totalViews = 0
        const addresses = leaderboards.map(lb => lb.address).filter(Boolean)
        if (addresses.length > 0) {
          try {
            const vRes = await fetch(`/api/views?addresses=${addresses.join(',')}`)
            if (vRes.ok) {
              const vData: Record<string, { totalViews: number }> = await vRes.json()
              totalViews = Object.values(vData).reduce((sum, v) => sum + (v.totalViews ?? 0), 0)
            }
          } catch {}
        }

        setEcoStats({
          domains: leaderboards.length,
          markees: active.length,
          messages,
          usd: ethPrice ? Math.round(totalEth * ethPrice) : 0,
          views: totalViews,
        })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethPrice])

  // Track views for hero reader signs
  useEffect(() => {
    if (fixedMarkees.length === 0) return
    fixedMarkees.forEach(trackFixedView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedMarkees.map(m => m.strategyAddress).join(',')])

  // Filter to partners with active leaderboards
  const activePartners = partnerData.filter(p => p.partner.leaderboardAddress)

  // Fetch views for home page marketplace table (keyed by top markee address, same as marketplace page)
  const [partnerViews, setPartnerViews] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    const addresses = activePartners.map(p => p.winningMarkee?.address).filter(Boolean) as string[]
    if (addresses.length === 0) return
    fetch(`/api/views?addresses=${addresses.map(a => a.toLowerCase()).join(',')}`)
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, { totalViews: number }>) => {
        setPartnerViews(new Map(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v.totalViews ?? 0])))
      })
      .catch(() => {})
  }, [activePartners.map(p => p.winningMarkee?.address ?? '').join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" useRegularLinks />

      {/* ── Hero: 3 reader signs ──────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          padding: '72px 40px 64px',
          borderBottom: '1px solid rgba(138,143,191,0.2)',
          background: [
            'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
            'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
            'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
          ].join(', '),
        }}
      >
        <HeroBackground />
        <div className="relative z-10" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="signs-grid">
            {isLoadingFixed
              ? [1, 2, 3].map(i => (
                  <div key={i} className="reader-card" style={{ opacity: 0.4 }}>
                    <span className="reader-text" style={{ background: 'rgba(138,143,191,0.15)', borderRadius: 6, minWidth: 160, height: '1em', display: 'block' }} />
                  </div>
                ))
              : fixedMarkees.map((fm) => (
                  <ReaderSign
                    key={fm.strategyAddress}
                    fixedMarkee={fm}
                    views={fixedViews.get(fm.strategyAddress.toLowerCase())}
                    onClick={() => setModalMarkee(fm)}
                  />
                ))
            }
          </div>
        </div>
      </section>

      {/* ── Pay to be seen + metrics ──────────────────────────────────────── */}
      <section
        className="metrics-section"
        style={{ background: '#0A0F3D', padding: '60px 40px', borderBottom: '1px solid rgba(138,143,191,0.2)' }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h1 style={{
            margin: '0 0 36px', textAlign: 'center',
            fontSize: 'clamp(36px,5.5vw,60px)', fontWeight: 800,
            letterSpacing: -2, lineHeight: 1.02, color: '#EDEEFF',
          }}>
            Pay to be <span style={{ color: '#F897FE' }}>seen</span>
          </h1>
          <MetricsRow stats={ecoStats} />
        </div>
      </section>

      {/* ── Marketplace teaser ────────────────────────────────────────────── */}
      <section style={{ background: '#060A2A', padding: '88px 40px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <SectionHead
            kicker="Marketplace"
            title="Buy a message anywhere on the network"
            sub="Find your audience on Markee's global network, buy a message, and see it live instantly."
          />

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px',
            gap: 16, alignItems: 'center', padding: '0 14px 10px',
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            color: '#8A8FBF', textTransform: 'uppercase',
          }}>
            <span>Served on</span>
            <span>Total raised</span>
            <span>Current message</span>
            <span>Views</span>
            <span style={{ textAlign: 'right' }}>Price to change</span>
          </div>

          {/* Partner rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {isLoadingPartners
              ? [1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px',
                    gap: 16, padding: '11px 14px',
                    borderBottom: '1px solid rgba(138,143,191,0.2)',
                  }}>
                    {[1, 2, 3, 4, 5].map(j => (
                      <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.1)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                  </div>
                ))
              : activePartners.map((pd) => {
                  const { partner, winningMarkee, totalFunds } = pd
                  const totalEth = parseFloat(formatEther(totalFunds))
                  const totalUsd = ethPrice ? Math.round(totalEth * ethPrice) : null
                  const priceToOvertakeEth = winningMarkee
                    ? parseFloat(formatEther(winningMarkee.totalFundsAdded + BigInt('1000000000000000')))
                    : null
                  const priceUsd = priceToOvertakeEth && ethPrice ? Math.round(priceToOvertakeEth * ethPrice) : null

                  return (
                    <a
                      key={partner.slug}
                      href={`/markee/${partner.leaderboardAddress}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '190px 110px 1fr 74px 120px',
                        gap: 16, padding: '11px 14px',
                        borderBottom: '1px solid rgba(138,143,191,0.2)',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,151,254,0.04)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {/* Served on */}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: '#B8B6D9', minWidth: 0 }}>
                        {partner.logo && (
                          <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(138,143,191,0.2)', overflow: 'hidden' }}>
                            <img src={partner.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO }}>
                          {partner.liveUrl ? extractDomain(partner.liveUrl) : partner.name}
                        </span>
                      </span>

                      {/* Total raised */}
                      <span style={{
                        fontSize: 12.5, color: '#7C9CFF',
                        fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                      }}>
                        {totalUsd != null ? `$${totalUsd.toLocaleString()}` : `${totalEth.toFixed(3)} ETH`}
                      </span>

                      {/* Current message */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontFamily: MONO, fontSize: 13, color: '#EDEEFF',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {winningMarkee?.message || '—'}
                        </div>
                      </div>

                      {/* Views */}
                      <span style={{ fontSize: 11, color: '#8A8FBF', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO }}>
                        <Eye size={10} style={{ opacity: 0.7 }} />
                        {(() => { const v = partnerViews.get(winningMarkee?.address?.toLowerCase() ?? ''); return v ? formatViews(v) : '—' })()}
                      </span>

                      {/* Price to change */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {priceUsd != null || priceToOvertakeEth != null ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setBuyModal({
                                leaderboardAddress: partner.leaderboardAddress as `0x${string}`,
                                topFundsAdded: winningMarkee?.totalFundsAdded ?? 0n,
                              })
                            }}
                            style={{
                              background: '#F897FE', color: '#060A2A', border: 'none',
                              borderRadius: 7, padding: '8px 10px',
                              fontFamily: MONO, fontWeight: 700, fontSize: 12.5,
                              cursor: 'pointer', whiteSpace: 'nowrap',
                              width: '100%', textAlign: 'center',
                              boxShadow: '0 2px 10px rgba(248,151,254,0.28)',
                            }}
                          >
                            {priceUsd != null
                              ? `$${priceUsd.toLocaleString()}`
                              : `${priceToOvertakeEth!.toFixed(3)} ETH`}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: '#8A8FBF', fontFamily: MONO }}>—</span>
                        )}
                      </div>
                    </a>
                  )
                })
            }
          </div>

          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <GhostButton href="/marketplace">View the Marketplace →</GhostButton>
          </div>
        </div>
      </section>

      {/* ── Raise Funding teaser ─────────────────────────────────────────── */}
      <section style={{ background: '#0A0F3D', padding: '88px 40px', borderTop: '1px solid rgba(138,143,191,0.2)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <SectionHead
            kicker="Raise Funding"
            title="Create a Markee and start earning"
            sub="Add a Markee to your website or open source repo in just a few clicks."
          />
          <div className="plat-grid-home">
            {PLATFORMS.map(p => <PlatformCard key={p.key} p={p} stats={platformStats[p.key]} />)}
          </div>
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <PrimaryButton href="/raise-funding">Create a Markee →</PrimaryButton>
          </div>
        </div>
      </section>

      {/* ── Own the Network ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: '#060A2A', padding: '96px 40px', borderTop: '1px solid rgba(138,143,191,0.2)' }}
      >
        <HeroBackground />
        <div className="relative z-10" style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ marginBottom: 18 }}><Eyebrow>Own the Network</Eyebrow></div>
          <h2 style={{
            margin: 0, fontSize: 'clamp(28px,4vw,46px)', fontWeight: 800,
            letterSpacing: -1, color: '#EDEEFF', lineHeight: 1.05,
          }}>
            Markee is cooperatively owned
          </h2>
          <p style={{ margin: '20px auto 0', color: '#B8B6D9', fontSize: 17, maxWidth: '54ch', lineHeight: 1.6 }}>
            We&apos;re digital-native, owned and governed on the Ethereum network. 100% owned by MARKEE holders, enforced onchain via RevNets and Gardens.
          </p>
          <RevnetBuyWidget compact />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <GhostButton href="/own-the-network">How ownership works →</GhostButton>
          </div>
        </div>
      </section>

      <Footer />

      <FixedPriceModal
        isOpen={modalMarkee !== null}
        onClose={() => setModalMarkee(null)}
        fixedMarkee={modalMarkee}
        onSuccess={() => setModalMarkee(null)}
      />

      {buyModal && (
        <BuyMessageModal
          isOpen={true}
          strategyAddress={buyModal.leaderboardAddress}
          topFundsAdded={buyModal.topFundsAdded}
          onClose={() => setBuyModal(null)}
          onSuccess={() => setBuyModal(null)}
        />
      )}
    </div>
  )
}
