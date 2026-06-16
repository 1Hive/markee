'use client'

import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { RewardsModal } from '@/components/modals/RewardsModal'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK   = '#F897FE'
const BLUE   = '#7C9CFF'
const GREEN  = '#1DB227'
const BG     = '#060A2A'
const BG2    = '#0A0F3D'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'
const MUTED  = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SuperfluidLeaderboard {
  address: string
  name: string
  totalFundsRaw: string
  markeeCount: number
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function priceToChange(lb: SuperfluidLeaderboard): bigint {
  return BigInt(lb.topFundsAddedRaw || '0') + BigInt('1000000000000000')
}

// ── Superfluid lightning SVG ──────────────────────────────────────────────────
function LightningIcon({ size = 12, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

// ── Eye SVG ───────────────────────────────────────────────────────────────────
function EyeIcon({ size = 10, color = MUTED }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

// ── Rocket SVG ────────────────────────────────────────────────────────────────
function RocketIcon({ size = 12, color = PINK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  )
}

// ── Boosted served-on cell ────────────────────────────────────────────────────
function BoostedServedOnCell({ entry }: { entry: BoostedLeaderboardEntry }) {
  const [logoError, setLogoError] = useState(false)
  const boxStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 6,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${BORDER}`,
    overflow: 'hidden',
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: TEXT2, minWidth: 0 }}>
      {entry.logoUrl && !logoError ? (
        <span style={boxStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.logoUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setLogoError(true)}
          />
        </span>
      ) : (
        <span style={{ ...boxStyle, background: 'rgba(29,178,39,0.14)' }}>
          <LightningIcon />
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {entry.name}
      </span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(29,178,39,0.12)',
        border: `1px solid rgba(29,178,39,0.3)`,
        color: GREEN,
        fontSize: 9,
        fontWeight: 700,
        fontFamily: MONO,
        padding: '2px 5px',
        borderRadius: 4,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        5x pts
      </span>
    </span>
  )
}

// ── Regular served-on cell ────────────────────────────────────────────────────
function RegularServedOnCell({ lb }: { lb: SuperfluidLeaderboard }) {
  const boxStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 6,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${BORDER}`,
    overflow: 'hidden',
    background: 'rgba(29,178,39,0.14)',
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: TEXT2, minWidth: 0 }}>
      <span style={boxStyle}>
        <LightningIcon />
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lb.name}
      </span>
    </span>
  )
}

// ── Buy button ────────────────────────────────────────────────────────────────
function BuyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick() }}
      style={{
        width: '100%',
        textAlign: 'center',
        background: PINK,
        color: BG,
        border: 'none',
        borderRadius: 7,
        padding: '8px 10px',
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 12.5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 10px rgba(248,151,254,0.28)',
        transition: 'transform 120ms, box-shadow 120ms',
      }}
      onMouseEnter={e => {
        e.stopPropagation()
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 6px 18px rgba(248,151,254,0.45)'
      }}
      onMouseLeave={e => {
        e.stopPropagation()
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'none'
        el.style.boxShadow = '0 2px 10px rgba(248,151,254,0.28)'
      }}
    >
      {label}
    </button>
  )
}

