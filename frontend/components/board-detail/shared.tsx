'use client'

// Shared building blocks for the /markee/[address] board-detail pages: the fixed-price detail and the
// streaming detail render the same hero card, metrics bar, embed/verify panel and skeleton from here.

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatEther } from 'viem'
import { ratePerSecToMonthly } from '@/lib/superfluid/streaming'
import { Eye, ExternalLink, ChevronDown, ChevronRight, Coins, Loader2, MessageSquare, RefreshCw, User, Zap } from 'lucide-react'
import { ModeratedContent, FlagButton } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getAddressUrl, getTxUrl } from '@/lib/explorer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StrategyBadge } from '@/components/StrategyBadge'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'
import { TxSteps, TxProgress } from '@/components/modals/StreamUI'

// ── Design tokens ─────────────────────────────────────────────────────────────
import { MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'
import { logoDevUrl } from '@/lib/utils'
export { MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER }
export const BOARD_LB_COLS = '42px 150px 120px minmax(260px,1fr) 70px 170px'

export const HERO_GRAD = [
  'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
  'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
  'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
].join(', ')

// ── Brand watermark ───────────────────────────────────────────────────────────
// The real Markee logo (public/markee-logo-purple.png), translucent purple, centered in the card
// behind the message/pill content, shared hover trigger as the price pill.
//
// Rendered as a plain low-opacity <img> -- no blend mode, no CSS mask. Earlier versions tried
// mix-blend-mode tricks and a CSS luminance mask to hide the PNG's own square background and show
// "just the letters" in an arbitrary tint color, chasing a corner-bled design that turned out to
// collide with message text and, in the masked version, real-world mask-mode support was
// inconsistent enough to render as nothing at all. A centered, genuinely translucent placement of
// the actual purple asset sidesteps all of that -- there's no background to hide since low opacity
// already reads as a soft brand tint, and centering keeps it clear of text that starts near the
// card's edges rather than needing pixel-precise corner-collision math. (An even earlier version
// recreated "MAR"/"KEE" as plain CSS text in a guessed font, which visibly mismatched the real
// logo's letterforms -- M/A/R reading heavier than K/E/E at the same font-size. Using the real
// asset avoids that too.)
//
// z-index -1 on the wrapper below so it paints behind the card's normal in-flow content without
// needing to touch that content's own stacking -- but that only works if the parent card is ALSO an
// explicit stacking context (position + a set z-index, not just position:relative alone), otherwise
// the negative z-index can escape and paint behind far-away ancestors. Give the card container
// `zIndex: 0` (or any number) alongside its existing `position: relative` when using this component.
export function MarkeeWatermark({ show }: { show: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', zIndex: -1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/markee-logo-purple.png"
        alt=""
        aria-hidden
        style={{
          // Sized to the card's own height (the wrapper is inset:0, so 100% here is exactly
          // the card's height) rather than a fixed clamp() range -- this way it's correctly
          // proportioned whether it's sitting in a compact reader-card or a tall hero card,
          // with no per-usage size tuning needed. Width follows automatically from the image's
          // own aspect ratio; overflow:hidden on the wrapper above clips it on unusually
          // narrow/tall cards instead of letting it spill past the card edge.
          height: '100%', width: 'auto',
          opacity: show ? 0.16 : 0, transition: 'opacity 220ms ease',
        }}
      />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function fmtAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

// Effective rate (wei/sec) → human "X ETH/mo". Rounds to 4dp and strips trailing zeros so a rate the
// user picked as a clean number (e.g. 0.004) doesn't round-trip through the on-chain per-second
// integer division and come back out as 0.00399999999942.
export function formatRate(weiPerSec: bigint): string {
  const eth = parseFloat(formatEther(ratePerSecToMonthly(weiPerSec)))
  if (eth === 0) return '0 ETH/mo'
  if (eth < 0.00005) return '< 0.0001 ETH/mo' // would round to 0.0000 at 4 dp
  return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
}

// ── Stream status icon (green active / yellow pending-not-winning / red cancelled) ─────────────────
// Shared by /account's tables and the "Manage Your Stream" flow -- both need the same tri-state read
// of a backer's position on a streaming board.
export type StreamStatus = 'active' | 'pending' | 'cancelled'

export function streamStatusOf(isTop: boolean, flowRateRaw: string | bigint | undefined): StreamStatus {
  const rate = typeof flowRateRaw === 'bigint' ? flowRateRaw : BigInt(flowRateRaw ?? '0')
  if (rate === 0n) return 'cancelled'
  return isTop ? 'active' : 'pending'
}

const STREAM_STATUS_GOLD = '#FFD45E'
export const STREAM_STATUS_META: Record<StreamStatus, { color: string; label: string; tip: string }> = {
  active:    { color: GREEN,   label: 'Active',    tip: 'This message is winning and your payment is streaming.' },
  pending:   { color: STREAM_STATUS_GOLD, label: 'Not Winning', tip: "This message isn't winning. Your stream is being fully refunded until you take the top spot." },
  cancelled: { color: '#F87171', label: 'Stopped', tip: 'This stream has been cancelled. Reactivate to get your message featured.' },
}

export function StreamStatusIcon({ status }: { status: StreamStatus }) {
  const [open, setOpen] = useState(false)
  const { color, tip } = STREAM_STATUS_META[status]
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0,
        boxShadow: status === 'active' ? `0 0 6px ${color}` : 'none',
        animation: status === 'active' ? 'glowPulse 1.5s ease-in-out infinite' : 'none',
      }} />
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          width: 230, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '8px 10px', zIndex: 50, boxShadow: '0 12px 34px rgba(0,0,0,0.5)',
          color: TEXT2, fontSize: 11.5, lineHeight: 1.45, whiteSpace: 'normal',
          fontFamily: 'inherit', fontWeight: 400, pointerEvents: 'none',
        }}>
          {tip}
        </span>
      )}
    </span>
  )
}

// How many decimal places a live-ticking value needs so its last digit visibly moves about once a
// second, given how fast it's accruing per second. Used to size both useLiveBalance's re-render
// resolution and the display formatting -- picking too few decimals (e.g. a fixed 4dp) makes a
// slow, real accrual look frozen for tens of seconds at a time.
export function decimalsForRate(perSecond: number, min: number, max: number): number {
  if (!isFinite(perSecond) || perSecond <= 0) return max
  const needed = Math.ceil(-Math.log10(perSecond)) + 1
  return Math.min(max, Math.max(min, needed))
}

// Wei/sec convenience wrapper (perSecond is in wei, decimals are for the ETH-denominated display).
export function decimalsForWeiRate(weiPerSecond: bigint, min = 4, max = 14): number {
  return decimalsForRate(Number(weiPerSecond) / 1e18, min, max)
}

