'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatEther } from 'viem'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { RewardsModal } from '@/components/modals/RewardsModal'
import { StrategyBadge } from '@/components/StrategyBadge'
import { useStreamingRows } from '@/hooks/useStreamingRows'
import { type Strategy } from '@/lib/strategy'
import { MONO, PINK, BLUE, GREEN, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import { ModeratedContent } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

// ── Design tokens ─────────────────────────────────────────────────────────────

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
  strategy?: Strategy
  effectiveRateRaw?: string
  admin?: string
  creator?: string | null
}

interface BoostedLeaderboardEntry {
  address: string
  name: string
  logoUrl?: string
  projectUrl?: string
  multiplier: number
  leaderboard: SuperfluidLeaderboard | null
}

interface CampaignMetadata {
  name: string
  status: 'upcoming' | 'active' | 'ended'
  startTimestamp: number
  endTimestamp: number
  pointsPerEth: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
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
        {entry.multiplier}x pts
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
// ── Boosted table row ─────────────────────────────────────────────────────────
function BoostedTableRow({
  entry,
  viewsMap,
  ethPrice,
}: {
  entry: BoostedLeaderboardEntry
  viewsMap: Map<string, number>
  ethPrice: number | null
}) {
  const [hover, setHover] = useState(false)
  const lb = entry.leaderboard!

  const totalEth = parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const addrKey = (lb.topMarkeeAddress || lb.address).toLowerCase()
  const views = viewsMap.get(addrKey) ?? 0

  return (
    <Link
      href={`/markee/${lb.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '190px 110px 1fr 74px 120px 24px',
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

      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={lb.topMarkeeAddress ?? lb.address} boardAdmin={lb.admin} boardCreator={lb.creator} className="min-w-0">
          <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {lb.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
          </div>
        </ModeratedContent>
      </div>

      <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        <EyeIcon />
        {views > 0 ? formatViews(views) : '—'}
      </span>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ width: '100%', textAlign: 'center', background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 7, padding: '8px 10px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>Stream →</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <StrategyBadge strategy={lb.strategy ?? 'fixed'} iconOnly />
      </div>
    </Link>
  )
}

// ── Regular table row ─────────────────────────────────────────────────────────
function RegularTableRow({
  lb,
  viewsMap,
  ethPrice,
}: {
  lb: SuperfluidLeaderboard
  viewsMap: Map<string, number>
  ethPrice: number | null
}) {
  const [hover, setHover] = useState(false)

  const totalEth = parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const addrKey = (lb.topMarkeeAddress || lb.address).toLowerCase()
  const views = viewsMap.get(addrKey) ?? 0

  return (
    <Link
      href={`/markee/${lb.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '190px 110px 1fr 74px 120px 24px',
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

      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={lb.topMarkeeAddress ?? lb.address} boardAdmin={lb.admin} boardCreator={lb.creator} className="min-w-0">
          <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {lb.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
          </div>
        </ModeratedContent>
      </div>

      <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        <EyeIcon />
        {views > 0 ? formatViews(views) : '—'}
      </span>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ width: '100%', textAlign: 'center', background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 7, padding: '8px 10px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>Stream →</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <StrategyBadge strategy={lb.strategy ?? 'fixed'} iconOnly />
      </div>
    </Link>
  )
}

// ── Table column headers ──────────────────────────────────────────────────────
function TableHeaders() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '190px 110px 1fr 74px 120px 24px',
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
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Action</span>
      <span />
    </div>
  )
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px 24px', gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}` }}>
          {[1, 2, 3, 4, 5].map(j => (
            <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
          ))}
          <div />
        </div>
      ))}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SuperfluidPlatformPage() {
  const ethPrice = useEthPrice()
  const [boostMultipliers, setBoostMultipliers] = useState<Record<string, number>>({})
  const [campaign, setCampaign] = useState<CampaignMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  const [rewardsOpen, setRewardsOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/superfluid/rewards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setBoostMultipliers(data.boostMultipliers ?? {})
        setCampaign(data.campaign ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // This campaign covers every board registered by StreamingLeaderboardFactory,
  // regardless of the board's ecosystem placement tag.
  const streaming = useStreamingRows()
  const streamRows: SuperfluidLeaderboard[] = useMemo(
    () => streaming.map(row => ({ ...row, boosted: false })),
    [streaming],
  )
  const boostedLeaderboards: BoostedLeaderboardEntry[] = useMemo(
    () => streamRows
      .filter((row) => (boostMultipliers[row.address.toLowerCase()] ?? 1) > 1)
      .map((row) => ({
        address: row.address,
        name: row.name,
        multiplier: boostMultipliers[row.address.toLowerCase()],
        leaderboard: row,
      })),
    [streamRows, boostMultipliers],
  )

  // Batch-fetch views for all top markees (boosted + regular)
  useEffect(() => {
    const addrs: string[] = []

    for (const entry of boostedLeaderboards) {
      const lb = entry.leaderboard
      if (lb?.topMarkeeAddress) addrs.push(lb.topMarkeeAddress.toLowerCase())
    }
    for (const row of streaming) {
      if (row.topMarkeeAddress) addrs.push(row.topMarkeeAddress.toLowerCase())
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
  }, [boostedLeaderboards, streaming])

  const boostedAddressSet = new Set(boostedLeaderboards.map(b => b.address.toLowerCase()))

  const activeBoostedEntries = boostedLeaderboards.filter(
    entry => entry.leaderboard !== null &&
      BigInt(entry.leaderboard.topFundsAddedRaw || '0') > 0n && entry.leaderboard.topMessage
  )

  const regularRows = streamRows
    .filter(lb => BigInt(lb.topFundsAddedRaw || '0') > 0n && lb.topMessage && !boostedAddressSet.has(lb.address.toLowerCase()))
    .sort((a, b) => {
      const ar = BigInt(a.effectiveRateRaw || '0')
      const br = BigInt(b.effectiveRateRaw || '0')
      return br > ar ? 1 : br < ar ? -1 : 0
    })

  const activeSignsCount = streamRows.filter(
    (row) => BigInt(row.topFundsAddedRaw || '0') > 0n,
  ).length

  const totalWei = streamRows.reduce((total, row) => total + BigInt(row.totalFundsRaw || '0'), 0n)
  const totalEth = parseFloat(formatEther(totalWei))
  const totalLabel = ethPrice
    ? formatUsd(totalEth * ethPrice)
    : `${totalEth.toFixed(3)} ETH`
  const basePointsPerEth = Number(campaign?.pointsPerEth ?? 0)
  const maxMultiplier = Math.max(1, ...Object.values(boostMultipliers))

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="campaign" />

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
                    {campaign?.name ?? 'Superfluid Rewards'}
                  </span>
                </div>
                <p style={{ margin: 0, color: TEXT2, fontSize: 15, maxWidth: '60ch', lineHeight: 1.55 }}>
                  Earn SUP points from ETH streamed to For Rent Markee
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
              <span style={{ color: GREEN, fontWeight: 700, fontFamily: MONO }}>{basePointsPerEth.toLocaleString()} pts / ETH</span>
              <span style={{ color: MUTED }}>standard</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Boosted Markees section ── */}
      {boostedLeaderboards.length > 0 && (
        <section style={{ padding: '44px 40px', background: BG2, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <RocketIcon size={16} color={PINK} />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Boosted For Rent Markees</span>
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
              up to {maxMultiplier}x pts
            </span>
          </div>

          <div style={{ background: BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <TableHeaders />
            {loading ? (
              <SkeletonRows count={4} />
            ) : activeBoostedEntries.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                No boosted For Rent Markees are configured for this campaign.
              </div>
            ) : (
              activeBoostedEntries.map(entry => (
                <BoostedTableRow
                  key={entry.address}
                  entry={entry}
                  viewsMap={viewsMap}
                  ethPrice={ethPrice}
                />
              ))
            )}
          </div>
        </div>
        </section>
      )}

      {/* ── Create CTA between sections ── */}
      <section style={{ padding: '24px 40px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, color: TEXT2, fontSize: 14 }}>
            Want to earn SUP rewards? Create a For Rent Markee and receive ETH streams on Base.
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
              padding: '10px 20px',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 18px rgba(248,151,254,0.35)',
            }}
          >
            Create a For Rent Markee →
          </Link>
        </div>
      </section>

      {/* ── All Markee Signs section ── */}
      <section style={{ padding: '44px 40px 80px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <LightningIcon size={16} color={GREEN} />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>All For Rent Markees</span>
          </div>

          <div style={{ background: BG2, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <TableHeaders />
            {loading ? (
              <SkeletonRows count={4} />
            ) : regularRows.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                No active For Rent Markees yet. Create one for your project to appear here.
              </div>
            ) : (
              regularRows.map(lb => (
                <RegularTableRow
                  key={lb.address}
                  lb={lb}
                  viewsMap={viewsMap}
                  ethPrice={ethPrice}
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
            Add a For Rent Markee to your project
          </h2>
          <p style={{ margin: '0 0 28px', color: TEXT2, fontSize: 15, maxWidth: '48ch', lineHeight: 1.55 }}>
            Create a For Rent Markee for your project. Backers earn points on net ETH streamed during the campaign window; refunded ETH does not count.
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
            Create a For Rent Markee →
          </Link>
        </div>
      </section>

      <Footer />

      <RewardsModal
        isOpen={rewardsOpen}
        onClose={() => setRewardsOpen(false)}
      />
    </div>
  )
}