// ── Boosted table row ─────────────────────────────────────────────────────────
function BoostedTableRow({
  entry,
  viewsMap,
  ethPrice,
  onBuy,
}: {
  entry: BoostedLeaderboardEntry
  viewsMap: Map<string, number>
  ethPrice: number | null
  onBuy: () => void
}) {
  const [hover, setHover] = useState(false)
  const lb = entry.leaderboard!

  const totalEth = parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const priceEth = parseFloat(formatEther(priceToChange(lb)))
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`

  const addrKey = (lb.topMarkeeAddress || lb.address).toLowerCase()
  const views = viewsMap.get(addrKey) ?? 0

  const hasTopFunds = BigInt(lb.topFundsAddedRaw || '0') > 0n

  return (
    <a
      href={`/markee/${lb.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '190px 110px 1fr 74px 120px',
        gap: 16,
        padding: '11px 14px',
        textDecoration: 'none',
        borderBottom: `1px solid ${BORDER}`,
        background: hover ? 'rgba(248,151,254,0.04)' : 'transparent',
        transition: 'background 120ms',
        cursor: 'pointer',
        alignItems: 'center',
      }}
    >
      <BoostedServedOnCell entry={entry} />

      <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {totalLabel}
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lb.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
        </div>
      </div>

      <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        <EyeIcon />
        {views > 0 ? formatViews(views) : '—'}
      </span>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {hasTopFunds
          ? <BuyButton label={priceLabel} onClick={onBuy} />
          : <span style={{ color: MUTED, fontFamily: MONO, fontSize: 12, textAlign: 'right', width: '100%', display: 'block' }}>—</span>
        }
      </div>
    </a>
  )
}

// ── Regular table row ─────────────────────────────────────────────────────────
function RegularTableRow({
  lb,
  viewsMap,
  ethPrice,
  onBuy,
}: {
  lb: SuperfluidLeaderboard
  viewsMap: Map<string, number>
  ethPrice: number | null
  onBuy: () => void
}) {
  const [hover, setHover] = useState(false)

  const totalEth = parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const priceEth = parseFloat(formatEther(priceToChange(lb)))
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`

  const addrKey = (lb.topMarkeeAddress || lb.address).toLowerCase()
  const views = viewsMap.get(addrKey) ?? 0

  const hasTopFunds = BigInt(lb.topFundsAddedRaw || '0') > 0n

  return (
    <a
      href={`/markee/${lb.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '190px 110px 1fr 74px 120px',
        gap: 16,
        padding: '11px 14px',
        textDecoration: 'none',
        borderBottom: `1px solid ${BORDER}`,
        background: hover ? 'rgba(248,151,254,0.04)' : 'transparent',
        transition: 'background 120ms',
        cursor: 'pointer',
        alignItems: 'center',
      }}
    >
      <RegularServedOnCell lb={lb} />

      <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {totalLabel}
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lb.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
        </div>
      </div>

      <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        <EyeIcon />
        {views > 0 ? formatViews(views) : '—'}
      </span>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {hasTopFunds
          ? <BuyButton label={priceLabel} onClick={onBuy} />
          : <span style={{ color: MUTED, fontFamily: MONO, fontSize: 12, textAlign: 'right', width: '100%', display: 'block' }}>—</span>
        }
      </div>
    </a>
  )
}