// formatUsd (lib/utils) caps at 2dp -- too coarse to show a live-ticking $ total moving at typical
// stream rates. Pass decimalsForRate(usdPerSecond, 2, N) as `decimals`.
export function formatLiveUsd(usd: number, decimals: number): string {
  return `$${usd.toFixed(decimals)}`
}

// Seconds -> "Xd Xh" (or "Xh Xm" under a day, "Xm" under an hour).
// includeSeconds: for a duration that's actively ticking on screen (e.g. "time featured" while a
// message is currently #1), so the display visibly grows instead of only updating once a minute.
export function formatDuration(seconds: number, includeSeconds = false): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const secs = s % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return includeSeconds ? `${hours}h ${minutes}m ${secs}s` : `${hours}h ${minutes}m`
  return includeSeconds ? `${minutes}m ${secs}s` : `${minutes}m`
}


// ── Platform / served-on info from ecosystem API ──────────────────────────────
export interface LinkedFile {
  repoFullName: string; repoOwner: string; repoName: string
  repoAvatarUrl: string; repoHtmlUrl: string; filePath: string; verified: boolean
}
export interface EcoEntry {
  address: string; platform: string
  verifiedUrl?: string; verifiedUrls?: string[]
  logoUrl?: string; leaderboardName?: string
  linkedFiles?: LinkedFile[]
}

export function useServedOn(leaderboardAddress: string) {
  const [entry, setEntry] = useState<EcoEntry | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!leaderboardAddress) return
    setLoading(true)
    const addr = leaderboardAddress.toLowerCase()
    // Website and GitHub integrations are both address-keyed, independent of which platform the
    // board was originally created/tagged under (a "website"-platform board can still have a
    // verified linked GitHub file, and vice versa) -- so verification-status is fetched
    // unconditionally rather than only when the ecosystem listing happens to tag this board 'github'.
    Promise.all([
      fetch('/api/ecosystem/leaderboards', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/account/verification-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: [addr] }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([ecoData, verData]) => {
      const found = (ecoData?.leaderboards as EcoEntry[] | undefined)?.find(
        lb => lb.address.toLowerCase() === addr
      )
      const v = verData?.[addr] as { verifiedUrls?: string[]; linkedFiles?: LinkedFile[] } | undefined
      if (!found && !v) return
      setEntry({
        ...(found ?? { address: leaderboardAddress, platform: 'website' }),
        verifiedUrls: v?.verifiedUrls?.length ? v.verifiedUrls : found?.verifiedUrls,
        linkedFiles: v?.linkedFiles ?? found?.linkedFiles,
      })
    }).finally(() => setLoading(false))
  }, [leaderboardAddress])
  return { entry, loading }
}

// ── Shared SVG icons ──────────────────────────────────────────────────────────
export const GithubIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
)

// ── Platform cell ─────────────────────────────────────────────────────────────
export function PlatformCell({ entry }: { entry: EcoEntry | null }) {
  if (!entry) return <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>—</span>

  if (entry.platform === 'github') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 14, color: TEXT }}>
        <GithubIcon size={15} color={TEXT2} />
        GitHub
      </span>
    )
  }
  if (entry.platform === 'superfluid') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 14, color: TEXT }}>
        <img src="/partners/superfluid.png" width={15} height={15} alt="" style={{ borderRadius: 3, objectFit: 'contain' }} />
        Superfluid
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 14, color: TEXT }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TEXT2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      Open Internet
    </span>
  )
}

// ── Served On cell ────────────────────────────────────────────────────────────
// Root domain (or GitHub org) with logo, ranked by actual traffic where it's trackable (GitHub's own
// per-repo traffic API; website via the per-URL view counts the embed's tracking snippet reports --
// see lib/embedPrompt/fragments.ts). The expand chevron is always available, not just when there's
// more than one integration, since it's also the only entry point to "+ Add to Your Site" here.
function getLogoDomain(url: string): string | null {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '') } catch { return null }
}

function SiteLogo({ domain, size = 16 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.75, flexShrink: 0, lineHeight: 1 }}>🪧</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoDevUrl(domain)}
      alt="" width={size} height={size}
      style={{ objectFit: 'contain', borderRadius: 3, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  )
}

