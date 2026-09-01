'use client'

// Forked from app/ecosystem/platforms/superfluid/page.tsx (which this route used to re-export) so the
// campaign page can diverge -- this is the one place on the site that shows non-integrated Markees
// publicly (SUP eligibility doesn't require a verified integration), while every other listing only
// shows verified ones. Keep the ecosystem partner page and this one in sync by hand for shared
// look-and-feel, not by re-sharing the component.

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { formatEther } from 'viem'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd, logoDevUrl } from '@/lib/utils'
import { RewardsModal } from '@/components/modals/RewardsModal'
import { StrategyBadge } from '@/components/StrategyBadge'
import { type Strategy } from '@/lib/strategy'
import { MONO, PINK, BLUE, GREEN, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import { ModeratedContent } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

const PURP = '#7B6AF4'
const SECONDS_IN_MONTH = 2_628_000n

// ── Types ─────────────────────────────────────────────────────────────────────
interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl?: string
  filePath: string
  verified: boolean
}

interface SuperfluidLeaderboard {
  address: string
  name: string
  leaderboardName?: string
  logoUrl?: string | null
  verifiedUrl?: string | null
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  status?: string
  platform?: string
  totalFundsRaw: string
  markeeCount: number
  topFundsAddedRaw: string
  topMessage: string | null
  topMessageOwner: string | null
  topMarkeeAddress: string | null
  effectiveRateRaw: string
  boosted: boolean
  strategy?: Strategy
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

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// A board counts as "integrated" once it has a verified URL OR a verified GitHub linked file (the
// same two verification paths /marketplace's own ServedLogo/servedOnLabel already recognize) --
// SUP eligibility doesn't require this (any active stream earns points regardless), so this is
// purely a display distinction between "actually embedded somewhere we've confirmed" and
// "registered but not yet verified."
function hasVerifiedGithubFile(lb: SuperfluidLeaderboard): boolean {
  return (lb.linkedFiles ?? []).some(f => f.verified)
}

function isIntegrated(lb: SuperfluidLeaderboard): boolean {
  return !!lb.verifiedUrl || (lb.verifiedUrls?.length ?? 0) > 0 || hasVerifiedGithubFile(lb)
}

function monthlyRateLabel(lb: SuperfluidLeaderboard, ethPrice: number | null): string {
  const rate = BigInt(lb.effectiveRateRaw || '0')
  const monthlyEth = parseFloat(formatEther(rate * SECONDS_IN_MONTH))
  return ethPrice ? `${formatUsd(monthlyEth * ethPrice)}/mo` : `${monthlyEth.toFixed(3)} ETH/mo`
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

// ── Verified globe SVG ────────────────────────────────────────────────────────
function LiveDot() {
  return (
    <span style={{ width: 6, height: 6, borderRadius: 99, background: GREEN, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
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

// ── Live (integrated) served-on cell -- shows the real verified site, not a platform icon ─────────
function LiveServedLogo({ lb }: { lb: SuperfluidLeaderboard }) {
  const [failed, setFailed] = useState(false)
  const box: React.CSSProperties = { width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BORDER}`, overflow: 'hidden' }
  const primaryUrl = lb.verifiedUrl || lb.verifiedUrls?.[0] || null
  let hostname: string | null = null
  if (primaryUrl) { try { hostname = new URL(primaryUrl).hostname } catch { /* ignore */ } }
  if (hostname && !failed) {
    return (
      <span style={box}>
        <Image src={logoDevUrl(hostname)} alt={`${hostname} logo`} width={22} height={22} style={{ objectFit: 'contain' }} onError={() => setFailed(true)} />
      </span>
    )
  }
  const verifiedFile = (lb.linkedFiles ?? []).find(f => f.verified)
  if (!hostname && verifiedFile) {
    return (
      <span style={{ ...box, background: 'rgba(237,238,255,0.08)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={TEXT2}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
      </span>
    )
  }
  const raw = hostname || lb.leaderboardName || lb.name || '?'
  const ch = (raw[0] || '?').toUpperCase()
  const tints = [PINK, BLUE, PURP]
  const tint = tints[raw.length % tints.length]
  return <span style={{ ...box, background: `${tint}22`, color: tint, fontFamily: MONO, fontWeight: 700, fontSize: 11 }}>{ch}</span>
}

function liveServedOnLabel(lb: SuperfluidLeaderboard): string {
  const primaryUrl = lb.verifiedUrl || lb.verifiedUrls?.[0]
  if (primaryUrl) {
    const domain = extractDomain(primaryUrl)
    const extra = (lb.verifiedUrls?.length ?? 1) - 1
    return extra > 0 ? `${domain} +${extra}` : domain
  }
  const verifiedFile = (lb.linkedFiles ?? []).find(f => f.verified)
  if (verifiedFile) return verifiedFile.repoFullName
  return lb.leaderboardName || lb.name
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

// ── Shared grid ───────────────────────────────────────────────────────────────
const ROW_COLS = '190px 110px 1fr 74px 120px 24px'

// ── Live (integrated) table row -- mirrors /marketplace's For Rent row ─────────
function LiveTableRow({
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
        gridTemplateColumns: ROW_COLS,
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: TEXT2, minWidth: 0 }}>
        <LiveServedLogo lb={lb} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO }}>
          {liveServedOnLabel(lb)}
        </span>
      </span>

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
        <span style={{ width: '100%', textAlign: 'center', background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 7, padding: '8px 10px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>
          {monthlyRateLabel(lb, ethPrice)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <StrategyBadge strategy="streaming" iconOnly />
      </div>
    </Link>
  )
}

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
        gridTemplateColumns: ROW_COLS,
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
        gridTemplateColumns: ROW_COLS,
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
function TableHeaders({ actionLabel = 'Action' }: { actionLabel?: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: ROW_COLS,
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
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>{actionLabel}</span>
      <span />
    </div>
  )
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}` }}>
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
export default function SuperfluidCampaignPage() {
  const ethPrice = useEthPrice()
  const [boostMultipliers, setBoostMultipliers] = useState<Record<string, number>>({})
  const [campaign, setCampaign] = useState<CampaignMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  const [rewardsOpen, setRewardsOpen] = useState(false)
  const [streamRows, setStreamRows] = useState<SuperfluidLeaderboard[]>([])

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

  // Fetched directly (not via useStreamingRows) so we get verifiedUrl/verifiedUrls/logoUrl/admin --
  // needed to tell integrated boards apart from registered-but-unverified ones. This campaign covers
  // every board registered by StreamingLeaderboardFactory, regardless of ecosystem placement tag.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/streaming/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { leaderboards?: SuperfluidLeaderboard[] } | null) => {
        if (!data || cancelled) return
        setStreamRows((data.leaderboards ?? []).map(row => ({ ...row, boosted: false })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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
    for (const row of streamRows) {
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
  }, [boostedLeaderboards, streamRows])

  const boostedAddressSet = new Set(boostedLeaderboards.map(b => b.address.toLowerCase()))

  const activeBoostedEntries = boostedLeaderboards.filter(
    entry => entry.leaderboard !== null &&
      BigInt(entry.leaderboard.topFundsAddedRaw || '0') > 0n && entry.leaderboard.topMessage
  )

  const activeRows = streamRows.filter(lb => BigInt(lb.topFundsAddedRaw || '0') > 0n && lb.topMessage)

  // "Live" (integrated): verified boards, shown regardless of boosted status -- this is the
  // marketplace-style highlight table. "All" below still includes everything, boosted or not,
  // integrated or not -- this campaign page is the one place non-integrated Markees show publicly.
  const liveRows = activeRows
    .filter(isIntegrated)
    .sort((a, b) => {
      const ar = BigInt(a.effectiveRateRaw || '0')
      const br = BigInt(b.effectiveRateRaw || '0')
      return br > ar ? 1 : br < ar ? -1 : 0
    })

  const regularRows = activeRows
    .filter(lb => !boostedAddressSet.has(lb.address.toLowerCase()))
    .sort((a, b) => {
      const ar = BigInt(a.effectiveRateRaw || '0')
      const br = BigInt(b.effectiveRateRaw || '0')
      return br > ar ? 1 : br < ar ? -1 : 0
    })

  const activeSignsCount = activeRows.length

  const totalWei = streamRows.reduce((total, row) => total + BigInt(row.totalFundsRaw || '0'), 0n)
  const totalEth = parseFloat(formatEther(totalWei))
  const totalLabel = ethPrice
    ? formatUsd(totalEth * ethPrice)
    : `${totalEth.toFixed(3)} ETH`
  const basePointsPerEth = Number(campaign?.pointsPerEth ?? 0)
  const maxMultiplier = Math.max(1, ...Object.values(boostMultipliers))

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header />

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
                  Every streaming payment to a For Rent Markee sign earns both MARKEE and SUP.
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

      {/* ── Live (integrated) Superfluid Markees ── */}
      <section style={{ padding: '44px 40px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <LiveDot />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Live Superfluid Markees</span>
          </div>
          <p style={{ margin: '0 0 20px', color: MUTED, fontSize: 13.5 }}>
            Verified, embedded on a real site -- the same table shown for For Rent signs on /marketplace.
          </p>

          <div style={{ background: BG2, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <TableHeaders actionLabel="Rate" />
            {loading ? (
              <SkeletonRows count={4} />
            ) : liveRows.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                No verified integrations yet. Streaming still earns SUP points before verification --
                see all Superfluid Markees below.
              </div>
            ) : (
              liveRows.map(lb => (
                <LiveTableRow
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

      {/* ── All Superfluid Markees section -- the only place non-integrated Markees show publicly ── */}
      <section style={{ padding: '44px 40px 80px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <LightningIcon size={16} color={GREEN} />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>All Superfluid Markees</span>
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