// ── Table column headers ──────────────────────────────────────────────────────
function TableHeaders() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '190px 110px 1fr 74px 120px',
      gap: 16,
      padding: '11px 14px',
      borderBottom: `1px solid ${BORDER}`,
      background: BG,
      alignItems: 'center',
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Served On</span>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Total Raised</span>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Current Message</span>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Views</span>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Price to Change</span>
    </div>
  )
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px', gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}` }}>
          {[1, 2, 3, 4, 5].map(j => (
            <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
          ))}
        </div>
      ))}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SuperfluidPlatformPage() {
  const ethPrice = useEthPrice()
  const [leaderboards, setLeaderboards] = useState<SuperfluidLeaderboard[]>([])
  const [boostedLeaderboards, setBoostedLeaderboards] = useState<BoostedLeaderboardEntry[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [loading, setLoading] = useState(true)
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  const [buyModal, setBuyModal] = useState<{ address: string; topFundsAdded: bigint } | null>(null)
  const [rewardsOpen, setRewardsOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/superfluid/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setLeaderboards(data.leaderboards ?? [])
        setBoostedLeaderboards(data.boostedLeaderboards ?? [])
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Batch-fetch views for all top markees (boosted + regular)
  useEffect(() => {
    const addrs: string[] = []

    for (const entry of boostedLeaderboards) {
      const lb = entry.leaderboard
      if (lb?.topMarkeeAddress) addrs.push(lb.topMarkeeAddress.toLowerCase())
    }
    for (const lb of leaderboards) {
      if (lb.topMarkeeAddress) addrs.push(lb.topMarkeeAddress.toLowerCase())
    }

    const unique = Array.from(new Set(addrs))
    if (unique.length === 0) return

    fetch(`/api/views?addresses=${unique.join(',')}`)
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
  }, [leaderboards, boostedLeaderboards])

  const boostedAddressSet = new Set(boostedLeaderboards.map(b => b.address.toLowerCase()))

  const activeBoostedEntries = boostedLeaderboards.filter(
    entry => entry.leaderboard !== null &&
      BigInt(entry.leaderboard.topFundsAddedRaw || '0') > 0n && entry.leaderboard.topMessage
  )

  const regularRows = leaderboards.filter(
    lb => BigInt(lb.topFundsAddedRaw || '0') > 0n && lb.topMessage && !boostedAddressSet.has(lb.address.toLowerCase())
  )

  // Count active signs across boosted + regular
  const activeBoostedCount = boostedLeaderboards.filter(
    b => b.leaderboard && BigInt(b.leaderboard.topFundsAddedRaw || '0') > 0n
  ).length
  const activeRegularCount = leaderboards.filter(
    lb => BigInt(lb.topFundsAddedRaw || '0') > 0n && !boostedAddressSet.has(lb.address.toLowerCase())
  ).length
  const activeSignsCount = activeBoostedCount + activeRegularCount

  const totalEth = parseFloat(totalPlatformFunds)
  const totalLabel = ethPrice
    ? formatUsd(totalEth * ethPrice)
    : `${totalEth.toFixed(3)} ETH`

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="raise" useRegularLinks />

      {/* ── Hero ── */}
      <section style={{ position: 'relative', padding: '72px 40px 56px', borderBottom: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <HeroBackground />
        <div style={{ maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
            {/* Left */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flex: 1, minWidth: 280 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: BG2,
                border: `1px solid ${BORDER}`,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/partners/superfluid.png" alt="Superfluid" width={36} height={36} style={{ objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 800, color: TEXT, letterSpacing: -0.6, lineHeight: 1.1 }}>
                    Superfluid
                  </h1>
                  {/* Animated green pill */}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(29,178,39,0.12)',
                    border: `1px solid rgba(29,178,39,0.35)`,
                    color: GREEN,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 99,
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: GREEN,
                      display: 'inline-block',
                      animation: 'glowPulse 1.5s ease-in-out infinite',
                    }} />
                    Season 6 Rewards Active
                  </span>
                </div>
                <p style={{ margin: 0, color: TEXT2, fontSize: 15, maxWidth: '60ch', lineHeight: 1.55 }}>
                  A digital sign for your Superfluid project anyone can pay to edit. Boosted Markees earn 5x SUP points. Fund your favorite ecosystem project and earn!
                </p>
              </div>
            </div>

            {/* Right CTAs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
              <button
                onClick={() => setRewardsOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  color: PINK,
                  border: `1px solid rgba(248,151,254,0.4)`,
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
                </svg>
                View SUP Rewards
              </button>
              <Link
                href="/create-a-markee?platform=superfluid"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: PINK,
                  color: BG,
                  borderRadius: 8,
                  padding: '11px 20px',
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 18px rgba(248,151,254,0.35)',
                }}
              >
                Create a Superfluid Markee →
              </Link>
              <Link
                href="/marketplace"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'transparent',
                  color: TEXT2,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                See All Markees →
              </Link>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 32, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
              <span style={{ color: PINK, fontWeight: 700, fontFamily: MONO }}>{activeSignsCount}</span>
              <span style={{ color: MUTED }}>active signs</span>
            </div>
            <span style={{ color: BORDER, userSelect: 'none' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
              <span style={{ color: BLUE, fontWeight: 700, fontFamily: MONO }}>{totalLabel}</span>
              <span style={{ color: MUTED }}>total raised</span>
            </div>
            <span style={{ color: BORDER, userSelect: 'none' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ color: GREEN, fontWeight: 700, fontFamily: MONO }}>10M pts / ETH</span>
              <span style={{ color: MUTED }}>standard</span>
            </div>
            <span style={{ color: BORDER, userSelect: 'none' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <RocketIcon size={13} color={PINK} />
              <span style={{ color: PINK, fontWeight: 700, fontFamily: MONO }}>50M pts / ETH</span>
              <span style={{ color: MUTED }}>on Boosted</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Boosted Markees section ── */}
      <section style={{ padding: '44px 40px', background: BG2, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <RocketIcon size={16} color={PINK} />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Boosted Markees</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(29,178,39,0.12)',
              border: `1px solid rgba(29,178,39,0.3)`,
              color: GREEN,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 99,
              fontFamily: MONO,
            }}>
              5x pts
            </span>
          </div>

          <div style={{ background: BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <TableHeaders />
            {loading ? (
              <SkeletonRows count={4} />
            ) : activeBoostedEntries.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                No boosted markees yet this season.
              </div>
            ) : (
              activeBoostedEntries.map(entry => (
                <BoostedTableRow
                  key={entry.address}
                  entry={entry}
                  viewsMap={viewsMap}
                  ethPrice={ethPrice}
                  onBuy={() => setBuyModal({
                    address: entry.leaderboard!.address,
                    topFundsAdded: BigInt(entry.leaderboard!.topFundsAddedRaw || '0'),
                  })}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── All Markee Signs section ── */}
      <section style={{ padding: '44px 40px 80px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <LightningIcon size={16} color={GREEN} />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>All Markee Signs</span>
          </div>

          <div style={{ background: BG2, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <TableHeaders />
            {loading ? (
              <SkeletonRows count={4} />
            ) : regularRows.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                No community signs yet. Create a Markee for your Superfluid project to appear here.
              </div>
            ) : (
              regularRows.map(lb => (
                <RegularTableRow
                  key={lb.address}
                  lb={lb}
                  viewsMap={viewsMap}
                  ethPrice={ethPrice}
                  onBuy={() => setBuyModal({ address: lb.address, topFundsAdded: BigInt(lb.topFundsAddedRaw || '0') })}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── Raise Funding CTA ── */}
      <section style={{
        background: 'linear-gradient(135deg, rgba(124,156,255,0.12), rgba(124,156,255,0.06))',
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        padding: '64px 40px',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px,3vw,34px)', fontWeight: 800, color: TEXT, letterSpacing: -0.5, marginBottom: 10 }}>
            Add a Markee to your Superfluid project
          </h2>
          <p style={{ margin: '0 0 28px', color: TEXT2, fontSize: 15, maxWidth: '48ch', lineHeight: 1.55 }}>
            Create a sign for your project and start earning from every message purchase. Boosted signs earn 5x SUP points.
          </p>
          <Link
            href="/create-a-markee?platform=superfluid"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: PINK,
              color: BG,
              borderRadius: 8,
              padding: '13px 26px',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 20px rgba(248,151,254,0.35)',
            }}
          >
            Create a Superfluid Markee →
          </Link>
        </div>
      </section>

      <Footer />

      {buyModal && (
        <BuyMessageModal
          isOpen={true}
          initialMode="create"
          strategyAddress={buyModal.address as `0x${string}`}
          topFundsAdded={buyModal.topFundsAdded}
          platformId="superfluid"
          onClose={() => setBuyModal(null)}
          onSuccess={() => setBuyModal(null)}
        />
      )}

      <RewardsModal
        isOpen={rewardsOpen}
        onClose={() => setRewardsOpen(false)}
        title="Season 6 SUP Rewards"
        description="Earn points by buying messages. Boosted Markees earn 5× points."
      />
    </div>
  )
}