export function ServedOnCell({ entry, loading, markeeAddress, onAddToSite }: {
  entry: EcoEntry | null
  /** Still resolving useServedOn -- distinguishes "not verified yet" from "genuinely nothing linked". */
  loading?: boolean
  /** Top markee's address -- view counts are tracked per-markee, not per-leaderboard. */
  markeeAddress?: string
  onAddToSite?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Rendered through a portal (see below) so the dropdown isn't clipped by the hero section's
  // overflow:hidden (needed there for the scanline/background effect) -- position computed from the
  // trigger's bounding rect since it's no longer a CSS-positioned descendant of it.
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const reposition = () => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 8, left: rect.left })
    }
    reposition()
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  // A board can carry both a verified website URL and a verified linked GitHub file at once (they're
  // independent, address-keyed integrations) -- so both are fetched and rendered together, unioned
  // and sorted by views, rather than picking one type based on the board's platform tag.
  const files = (entry?.linkedFiles ?? []).filter(f => f.verified)
  const urls = entry?.verifiedUrls?.length ? entry.verifiedUrls : entry?.verifiedUrl ? [entry.verifiedUrl] : []

  const [repoTraffic, setRepoTraffic] = useState<Record<string, number>>({})
  const [repoTrafficLoaded, setRepoTrafficLoaded] = useState(false)
  useEffect(() => {
    if (!entry?.address || files.length === 0) { setRepoTrafficLoaded(true); return }
    setRepoTrafficLoaded(false)
    fetch(`/api/github/traffic-multi?address=${entry.address}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { repos?: Record<string, { count: number }> }) => {
        if (!d?.repos) return
        const m: Record<string, number> = {}
        for (const [repo, t] of Object.entries(d.repos)) m[repo] = t.count
        setRepoTraffic(m)
      })
      .catch(() => {})
      .finally(() => setRepoTrafficLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.address, files.length])

  const [urlViews, setUrlViews] = useState<Record<string, number>>({})
  const [urlViewsLoaded, setUrlViewsLoaded] = useState(false)
  useEffect(() => {
    if (urls.length === 0 || !markeeAddress) { setUrlViewsLoaded(true); return }
    setUrlViewsLoaded(false)
    fetch(`/api/views?address=${markeeAddress}&urls=${urls.map(encodeURIComponent).join('||')}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, number> | null) => { if (d) setUrlViews(d) })
      .catch(() => {})
      .finally(() => setUrlViewsLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('||'), markeeAddress])

  if (!entry) {
    if (loading) return <ViewsSpinner size={14} color={MUTED} />
    return (
      <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, background: 'rgba(138,143,191,0.08)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' as const }}>
        No Verified URLs
      </span>
    )
  }

  const fileUrl = (f: LinkedFile) => `https://github.com/${f.repoFullName}/blob/HEAD/${f.filePath}`
  const clean = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const href = (u: string) => u.startsWith('http') ? u : `https://${u}`
  const host = (u: string) => getLogoDomain(u) ?? clean(u)

  type Item = { kind: 'file'; file: LinkedFile; views: number; viewsLoaded: boolean } | { kind: 'url'; url: string; views: number; viewsLoaded: boolean }
  const items: Item[] = [
    ...files.map(file => ({ kind: 'file' as const, file, views: repoTraffic[file.repoFullName] ?? 0, viewsLoaded: repoTrafficLoaded })),
    ...urls.map(url => ({ kind: 'url' as const, url, views: urlViews[url] ?? 0, viewsLoaded: urlViewsLoaded })),
  ].sort((a, b) => b.views - a.views)

  const hasAny = items.length > 0
  const extra = items.length - 1
  const top = items[0]
  const topDomain = top?.kind === 'url' ? getLogoDomain(top.url) : null

  const dropdownRowStyle: React.CSSProperties = {
    color: TEXT2, textDecoration: 'none', fontSize: 12, padding: '7px 10px', borderRadius: 7,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    transition: 'background 100ms, color 100ms',
  }
  const hoverIn = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = BG; (e.currentTarget as HTMLElement).style.color = PINK }
  const hoverOut = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Hide integrations' : 'Show all integrations'}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, cursor: 'pointer' }}
      >
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      <span style={{ minWidth: 0, overflow: 'hidden', flex: '1 1 auto' }}>
        {hasAny && top ? (
          top.kind === 'file' ? (
            <a href={fileUrl(top.file)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 13, color: TEXT, textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}
              title={`${top.file.repoFullName}/${top.file.filePath}`}
            >
              <GithubIcon size={16} color={TEXT2} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${MUTED}` }}>{top.file.repoOwner}</span>
              <ExternalLink size={15} color={MUTED} style={{ flexShrink: 0 }} />
            </a>
          ) : (
            <a href={href(top.url)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 13, color: TEXT, textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}
              title={clean(top.url)}
            >
              {topDomain ? <SiteLogo domain={topDomain} /> : <span style={{ flexShrink: 0 }}>🪧</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${MUTED}` }}>{host(top.url)}</span>
              <ExternalLink size={15} color={MUTED} style={{ flexShrink: 0 }} />
            </a>
          )
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>No Verified URLs</span>
        )}
      </span>

      {extra > 0 && (
        <span style={{ flexShrink: 0, background: 'rgba(138,143,191,0.15)', border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 99, padding: '2px 7px', fontFamily: MONO, fontSize: 11, fontWeight: 700, lineHeight: 1.4 }}>
          +{extra}
        </span>
      )}

      {open && menuPos && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, minWidth: 260, zIndex: 200, boxShadow: '0 16px 44px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {onAddToSite && (
            <button
              onClick={() => { setOpen(false); onAddToSite() }}
              style={{ color: PINK, background: `${PINK}14`, border: `1px solid rgba(248,151,254,0.3)`, textDecoration: 'none', fontSize: 12, fontWeight: 700, fontFamily: MONO, padding: '8px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: hasAny ? 6 : 0 }}
            >
              + Add to Your Site
            </button>
          )}
          {items.map(item => item.kind === 'file' ? (
            <a key={`${item.file.repoFullName}/${item.file.filePath}`} href={fileUrl(item.file)} target="_blank" rel="noopener noreferrer"
              style={dropdownRowStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
                <GithubIcon size={12} color="currentColor" />
                <span style={{ fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.repoName}/{item.file.filePath}</span>
                <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
              </span>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: MONO, color: MUTED }}>
                <Eye size={10} style={{ opacity: 0.7 }} /> {item.viewsLoaded ? formatViews(item.views) : <ViewsSpinner size={9} />}
              </span>
            </a>
          ) : (
            <a key={item.url} href={href(item.url)} target="_blank" rel="noopener noreferrer"
              style={dropdownRowStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(item.url)}</span>
                <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
              </span>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: MONO, color: MUTED }}>
                <Eye size={10} style={{ opacity: 0.7 }} /> {item.viewsLoaded ? formatViews(item.views) : <ViewsSpinner size={9} />}
              </span>
            </a>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Metrics bar ───────────────────────────────────────────────────────────────
export function MetricValue({ text, color = TEXT, title }: { text: string; color?: string; title?: string }) {
  return (
    <span title={title} style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', cursor: title ? 'default' : undefined }}>{text}</span>
  )
}

export function MetricsBar({ address, entry, entryLoading, topMarkeeAddress, onAddToSite, totalViews, viewsLoading, markeeCount, messagesLoading, totalLabel, totalNode, messagesLabel = 'Messages bought' }: {
  address: string
  entry: EcoEntry | null
  entryLoading?: boolean
  topMarkeeAddress?: string
  onAddToSite?: () => void
  // Sum of views across every message on this board, not just the current top one.
  totalViews: number
  viewsLoading?: boolean
  markeeCount: number
  messagesLoading?: boolean
  totalLabel: string
  totalNode: React.ReactNode
  messagesLabel?: string
}) {
  const cell = (label: string, node: React.ReactNode) => (
    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{label}</span>
      {node}
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, padding: '26px 0 6px', borderTop: `1px solid ${BORDER}` }}>
      {cell('Served on', <ServedOnCell entry={entry} loading={entryLoading} markeeAddress={topMarkeeAddress} onAddToSite={onAddToSite} />)}
      {cell(totalLabel, totalNode)}
      {cell('Total views', viewsLoading ? <ViewsSpinner size={16} color={BLUE} /> : <MetricValue text={formatViews(totalViews)} color={BLUE} />)}
      {cell(messagesLabel, messagesLoading ? <ViewsSpinner size={16} color={TEXT} /> : <MetricValue text={markeeCount.toLocaleString()} />)}
      {cell('Contract address',
        <a href={getAddressUrl(CANONICAL_CHAIN_ID, address)} target="_blank" rel="noopener noreferrer"
          style={{ alignSelf: 'flex-start', fontFamily: MONO, fontSize: 15, color: PINK, textDecoration: 'none', borderBottom: `1px dotted ${PINK}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {fmtAddr(address)} <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}

// ── Featured top-message card ─────────────────────────────────────────────────
export function FeaturedCard({ markeeAddress, message, displayName, ownerAddress, views, viewsLoading, pillLabel, onClick, strategy }: {
  markeeAddress: string
  message: string
  displayName?: string
  ownerAddress?: string
  views: number
  viewsLoading?: boolean
  pillLabel?: string
  onClick: () => void
  strategy: 'fixed' | 'streaming'
}) {
  const [hover, setHover] = useState(false)

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, boxShadow: `0 0 12px ${PINK}`, flexShrink: 0 }} />
        <StrategyBadge strategy={strategy} size="md" />
        <span style={{ flex: 1, height: 1, background: BORDER, marginLeft: 8 }} />
      </div>

      <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={markeeAddress}>
        <button
          onClick={onClick}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: 'relative', zIndex: 0, width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
            borderRadius: 16, padding: '18px 26px 22px', backdropFilter: 'blur(4px)',
            transition: 'border-color 180ms, transform 180ms, box-shadow 180ms',
            transform: hover ? 'translateY(-2px)' : 'none',
            boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
            fontFamily: 'Manrope, system-ui, sans-serif',
          }}
        >
          <MarkeeWatermark show={hover} />

          {/* top-right: views + flag */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 13, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
            <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markeeAddress} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: BLUE }}>
              <Eye size={10} style={{ opacity: 0.7 }} /> {viewsLoading ? <ViewsSpinner size={10} /> : formatViews(views)}
            </span>
          </div>

          {/* message */}
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 'clamp(20px, 3vw, 34px)', lineHeight: 1.12, letterSpacing: '-0.02em', textWrap: 'balance' as any, background: `linear-gradient(120deg, ${TEXT} 0%, ${PINK} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {message}
          </div>

          {/* bottom-right: author */}
          {(displayName || ownerAddress) && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, fontSize: 13, color: TEXT2, flexWrap: 'wrap' }}>
              <span style={{ color: MUTED }}>-</span>
              {displayName && <span style={{ color: TEXT }}>{displayName}</span>}
              {ownerAddress && <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11 }}>{fmtAddr(ownerAddress)}</span>}
            </div>
          )}

          {/* hover pill -- brand watermark now lives as the large MarkeeWatermark behind the whole
              card (see above), not a small logo inside the pill; same hover trigger, same fade, on
              every Markee card with a hover price badge (see also FeaturedHero on /marketplace and
              the home page hero cards). */}
          {pillLabel && (
            <span style={{ position: 'absolute', bottom: -15, left: '50%', transform: `translateX(-50%) ${hover ? 'translateY(0)' : 'translateY(4px)'}`, display: 'inline-flex', alignItems: 'center', gap: 8, background: PINK, color: BG, fontFamily: MONO, fontWeight: 700, fontSize: 13, padding: '3px 18px', borderRadius: 8, whiteSpace: 'nowrap' as const, boxShadow: '0 8px 28px rgba(248,151,254,0.42)', opacity: hover ? 1 : 0, transition: 'opacity 180ms, transform 180ms', pointerEvents: 'none', zIndex: 3 }}>
              {pillLabel}
            </span>
          )}
        </button>
      </ModeratedContent>
    </div>
  )
}

// ── Embed panel ───────────────────────────────────────────────────────────────
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    }).catch(() => {})
  }
  return (
    <button
      onClick={copy}
      style={{
        background: done ? `${GREEN}22` : 'rgba(138,143,191,0.1)',
        color: done ? GREEN : MUTED,
        border: `1px solid ${done ? GREEN + '44' : 'rgba(138,143,191,0.15)'}`,
        borderRadius: 6, padding: '4px 10px',
        fontFamily: MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'all 140ms', whiteSpace: 'nowrap' as const,
      }}
    >
      {done ? 'Copied!' : 'Copy'}
    </button>
  )
}

export function CodeBlock({ code, label, hideCopy, noWrap }: { code: string; label?: string; hideCopy?: boolean; noWrap?: boolean }) {
  const showHeader = label || !hideCopy
  return (
    <div>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>
            {label ?? ''}
          </span>
          {!hideCopy && <CopyButton text={code} />}
        </div>
      )}
      <div style={{
        background: '#030714', border: `1px solid rgba(138,143,191,0.15)`, borderRadius: 10, padding: '14px 16px',
        maxHeight: 220, overflowY: 'auto' as const, overflowX: noWrap ? 'auto' as const : undefined,
      }}>
        <pre style={{
          margin: 0, fontFamily: MONO, fontSize: 12.5, color: TEXT2, lineHeight: 1.65,
          whiteSpace: noWrap ? 'pre' as const : 'pre-wrap' as const,
          wordBreak: noWrap ? 'normal' as const : 'break-all' as const,
        }}>
          {code}
        </pre>
      </div>
    </div>
  )
}

// Wherever GitHubVerify is rendered from (the inline board-detail panel, or EmbedModal opened from
// /account) -- return to that same page/embed-target after OAuth, not always the board detail page.
function buildGithubReturnTo(address: string): string {
  if (typeof window === 'undefined') return `/markee/${address}?embed=1`
  const url = new URL(window.location.href)
  url.searchParams.set('embed', '1')
  url.searchParams.set('embedAddress', address)
  return url.pathname + url.search
}

// ── GitHub verify sub-component ───────────────────────────────────────────────
export function GitHubVerify({ address }: { address: string }) {
  type Step = 'checking' | 'not-connected' | 'ready' | 'registering' | 'done'
  const [step,         setStep]         = useState<Step>('checking')
  const [login,        setLogin]        = useState<string | null>(null)
  const [repos,        setRepos]        = useState<Array<{ fullName: string; name: string }>>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [files,        setFiles]        = useState<string[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')
  const [result,       setResult]       = useState<{ verified: boolean; filePath: string } | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [views,        setViews]        = useState<number | null>(null)
  // Check-now / Sync-message / Check-views used to be three separate manual buttons -- unified into
  // one fail-fast chain (mirrors the tx-modal step pattern: Create Markee > Approve > Start Stream)
  // so a single click either completes the whole thing or stops with an error at whichever step failed.
  const [syncPhase,    setSyncPhase]    = useState<'idle' | 'running' | 'error'>('idle')
  const [syncStepIdx,  setSyncStepIdx]  = useState(0)
  const [syncError,    setSyncError]    = useState<string | null>(null)
  const [syncSummary,  setSyncSummary]  = useState<string | null>(null)
  const [changeAccountOpen, setChangeAccountOpen] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const SYNC_STEPS = ['Verify File', 'Sync Message', 'Check Views']

  // no-store: this is the sole "am I connected" gate -- checked on mount, and again after a
  // popup-based reconnect completes, so a cached "connected: false" from before never masks a
  // just-completed sign-in.
  function checkConnection() {
    return fetch('/api/github/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((me: { connected: boolean; login?: string }) => {
        if (!me.connected) { setStep('not-connected'); return }
        setLogin(me.login ?? null)
        return fetch('/api/github/my-repos', { cache: 'no-store' }).then(r => r.json())
      })
      .then((data?: { repos?: Array<{ fullName: string; name: string }> }) => {
        if (data?.repos) { setRepos(data.repos); setStep('ready') }
      })
      .catch(() => setStep('not-connected'))
  }

  useEffect(() => { checkConnection() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Opens GitHub OAuth in a popup instead of navigating the current page away -- the callback
  // route (passed popup=1) responds with a postMessage + window.close() instead of a redirect, so a
  // modal hosting this component never closes/reloads mid-flow. Falls back to a full-page nav if the
  // popup gets blocked.
  //
  // The window name used to be a fixed 'markee-github-oauth' string. If any earlier attempt left a
  // window with that name around (a previous click, a popup the browser silently reused instead of
  // blocking), window.open() with the same name focuses/reuses THAT window rather than guaranteeing
  // a fresh navigation to the new popupUrl -- which can leave it showing stale content instead of
  // actually running this attempt's OAuth flow. A name unique to this attempt rules that out
  // entirely: there's never anything to accidentally reuse.
  const oauthPopupRef = useRef<Window | null>(null)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function openGithubOAuth() {
    const returnTo = buildGithubReturnTo(address)
    const popupUrl = `/api/github/connect?popup=1&returnTo=${encodeURIComponent(returnTo)}`
    const windowName = `markee-github-oauth-${Date.now()}`
    const win = window.open(popupUrl, windowName, 'width=600,height=750')
    if (!win) {
      window.location.href = `/api/github/connect?returnTo=${encodeURIComponent(returnTo)}`
      return
    }
    oauthPopupRef.current = win
    setOauthPending(true)
    setChangeAccountOpen(false)

    // Safety net for "Waiting for GitHub..." hanging forever: if the user closes the popup (or it
    // closes itself some other way) without ever posting a result, there's no message to catch it --
    // poll for that instead so oauthPending always resolves one way or the other.
    if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    oauthPollRef.current = setInterval(() => {
      if (win.closed) {
        if (oauthPollRef.current) clearInterval(oauthPollRef.current)
        oauthPollRef.current = null
        setOauthPending(pending => {
          if (!pending) return pending // already resolved via postMessage
          setError('GitHub sign-in window was closed before finishing.')
          return false
        })
      }
    }, 500)
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      const data = e.data as { source?: string; success?: boolean; error?: string } | undefined
      if (data?.source !== 'markee-github-oauth') return
      if (oauthPollRef.current) { clearInterval(oauthPollRef.current); oauthPollRef.current = null }
      setOauthPending(false)
      if (data.success) {
        setStep('checking'); setSelectedRepo(''); setSelectedFile(''); setResult(null); setError(null)
        checkConnection()
      } else {
        setError(data.error ?? 'GitHub sign-in failed.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    }
  }, [])

  useEffect(() => {
    if (!selectedRepo) { setFiles([]); setSelectedFile(''); return }
    setLoadingFiles(true)
    setSelectedFile('')
    fetch(`/api/github/repo-files?repo=${encodeURIComponent(selectedRepo)}`)
      .then(r => r.json())
      .then((d: { files?: string[] }) => setFiles(d.files ?? []))
      .catch(() => {})
      .finally(() => setLoadingFiles(false))
  }, [selectedRepo])

  async function handleRegister() {
    if (!selectedRepo || !selectedFile) return
    setStep('registering'); setError(null)
    try {
      const res = await fetch('/api/github/register-markee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: address, repoFullName: selectedRepo, filePath: selectedFile }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ verified: data.verified, filePath: selectedFile })
        setStep('done')
        if (data.verified) void runFullSync()
      } else {
        setError(data.error ?? 'Registration failed')
        setStep('ready')
      }
    } catch {
      setError('Network error'); setStep('ready')
    }
  }

  // Keeps the connected repo, drops just the file + result so the picker re-opens for a second file.
  function handleAddAnotherFile() {
    setSelectedFile(''); setResult(null); setError(null); setStep('ready')
    setSyncPhase('idle'); setSyncError(null); setSyncSummary(null)
  }

  // Chains verify -> sync -> views into one fail-fast run, replacing what used to be three separate
  // manual buttons (Check now / Sync message / Check views) -- any step failing stops the chain and
  // surfaces that step's error instead of silently leaving the rest undone.
  async function runFullSync() {
    if (!selectedRepo || !selectedFile) return
    setSyncPhase('running'); setSyncStepIdx(0); setSyncError(null); setSyncSummary(null)

    try {
      const res = await fetch('/api/github/verify-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: address, repoFullName: selectedRepo, filePath: selectedFile }),
      })
      const data = await res.json()
      if (!data.success) { setSyncPhase('error'); setSyncError(data.error ?? 'Check failed'); return }
      setResult({ verified: data.verified, filePath: selectedFile })
      if (!data.verified) {
        setSyncPhase('error')
        setSyncError(`Not found yet — make sure the delimiter is committed to ${selectedFile} on the default branch.`)
        return
      }
    } catch {
      setSyncPhase('error'); setSyncError('Network error'); return
    }
    setSyncStepIdx(1)

    try {
      const res = await fetch('/api/github/update-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: address }),
      })
      const data = await res.json().catch(() => ({})) as {
        success?: boolean; error?: string
        results?: Array<{ success: boolean; error?: string }>
      }
      if (!(res.ok && data.success)) { setSyncPhase('error'); setSyncError(data.error ?? 'Sync failed'); return }
      const ok = data.results?.filter(r => r.success).length ?? 1
      const fail = data.results?.filter(r => !r.success).length ?? 0
      setSyncSummary(fail > 0 ? `Updated ${ok}, ${fail} failed` : `Updated ${ok} file${ok !== 1 ? 's' : ''}`)
    } catch {
      setSyncPhase('error'); setSyncError('Network error'); return
    }
    setSyncStepIdx(2)

    // Views are best-effort: a traffic-API blip after a successful verify+sync must not flip the
    // panel into the error state (whose "Try again" would re-run the mutating file sync just to
    // retry this read-only fetch).
    try {
      const res = await fetch(`/api/github/traffic?address=${address.toLowerCase()}`)
      const data = await res.json().catch(() => ({})) as { count?: number }
      if (res.ok && data.count !== undefined) setViews(data.count)
    } catch { /* keep whatever views value we already had */ }
    setSyncStepIdx(3)
    setSyncPhase('idle')
  }

  const accountRow = login && (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GithubIcon size={11} color={MUTED} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{login}</span>
      </span>
      <button
        onClick={() => setChangeAccountOpen(true)}
        style={{ background: 'transparent', border: 'none', color: MUTED, fontFamily: MONO, fontSize: 11, cursor: 'pointer', padding: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TEXT2 }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED }}
      >
        Change account
      </button>
    </div>
  )

  // Matches the "already selected" box's shade (rgba(15,27,107,0.5)) so an empty picker doesn't read
  // as a visually distinct, darker control from the ones that follow it once something's chosen.
  const inputStyle = {
    background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`, borderRadius: 7,
    padding: '7px 10px', fontFamily: MONO, fontSize: 12, color: TEXT,
    width: '100%', outline: 'none',
  }

  // GitHub's OAuth has no real account picker -- re-authenticating just re-uses whatever GitHub
  // session the browser already has. This explains that instead of promising a switcher that can't
  // exist, and reuses the same popup flow as the initial connect so the modal never navigates away.
  const changeAccountModal = changeAccountOpen && (
    <div
      onClick={() => setChangeAccountOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, background: BG2, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 22, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', fontFamily: 'Manrope, system-ui, sans-serif', color: TEXT }}
      >
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>Change GitHub account</h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: TEXT2, lineHeight: 1.6 }}>
          You&apos;ll be asked to sign in with GitHub again. To switch to a different account, sign out of{' '}
          {login ? <><GithubIcon size={11} color="currentColor" /> {login}</> : 'this account'} on github.com first — otherwise it&apos;ll just reconnect the same one.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setChangeAccountOpen(false)}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT2, borderRadius: 8, padding: '9px 16px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={openGithubOAuth}
            style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Continue to GitHub
          </button>
        </div>
      </div>
    </div>
  )

  if (step === 'checking') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px 16px' }}>
      <span
        aria-hidden
        style={{
          width: 15, height: 15, borderRadius: 99, flexShrink: 0,
          border: `2px solid ${PINK}`, borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
        }}
      />
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT2 }}>Connecting to GitHub...</span>
    </div>
  )

  if (step === 'not-connected') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={openGithubOAuth}
        disabled={oauthPending}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: '13px 16px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
          color: TEXT, cursor: oauthPending ? 'wait' : 'pointer', width: '100%',
          transition: 'border-color 140ms, background 140ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.background = 'rgba(15,27,107,0.7)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.background = 'rgba(15,27,107,0.5)' }}
      >
        {oauthPending ? (
          <span aria-hidden style={{ width: 15, height: 15, borderRadius: 99, flexShrink: 0, border: `2px solid ${PINK}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        ) : (
          <GithubIcon size={16} color="currentColor" />
        )}
        {oauthPending ? 'Waiting for GitHub…' : 'Connect GitHub'}
      </button>
      {error && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{error}</span>}
    </div>
  )

  if (step === 'done' && result) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {accountRow}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px',
      }}>
        <a
          href={`https://github.com/${selectedRepo}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: TEXT, textDecoration: 'none', minWidth: 0 }}
        >
          <GithubIcon size={15} color={TEXT2} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRepo}</span>
          <ExternalLink size={12} color={MUTED} style={{ flexShrink: 0 }} />
        </a>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: result.verified ? GREEN : MUTED }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: result.verified ? GREEN : MUTED, flexShrink: 0 }} />
          {result.verified ? 'VERIFIED' : 'LINKED'}
        </span>
      </div>
      {!result.verified && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT2, lineHeight: 1.5 }}>
          Add the delimiter snippet to{' '}
          <a
            href={`https://github.com/${selectedRepo}/blob/HEAD/${result.filePath}`} target="_blank" rel="noopener noreferrer"
            style={{ color: TEXT2, display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            {result.filePath}<ExternalLink size={10} />
          </a>
          , commit it, then check again.
        </span>
      )}

      {/* Check now / Sync message / Check views used to be three separate manual buttons -- unified
          into one fail-fast chained run (see runFullSync). Running uses the same centered spinning-ring
          TxProgress the transaction modals use; a failure drops the ring (matches how tx modals handle
          errors) and shows the step checklist as plain text instead. */}
      {syncPhase === 'running' ? (
        <TxProgress
          isSuccess={false}
          headline={`${SYNC_STEPS[syncStepIdx]}…`}
          steps={SYNC_STEPS.map((label, i) => ({ label, done: i < syncStepIdx, active: i === syncStepIdx }))}
        />
      ) : syncPhase === 'error' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <TxSteps steps={SYNC_STEPS.map((label, i) => ({ label, done: i < syncStepIdx, active: false }))} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{syncError}</span>
          <button
            onClick={runFullSync}
            style={{ background: 'transparent', border: 'none', color: PINK, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left', alignSelf: 'flex-start' }}
          >
            ← Try again
          </button>
        </div>
      ) : result.verified && (syncSummary !== null || views !== null) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11, color: GREEN }}>
            ✓ {syncSummary ?? 'Synced'}
          </span>
          {views !== null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 11, color: MUTED }}>
              <Eye size={11} /> {views.toLocaleString()} views
            </span>
          )}
          <button
            onClick={runFullSync}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11, color: TEXT2, cursor: 'pointer' }}
          >
            Re-sync
          </button>
        </div>
      ) : (
        <button
          onClick={runFullSync}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11, color: TEXT2, cursor: 'pointer' }}
        >
          {result.verified ? 'Sync & Check Views' : 'Check Now'}
        </button>
      )}
      {error && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{error}</span>}

      {result.verified && (
        <button
          onClick={handleAddAnotherFile}
          style={{ background: 'transparent', border: 'none', color: PINK, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left', alignSelf: 'flex-start' }}
        >
          + Add another file in this repo
        </button>
      )}
      {changeAccountModal}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {accountRow}
      {selectedRepo && selectedFile ? (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px',
          }}>
            <a
              href={`https://github.com/${selectedRepo}/blob/HEAD/${selectedFile}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: TEXT, textDecoration: 'none', minWidth: 0 }}
            >
              <GithubIcon size={15} color={TEXT2} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRepo}</span>
              <ExternalLink size={12} color={MUTED} style={{ flexShrink: 0 }} />
            </a>
            <button
              onClick={() => { setSelectedRepo(''); setSelectedFile('') }}
              style={{ background: 'transparent', border: 'none', color: MUTED, fontFamily: MONO, fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TEXT2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED }}
            >
              Change
            </button>
          </div>
          {error && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{error}</span>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT2, lineHeight: 1.5, flex: 1 }}>
              Add the delimiter snippet to {selectedFile}, commit it, then verify.
            </span>
            <button
              onClick={handleRegister}
              disabled={step === 'registering'}
              style={{
                background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '10px 18px',
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
                cursor: step === 'registering' ? 'not-allowed' : 'pointer',
                opacity: step === 'registering' ? 0.6 : 1, transition: 'opacity 140ms',
              }}
            >
              {step === 'registering' ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        </>
      ) : (
        <>
          <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)} disabled={step === 'registering'} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Select repository…</option>
            {repos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
          </select>
          <select
            value={selectedFile}
            onChange={e => setSelectedFile(e.target.value)}
            disabled={!selectedRepo || loadingFiles || step === 'registering'}
            style={{
              ...inputStyle,
              cursor: !selectedRepo ? 'default' : loadingFiles ? 'wait' : 'pointer',
              opacity: !selectedRepo ? 0.45 : 1,
            }}
          >
            <option value="">{loadingFiles ? 'Loading files…' : 'Select markdown file…'}</option>
            {files.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {error && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{error}</span>}
          <button
            disabled
            style={{
              background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '13px 16px', fontFamily: 'inherit', fontWeight: 700,
              fontSize: 14, width: '100%', cursor: 'not-allowed', opacity: 0.6,
            }}
          >
            Verify
          </button>
        </>
      )}
      {changeAccountModal}
    </div>
  )
}

// GitHub Repo embed: entirely OAuth + API driven (link a markdown file, verify via GitHubVerify) --
// no LLM prompt needed here, unlike the Website embed flow (see WebsiteEmbedWizard /
// lib/embedPrompt/fragments.ts), which has no equivalent API-driven path since there's no
// third-party account Markee can act through on an arbitrary site.
export function EmbedPanel({ address }: { address: string }) {
  const addrLower = address.toLowerCase()
  const delimiterSnippet = `<!-- MARKEE:START:${addrLower} -->
<!-- MARKEE:END:${addrLower} -->`

  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '20px 20px 0' }}>
        <CodeBlock code={delimiterSnippet} label="Add to your markdown file and commit" noWrap />
      </div>
      <div style={{ padding: 20 }}>
        <GitHubVerify address={address} />
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
export function BoardDetailSkeleton() {
  return (
    <div>
      {/* Hero skeleton */}
      <section style={{ background: HERO_GRAD, padding: '44px 40px 30px', borderBottom: `1px solid ${BORDER}`, position: 'relative', overflow: 'hidden' }}>
        <HeroBackground />
        <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ height: 18, width: 180, background: 'rgba(138,143,191,0.12)', borderRadius: 4, marginBottom: 16 }} />
          <div style={{ height: 200, background: 'rgba(138,143,191,0.07)', borderRadius: 16 }} />
        </div>
        <div style={{ maxWidth: 1100, margin: '28px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 24, paddingTop: 26, borderTop: `1px solid ${BORDER}` }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 52, background: 'rgba(138,143,191,0.07)', borderRadius: 6 }} />
          ))}
        </div>
      </section>
      {/* Table skeleton */}
      <section style={{ padding: '8px 40px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '40px auto 0' }}>
          <div style={{ height: 30, width: 200, background: 'rgba(138,143,191,0.1)', borderRadius: 4, marginBottom: 20 }} />
          <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: BG2, padding: 10 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 150px', gap: 14, alignItems: 'center', padding: '14px', border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: i === 5 ? 0 : 10 }}>
                <div style={{ width: 30, height: 30, background: 'rgba(138,143,191,0.08)', borderRadius: 99 }} />
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ height: 16, width: '70%', background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
                  <div style={{ height: 12, width: '38%', background: 'rgba(138,143,191,0.06)', borderRadius: 4 }} />
                </div>
                <div style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Per-message transaction history (expand chevron + fetch + list) ────────────
// Extracted from ExpandableMarkeeRow so the For Rent leaderboard rows can reuse the exact same
// fetch/render logic instead of a second copy -- /api/markee/history is address-keyed and already
// strategy-agnostic.
export type TxHistoryEvent =
  | { id: string; kind: 'funds'; subKind: 'created' | 'migrated' | 'added'; amount: bigint; newTotal: bigint; actor: string; timestamp: number; blockNumber: bigint; logIndex: number; transactionHash: string }
  | { id: string; kind: 'message'; message: string; actor: string; timestamp: number; blockNumber: bigint; logIndex: number; transactionHash: string }
  | { id: string; kind: 'name'; name: string; actor: string; timestamp: number; blockNumber: bigint; logIndex: number; transactionHash: string }
  // Streaming-only: the creator's MarkeeCreated + their own first BackerUpdated are two separate txs
  // but one user action, merged server-side into a single "Bought Message" entry (flowRate is from
  // the paired stream-open, for display). Other rate events distinguish a brand new backer's first
  // stream from an existing backer changing/stopping theirs.
  | { id: string; kind: 'bought'; flowRate: bigint; message: string; actor: string; timestamp: number; blockNumber: bigint; logIndex: number; transactionHash: string }
  | { id: string; kind: 'rate'; subKind: 'added' | 'changed' | 'stopped'; flowRate: bigint; newAggregate: bigint; actor: string; timestamp: number; blockNumber: bigint; logIndex: number; transactionHash: string }

type ApiHistoryEvent =
  | { id: string; kind: 'funds'; subKind: 'created' | 'migrated' | 'added'; amount: string; newTotal: string; actor: string; timestamp: number; blockNumber: string; logIndex: number; transactionHash: string }
  | { id: string; kind: 'message'; message: string; actor: string; timestamp: number; blockNumber: string; logIndex: number; transactionHash: string }
  | { id: string; kind: 'name'; name: string; actor: string; timestamp: number; blockNumber: string; logIndex: number; transactionHash: string }
  | { id: string; kind: 'bought'; flowRate: string; message: string; actor: string; timestamp: number; blockNumber: string; logIndex: number; transactionHash: string }
  | { id: string; kind: 'rate'; subKind: 'added' | 'changed' | 'stopped'; flowRate: string; newAggregate: string; actor: string; timestamp: number; blockNumber: string; logIndex: number; transactionHash: string }

export interface TxHistoryBidder { address: string; flowRateRaw: string }

export function useTxHistory(leaderboardAddress: string, markeeAddress: string, expanded: boolean, strategy?: 'fixed' | 'streaming') {
  const [history, setHistory] = useState<TxHistoryEvent[]>([])
  const [bidders, setBidders] = useState<TxHistoryBidder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!expanded || !leaderboardAddress) return
    let cancelled = false

    async function fetchHistory() {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ leaderboardAddress, markeeAddress, ...(strategy ? { strategy } : {}) })
        const response = await fetch(`/api/markee/history?${params.toString()}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to load transaction history')
        const data = await response.json() as { history?: ApiHistoryEvent[]; bidders?: TxHistoryBidder[] }
        const events: TxHistoryEvent[] = (data.history ?? []).map(event => ({
          ...event,
          ...(event.kind === 'funds' ? { amount: BigInt(event.amount), newTotal: BigInt(event.newTotal) } : {}),
          ...(event.kind === 'rate' ? { flowRate: BigInt(event.flowRate), newAggregate: BigInt(event.newAggregate) } : {}),
          ...(event.kind === 'bought' ? { flowRate: BigInt(event.flowRate) } : {}),
          blockNumber: BigInt(event.blockNumber),
        } as TxHistoryEvent))
        if (!cancelled) { setHistory(events); setBidders(data.bidders ?? []) }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load transaction history')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchHistory()
    return () => { cancelled = true }
  }, [expanded, refreshKey, leaderboardAddress, markeeAddress, strategy])

  return { history, bidders, isLoading, error, refresh: () => setRefreshKey(v => v + 1) }
}

export function TxHistoryToggle({ expanded, onClick, rank }: { expanded: boolean; onClick: () => void; rank: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? `Collapse transaction history for row ${rank}` : `Expand transaction history for row ${rank}`}
      aria-expanded={expanded}
      style={{
        width: 28, height: 28, borderRadius: 7, border: `1px solid ${BORDER}`, background: 'transparent',
        color: MUTED, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <ChevronRight size={15} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 140ms' }} />
    </button>
  )
}

function txTimeAgo(ts: number): string {
  if (!ts) return ''
  const seconds = Math.floor(Date.now() / 1000 - ts)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return `${Math.floor(seconds / 2592000)}mo ago`
}

function txTimestamp(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function TxEventIcon({ kind }: { kind: TxHistoryEvent['kind'] }) {
  if (kind === 'funds' || kind === 'bought') return <div className="w-7 h-7 rounded-full bg-[#7C9CFF]/20 flex items-center justify-center flex-shrink-0"><Coins size={13} className="text-[#7C9CFF]" /></div>
  if (kind === 'message') return <div className="w-7 h-7 rounded-full bg-[#F897FE]/20 flex items-center justify-center flex-shrink-0"><MessageSquare size={13} className="text-[#F897FE]" /></div>
  if (kind === 'rate') return <div className="w-7 h-7 rounded-full bg-[#1DB227]/20 flex items-center justify-center flex-shrink-0"><Zap size={13} className="text-[#1DB227]" /></div>
  return <div className="w-7 h-7 rounded-full bg-[#FFA94D]/20 flex items-center justify-center flex-shrink-0"><User size={13} className="text-[#FFA94D]" /></div>
}

export function TxHistoryPanel({ leaderboardAddress, markeeAddress, expanded, featured, strategy, boardAdmin, boardCreator }: {
  leaderboardAddress: string
  markeeAddress: string
  expanded: boolean
  featured?: boolean
  strategy?: 'fixed' | 'streaming'
  boardAdmin?: string | null
  boardCreator?: string | null
}) {
  const { history, bidders, isLoading, error, refresh } = useTxHistory(leaderboardAddress, markeeAddress, expanded, strategy)
  if (!expanded) return null
  const latestTxHash = history[0]?.transactionHash

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, background: BG, padding: '12px 16px 14px', borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: current bids */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8A8FBF] mb-3">Current Bids</p>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#8A8FBF] py-3">
              <Loader2 size={14} className="animate-spin" /> Loading bids...
            </div>
          ) : bidders.length > 0 ? (
            <div className="space-y-2">
              {bidders.map(b => (
                <div key={b.address} className="flex items-center justify-between gap-3 rounded-lg border border-[#8A8FBF]/15 bg-[#0A0F3D] px-3 py-2.5">
                  <a href={getAddressUrl(CANONICAL_CHAIN_ID, b.address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#EDEEFF] hover:text-[#F897FE] transition-colors font-mono">
                    {fmtAddr(b.address)} <ExternalLink size={10} />
                  </a>
                  <span className="text-sm font-semibold text-[#1DB227] font-mono">{formatRate(BigInt(b.flowRateRaw))}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#8A8FBF] py-3">No active bids on this message yet.</p>
          )}
        </div>

        {/* Right: transaction history */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A8FBF]">Transaction history</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={refresh}
                disabled={isLoading}
                className="inline-flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] disabled:opacity-50 disabled:hover:text-[#8A8FBF] transition-colors"
              >
                <RefreshCw size={10} className={isLoading ? 'animate-spin' : undefined} />
                Refresh
              </button>
              {latestTxHash && (
                <a href={getTxUrl(CANONICAL_CHAIN_ID, latestTxHash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
                  View latest on Basescan <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[#8A8FBF] py-3">
              <Loader2 size={14} className="animate-spin" /> Loading transaction history...
            </div>
          ) : error ? (
            <p className="text-sm text-red-300 py-3">{error}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#8A8FBF] py-3">No on-chain history found for this message yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map(event => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg border border-[#8A8FBF]/15 bg-[#0A0F3D] px-3 py-2.5">
                  <TxEventIcon kind={event.kind} />
                  <div className="min-w-0 flex-1">
                    {event.kind === 'funds' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#EDEEFF]">
                      {event.subKind === 'created' ? 'Bought Message' : event.subKind === 'migrated' ? 'Migrated In' : 'Added Funds'}
                    </span>
                    {event.amount > 0n && (
                      <span className="text-sm font-semibold text-[#7C9CFF]">+{formatEther(event.amount)} ETH</span>
                    )}
                    {event.subKind === 'added' && (
                      <span className="text-xs text-[#8A8FBF]">to {formatEther(event.newTotal)} ETH total</span>
                    )}
                  </div>
                ) : event.kind === 'message' ? (
                  <div>
                    <span className="text-sm font-semibold text-[#EDEEFF]">Changed Message</span>
                    <div className="flex items-center gap-2">
                      <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={markeeAddress} boardAdmin={boardAdmin} boardCreator={boardCreator} className="min-w-0 flex-1">
                        <p className="text-sm text-[#EDEEFF] font-mono break-words mt-0.5">{event.message || '(empty message)'}</p>
                      </ModeratedContent>
                      <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markeeAddress} boardAdmin={boardAdmin} boardCreator={boardCreator} compact />
                    </div>
                  </div>
                ) : event.kind === 'bought' ? (
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#EDEEFF]">Bought Message</span>
                      {event.flowRate > 0n && (
                        <span className="text-sm font-semibold text-[#7C9CFF]">{formatRate(event.flowRate)}</span>
                      )}
                    </div>
                    {event.message && (
                      <div className="flex items-center gap-2">
                        <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={markeeAddress} boardAdmin={boardAdmin} boardCreator={boardCreator} className="min-w-0 flex-1">
                          <p className="text-sm text-[#EDEEFF] font-mono break-words mt-0.5">{event.message}</p>
                        </ModeratedContent>
                        <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markeeAddress} boardAdmin={boardAdmin} boardCreator={boardCreator} compact />
                      </div>
                    )}
                  </div>
                ) : event.kind === 'rate' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#EDEEFF]">
                      {event.subKind === 'stopped' ? 'Stream Stopped' : event.subKind === 'added' ? 'Added a Stream' : 'Stream Rate Changed'}
                    </span>
                    {event.flowRate > 0n && (
                      <span className="text-sm font-semibold text-[#1DB227]">{formatRate(event.flowRate)}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#EDEEFF]">
                    <span className="font-semibold">Updated Name</span> to <span className="font-medium">{event.name || '(cleared)'}</span>
                  </p>
                )}
                {event.actor && (
                  <a href={getAddressUrl(CANONICAL_CHAIN_ID, event.actor)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors mt-1">
                    by {fmtAddr(event.actor)} <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-[#8A8FBF]" title={txTimestamp(event.timestamp)}>{txTimeAgo(event.timestamp)}</p>
                <a href={getTxUrl(CANONICAL_CHAIN_ID, event.transactionHash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors mt-1">
                  tx <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}
        </div>
          )}
        </div>
      </div>
    </div>
  )
}
