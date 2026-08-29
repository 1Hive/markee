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
// Large "MAR/KEE" wordmark bled off the card's top-left corner, clipped to its border radius. Sits
// behind the message/pill content and shares the same hover trigger as the price pill -- it's a
// brand accent on the card, not a static logo lockup. z-index -1 so it paints behind the card's
// normal in-flow content without needing to touch that content's own stacking -- but that only
// works if the parent container is ALSO an explicit stacking context (position + a set z-index, not
// just position:relative alone), otherwise the negative z-index can escape and paint behind
// far-away ancestors (e.g. the page's hero background). Give the card container `zIndex: 0` (or
// any number) alongside its existing `position: relative` when using this component. The card's own
// overflow can stay 'visible' since the clipping happens on this component's own wrapper -- the
// price pill (which bleeds past the bottom edge) is unaffected.
export function MarkeeWatermark({ show }: { show: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', zIndex: -1 }}>
      <div style={{
        position: 'absolute', top: -6, left: -6,
        fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800,
        fontSize: 'clamp(22px, 3vw, 34px)', lineHeight: 0.86, letterSpacing: '-0.01em',
        color: TEXT, whiteSpace: 'pre' as const,
        opacity: show ? 0.07 : 0, transition: 'opacity 220ms ease',
      }}>
        {'MAR\nKEE'}
      </div>
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
  function openGithubOAuth() {
    const returnTo = buildGithubReturnTo(address)
    const popupUrl = `/api/github/connect?popup=1&returnTo=${encodeURIComponent(returnTo)}`
    const win = window.open(popupUrl, 'markee-github-oauth', 'width=600,height=750')
    if (!win) {
      window.location.href = `/api/github/connect?returnTo=${encodeURIComponent(returnTo)}`
      return
    }
    setOauthPending(true)
    setChangeAccountOpen(false)
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      const data = e.data as { source?: string; success?: boolean; error?: string } | undefined
      if (data?.source !== 'markee-github-oauth') return
      setOauthPending(false)
      if (data.success) {
        setStep('checking'); setSelectedRepo(''); setSelectedFile(''); setResult(null); setError(null)
        checkConnection()
      } else {
        setError(data.error ?? 'GitHub sign-in failed.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
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

// ── OpenInternet verify sub-component ─────────────────────────────────────────
export function OpenInternetVerify({ address }: { address: string }) {
  const [verifiedUrls, setVerifiedUrls] = useState<string[]>([])
  const [logoUrl,      setLogoUrl]      = useState('')
  const [siteUrl,      setSiteUrl]      = useState('')
  const [loading,      setLoading]      = useState(true)
  const [newUrl,       setNewUrl]       = useState('')
  const [verifying,    setVerifying]    = useState<string | null>(null)
  const [urlStatus,    setUrlStatus]    = useState<Record<string, 'ok' | 'fail'>>({})
  const [urlErrors,    setUrlErrors]    = useState<Record<string, string>>({})
  const [newUrlError,  setNewUrlError]  = useState<string | null>(null)
  const [savingMeta,   setSavingMeta]   = useState(false)
  const [metaSaved,    setMetaSaved]    = useState(false)

  useEffect(() => {
    fetch(`/api/openinternet/meta?address=${address}`)
      .then(r => r.json())
      .then((d: { verifiedUrls?: string[]; verifiedUrl?: string; logoUrl?: string; siteUrl?: string }) => {
        const urls = Array.isArray(d.verifiedUrls) ? d.verifiedUrls : d.verifiedUrl ? [d.verifiedUrl] : []
        setVerifiedUrls(urls)
        setLogoUrl(d.logoUrl ?? '')
        setSiteUrl(d.siteUrl ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  async function verify(url: string, isRecheck = false) {
    setVerifying(url)
    if (isRecheck) setUrlErrors(e => { const n = { ...e }; delete n[url]; return n })
    else setNewUrlError(null)
    try {
      const res  = await fetch('/api/openinternet/verify-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, url }),
      })
      const data = await res.json()
      if (data.verified) {
        setVerifiedUrls(data.verifiedUrls ?? [...verifiedUrls, url])
        setUrlStatus(s => ({ ...s, [url]: 'ok' }))
        if (!isRecheck) setNewUrl('')
      } else {
        setUrlStatus(s => ({ ...s, [url]: 'fail' }))
        const msg = data.error ?? 'Not found'
        if (isRecheck) setUrlErrors(e => ({ ...e, [url]: msg }))
        else setNewUrlError(msg)
      }
    } catch {
      setUrlStatus(s => ({ ...s, [url]: 'fail' }))
      if (!isRecheck) setNewUrlError('Network error')
    } finally {
      setVerifying(null)
    }
  }

  async function removeUrl(url: string) {
    setVerifiedUrls(u => u.filter(x => x !== url))
    setUrlStatus(s => { const n = { ...s }; delete n[url]; return n })
    fetch('/api/openinternet/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaderboardAddress: address, removeVerifiedUrl: url }),
    }).catch(() => {})
  }

  async function saveMeta() {
    setSavingMeta(true)
    try {
      await fetch('/api/openinternet/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderboardAddress: address,
          logoUrl: logoUrl.trim(),
          siteUrl: siteUrl.trim(),
        }),
      })
      setMetaSaved(true)
      setTimeout(() => setMetaSaved(false), 2000)
    } catch {}
    setSavingMeta(false)
  }

  const inputStyle = {
    background: '#030714', border: `1px solid ${BORDER}`, borderRadius: 7,
    padding: '7px 10px', fontFamily: MONO, fontSize: 12, color: TEXT,
    outline: 'none', minWidth: 0,
  }
  const smallBtn = (color = TEXT2): React.CSSProperties => ({
    background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: '4px 9px', fontFamily: MONO, fontSize: 11, color,
    cursor: 'pointer', flexShrink: 0, transition: 'border-color 120ms, color 120ms',
    whiteSpace: 'nowrap' as const,
  })

  if (loading) return <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>Loading…</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Existing verified URLs */}
      {verifiedUrls.map(url => {
        const status = urlStatus[url]
        const iconColor = status === 'fail' ? 'rgba(255,100,120,0.9)' : GREEN
        return (
          <div key={url}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#030714', border: `1px solid ${status === 'fail' ? 'rgba(255,100,120,0.25)' : status === 'ok' ? 'rgba(29,178,39,0.25)' : BORDER}`, borderRadius: 8, padding: '6px 10px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                {status === 'fail'
                  ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                  : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                }
              </svg>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = TEXT2)}
              >{url}</a>
              <button
                onClick={() => verify(url, true)}
                disabled={verifying === url}
                style={smallBtn(verifying === url ? MUTED : TEXT2)}
                onMouseEnter={e => { if (verifying !== url) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = verifying === url ? MUTED : TEXT2 }}
              >
                {verifying === url ? 'Checking…' : 'Re-check'}
              </button>
              <button
                onClick={() => removeUrl(url)}
                style={{ ...smallBtn('rgba(255,100,120,0.7)'), border: 'none', padding: '4px 4px' }}
                title="Remove"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,100,120,1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,100,120,0.7)'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {urlErrors[url] && (
              <p style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)', margin: '4px 0 0 2px' }}>{urlErrors[url]}</p>
            )}
          </div>
        )
      })}

      {/* Add new URL */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="url"
          value={newUrl}
          onChange={e => { setNewUrl(e.target.value); setNewUrlError(null) }}
          onKeyDown={e => { if (e.key === 'Enter' && newUrl.trim() && !verifying) verify(newUrl.trim()) }}
          placeholder="https://yoursite.com"
          style={{ ...inputStyle, flex: 1 }}
          disabled={!!verifying}
        />
        <button
          onClick={() => verify(newUrl.trim())}
          disabled={!newUrl.trim() || !!verifying}
          style={{
            background: PINK, color: BG, border: 'none', borderRadius: 7,
            padding: '7px 14px', fontFamily: MONO, fontWeight: 700, fontSize: 12,
            cursor: !newUrl.trim() || !!verifying ? 'not-allowed' : 'pointer',
            opacity: !newUrl.trim() || !!verifying ? 0.5 : 1, flexShrink: 0, transition: 'opacity 140ms',
          }}
        >
          {verifying === newUrl.trim() ? 'Checking…' : 'Verify'}
        </button>
      </div>
      {newUrlError && <p style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)', margin: '-4px 0 0 2px' }}>{newUrlError}</p>}

      {/* Site settings */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase' as const, color: MUTED, letterSpacing: '0.08em' }}>
          Site Settings
        </div>
        <input
          type="url"
          value={siteUrl}
          onChange={e => setSiteUrl(e.target.value)}
          placeholder="Site URL (e.g. https://yoursite.com)"
          style={{ ...inputStyle, width: '100%' }}
          disabled={savingMeta}
        />
        <input
          type="url"
          value={logoUrl}
          onChange={e => setLogoUrl(e.target.value)}
          placeholder="Logo URL (e.g. https://yoursite.com/logo.png)"
          style={{ ...inputStyle, width: '100%' }}
          disabled={savingMeta}
        />
        <button
          onClick={saveMeta}
          disabled={savingMeta || (!logoUrl.trim() && !siteUrl.trim())}
          style={{
            alignSelf: 'flex-start', background: metaSaved ? 'rgba(29,178,39,0.15)' : '#030714',
            border: `1px solid ${metaSaved ? 'rgba(29,178,39,0.4)' : BORDER}`,
            borderRadius: 7, padding: '7px 14px', fontFamily: MONO, fontSize: 12,
            color: metaSaved ? GREEN : TEXT2, cursor: savingMeta || (!logoUrl.trim() && !siteUrl.trim()) ? 'not-allowed' : 'pointer',
            opacity: savingMeta || (!logoUrl.trim() && !siteUrl.trim()) ? 0.5 : 1, transition: 'all 140ms',
          }}
        >
          {metaSaved ? 'Saved' : savingMeta ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export function EmbedPanel({ address, name, platform }: { address: string; name?: string; platform?: string }) {
  const isGithub    = platform === 'github'
  const displayName = name || address
  const buyUrl      = `https://markee.xyz/markee/${address}`
  const apiUrl      = `https://markee.xyz/api/ecosystem/leaderboards`
  const dataAttr    = `data-markee-address="${address}"`
  const addrLower   = address.toLowerCase()

  const delimiterSnippet = `<!-- MARKEE:START:${addrLower} -->
<!-- MARKEE:END:${addrLower} -->`

  const llmPrompt = `I want to add a full Markee buy-flow modal to my Next.js site -- not just a display widget, but an embedded modal where visitors can buy or boost a message without leaving my site.

My leaderboard:
- Name: ${displayName}
- Address: ${address}
- Buy page (fallback for non-Next.js sites): ${buyUrl}

## Brand & UX requirements (read this first)

This should feel like the actual Markee product embedded in my site, not a generic form bolted on --
match the UX at markee.xyz/markee/[address] (the "hero" message card and its buy/change-message
modal), restyled in my site's own colors and theme. Specifically:

- Trigger card: the current message rendered large and prominent (Markee uses a bold monospace
  headline with a subtle gradient text-fill from the primary text color into the accent color --
  approximate that with your own palette). On hover, a pill badge slides up from the bottom edge
  showing the price/action ("X.XXX ETH to change", or "be first!" if no messages yet).
- Brand watermark: a small, low-opacity "MARKEE" wordmark tucked into the trigger card's top-left
  corner -- two stacked lines, "MAR" over "KEE", bold sans-serif (weight ~800), sized noticeably
  smaller than the message headline (roughly clamp(22px, 3vw, 34px) against a ~24-34px headline), at
  ~7% opacity, pulled tight to the corner with only a few px of negative offset. Keep it compact and
  clear of the message headline's own text, including where a long message wraps onto a second or
  third line -- oversizing this is the most common mistake, since at headline-matching sizes it
  collides with the message text directly behind it and reads as noise instead of a subtle corner
  texture. Render it as plain text (not an image) so it inherits your color exactly and needs no
  external asset fetch. Clip it with its own
  absolutely-positioned "overflow: hidden" wrapper, not the whole card's overflow -- the price pill
  intentionally bleeds past the card's bottom edge and would get cut off otherwise. Give the card
  container an explicit z-index (not just position: relative) so the watermark's negative z-index
  stays contained instead of escaping behind the page's own background. Tint: white on dark/black
  card backgrounds, near-black on light/white backgrounds, or Markee's own purple (#7B6AF4) if the
  card background sits in between. It shares the price pill's hover trigger -- fades in and out
  together with the pill, not a separate always-present element. This is a Markee brand requirement,
  not optional styling -- every integration should carry it.
- Loading states never show a blank or "0" value while data is still in flight -- use a small
  spinner (a simple CSS-animated ring is fine) in place of the number/text until the real value
  loads, exactly like the price badge and message text above.
- The message textarea (not the amount input) is the visually emphasized field in every form --
  give IT the accent-colored glow/border, with the amount field styled plainly by comparison. This
  is a deliberate Markee-wide convention: attention should land on what the visitor is saying before
  what they're paying.
- Any flow with more than one on-chain transaction (e.g. approve, then submit) shows a centered
  step indicator -- a small spinning ring plus a checklist of steps (done/active/pending) -- not just
  a single generic spinner, so the visitor can see which step they're on.

## What to build

Two components:

1. A trigger component (e.g. MarkeeSign) that:
   - Fetches and displays the current top message from /api/markee/leaderboards (see proxy route below)
   - Shows the owner name below the message (truncate 0x addresses to 0x1234...abcd, show plain names as-is)
   - On hover reveals a price badge: "X.XXX ETH to change" or "be first!" if no messages yet
   - Opens the modal when clicked
   - Is disabled only while loading (never on fetch error -- fall back to default message and let the modal open)
   - Wraps its container with ${dataAttr} for integration verification
   - After a successful transaction, waits 3 seconds then re-fetches to show the new message

2. A modal component (e.g. MarkeeModal) that is a full buy flow with:
   - A header with the site logo, title, and close button
   - The current top message displayed above the tabs
   - Two or three tabs: "Buy a Message", "Boost Existing Message", and -- only when the connected
     wallet owns the current top message (compare owner() on the top markee to the connected
     address) -- "Change Message", replacing the Boost tab's role for that one entry (an owner
     doesn't need to outbid themselves, just edit what it says)
   - A footer: "You'll receive MARKEE tokens with your purchase and co-own the Markee Network." (link "Markee Network" to the Gardens community for this leaderboard if applicable)

### Buy a Message tab
- Textarea for the message (left-aligned, monospace, char counter, maxLength from contract)
- Optional name input
- ETH amount section:
  - "Take top spot" preset button (shows only when there is an existing top message)
  - "Minimum" preset button
  - Custom number input, capped at 8 total digit characters (before + after decimal)
  - Clickable balance label that fills the field with the user's full balance, floored to fit within the 8-digit cap and never exceeding actual balance
  - Inline "Amount exceeds your balance" warning below the input (not just on submit)
- Wrong network banner with "Switch to Base" button (always visible when connected to wrong chain)
- Low balance banner when connected balance is below the minimum price
- Connect Wallet button (closes dialog before opening RainbowKit modal so it appears on top; dialog reopens when the connect modal closes)
- Buy Message submit button (disabled when loading, insufficient balance, or low balance)

### Boost Existing Message tab
- List of top messages read directly from the contract via getTopMarkees(10) + useReadContracts for message/name per address -- do NOT use the API for this, the API only returns the top 1
- Each entry shows: message, owner name, ETH funded, #1 badge for top entry
- Clicking an entry selects it (highlighted border)
- When an entry is selected and it already holds the top spot, show a note: "This message has the top spot. Add more funds to make it harder to reach."
- "Edit messages you own on the Markee app." link (or "See more messages and edit messages you own." if > 5 entries) shown ABOVE the payment section, linking to ${buyUrl}
- Amount to Pay section (no Minimum button, only Take Top Spot + custom input)
  - Take top spot amount for the selected entry = topFundsAdded - selectedEntryFunds + 0.001 ETH
  - If the selected entry IS already the top, HIDE the Take Top Spot button entirely -- show only the custom input and the note above it
- Destructure isError from both useReadContract (getTopMarkees) and useReadContracts (per-markee data); if either errors, show an error message in the boost tab instead of the list
- "Add Funds to this Message" submit button

### Change Message tab (owner of the current top message only)
- Shows the current message read-only above a textarea for the new one (monospace, char counter, maxLength from contract) -- this is the same emphasized/glowing field treatment as the Buy tab's textarea
- No amount input -- this call is free (updateMessage does not take value)
- "Save Message" submit button, disabled while the textarea is empty or unchanged from the current message
- On success, same success state as the other tabs, then re-fetches to show the updated message

### Success state
When a transaction confirms, replace the entire modal body (below the header) with:
- A large checkmark
- "Transaction confirmed!"
- "View on Basescan" link to https://basescan.org/tx/{hash}
- "Refreshing in a moment..." note
The modal stays open. The close button remains visible in the header. When the user closes the modal after a successful transaction, trigger the data refresh (call the onSuccess callback from handleClose only when isSuccess is true).

## Contract interactions

All on Base (chainId 8453).

Leaderboard contract: ${address}

ABI functions needed:
- minimumPrice() view -> uint256
- maxMessageLength() view -> uint256
- getTopMarkees(limit: uint256) view -> (address[], uint256[]) -- top markee addresses + their funds
- createMarkee(message: string, name: string) payable -> address  -- buys a new message
- addFunds(markeeAddress: address) payable  -- boosts an existing message
- updateMessage(markeeAddress: address, newMessage: string)  -- called on the leaderboard contract, not payable; only the markee's owner can call it (reverts otherwise), which is why the Change Message tab is gated on owner() matching the connected address first

Per-markee ABI (call on each markee contract address returned by getTopMarkees):
- message() view -> string
- name() view -> string
- owner() view -> address  -- compare to the connected wallet to decide whether to show Boost or Change Message for that entry

## Data fetching

### Proxy route (required -- avoids CORS)
Create app/api/markee/leaderboards/route.ts:
  export async function GET() {
    const res = await fetch('${apiUrl}', { next: { revalidate: 60 } })
    if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
    return Response.json(await res.json())
  }

Then fetch /api/markee/leaderboards in the trigger component.
Find the entry where address matches "${address}" (case-insensitive).
Fields: topMessage, topMessageOwner, topFundsAddedRaw, minimumPrice, topMarkeeAddress

### On-chain reads
Use wagmi useReadContract / useReadContracts for:
- minimumPrice, maxMessageLength (in both components or passed as props)
- getTopMarkees(10n) -- in the boost tab only (enable query only when on that tab)
- Per-markee message + name via useReadContracts multicall on the returned addresses

### Network detection
Use useAccount().chainId (not useChainId()) -- it is bound to the connected account and stays accurate in multi-wallet-extension environments.
const { address, isConnected, chainId } = useAccount()
const isOnBase = isConnected && chainId === base.id

### Wallet connect and dialog z-index
The modal should use the native <dialog> element with showModal(). When opening the RainbowKit connect modal, the dialog must be closed first so RainbowKit appears on top. Handle this in the trigger component (MarkeeSign), not MarkeeModal:
  // In MarkeeSign:
  const [pendingReopenModal, setPendingReopenModal] = useState(false)
  function handleConnectWallet() {
    dialogRef.current?.close()
    setPendingReopenModal(true)
    openConnectModal?.()
  }
  // Reopen the dialog once the connect modal has closed:
  useEffect(() => {
    if (pendingReopenModal && !connectModalOpen) {
      dialogRef.current?.showModal()
      setPendingReopenModal(false)
    }
  }, [pendingReopenModal, connectModalOpen])
Pass handleConnectWallet as a prop to MarkeeModal. MarkeeModal calls it when the user clicks "Connect Wallet" -- MarkeeModal itself does not manage the dialog open/close.

## View tracking

Add a proxy route to forward view increments to Markee:

// app/api/markee/views/route.ts
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.address || !body?.message) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }
  const res = await fetch('https://markee.xyz/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return Response.json(await res.json())
}

In MarkeeSign, fire this once per session per markee when the top message is first displayed:
  const viewTracked = useRef(false)
  useEffect(() => {
    if (!topMessage || !topMarkeeAddress || viewTracked.current) return
    viewTracked.current = true
    fetch('/api/markee/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: topMarkeeAddress, message: topMessage }),
    }).catch(() => {})
  }, [topMessage, topMarkeeAddress])

The API rate-limits to 1 increment per IP per markee per hour, so calling this on every page load is safe.

## Moderation

Add a proxy route to fetch the flagged content list:

// app/api/markee/moderation/route.ts
export async function GET() {
  const res = await fetch('https://markee.xyz/api/moderation', { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ flagged: [] })
  return Response.json(await res.json())
}

In MarkeeSign (and in MarkeeModal's boost tab), fetch this once on mount and build a Set:
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/markee/moderation')
      .then(r => r.json())
      .then(d => setFlagged(new Set((d.flagged ?? []) as string[])))
      .catch(() => {})
  }, [])
  function isFlagged(markeeAddr: string) {
    return flagged.has(\`8453:\${markeeAddr.toLowerCase()}\`)
  }

Flagging behavior:
- MarkeeSign: if isFlagged(topMarkeeAddress), show "Content unavailable" instead of the message. Still allow the modal to open so users can buy a new top message.
- MarkeeModal Boost tab: omit flagged entries from the list. If all are flagged, show "No messages available."
- MarkeeModal Buy tab: always show the current top message (users can replace it by outbidding), even if flagged.

## Optional: health endpoint

Add this route so the Markee integration dashboard can verify your setup:

// app/api/markee/health/route.ts
export async function GET() {
  return Response.json({
    overall: 'ok',
    checks: {
      leaderboards: { status: 'ok' },
      views: { status: 'ok' },
      moderation: { status: 'ok' },
    },
  })
}

## Packages required
- wagmi v2
- viem v2
- @rainbow-me/rainbowkit v2
- @tanstack/react-query v5

Wrap the app in (order matters):
WagmiProvider -> QueryClientProvider -> RainbowKitProvider

wagmi config: getDefaultConfig({ appName, projectId, chains: [base], ssr: true })
Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment (get a free ID at cloud.walletconnect.com).

## Implementation notes
- The data-markee-address attribute must be in the server-rendered HTML for verification. In Next.js, placing it in JSX inside a 'use client' component is fine -- Next.js SSRs client components. Avoid setting it only via useEffect or document.setAttribute() (those run client-side only and will fail verification).
- takeTopSpot passed to the modal = topFundsAdded + 0.001 ETH (MIN_INCREMENT). If no competition yet, use minimumPrice.
- Form state (message, name, ethAmount, boostAmount) must live in MarkeeSign (parent), not MarkeeModal. The <dialog> element unmounts/remounts when closed and reopened during wallet connect, so state inside MarkeeModal will be lost. Lift all form inputs to the parent and pass them down as props.
- On fetch error from the proxy route, fall back to the default message and still allow the modal to open -- the modal works fully from on-chain data alone.
- NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required. Optionally set NEXT_PUBLIC_BASE_RPC_URL for a custom transport in the wagmi config (e.g. an Alchemy or Infura endpoint).
- Style to match your site's existing design system -- colors, fonts, spacing should all be yours. The pattern (card, hover price pill, glowing message field, step-indicator progress, small logo watermark) should still read as unmistakably Markee, the same way the buy flow at markee.xyz does. The pattern works with any CSS framework.

Please look at this codebase and implement both components. Choose an appropriate location for the trigger (sidebar widget, footer, header banner). Match the existing code style.`

  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      {isGithub ? (
            <>
              <div style={{ padding: '20px 20px 0' }}>
                <CodeBlock code={delimiterSnippet} label="Add to your markdown file and commit" noWrap />
              </div>
              <div style={{ padding: 20 }}>
                <GitHubVerify address={address} />
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Copy this prompt into any AI coding agent with access to your repo.
                </p>
                <CopyButton text={llmPrompt} />
              </div>
              <div style={{ padding: 20 }}>
                <CodeBlock code={llmPrompt} hideCopy />
              </div>
              {/* ── Verify Integration ── */}
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 20px' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase' as const, color: MUTED, letterSpacing: '0.08em', marginBottom: 12 }}>
                  Verify Integration
                </div>
                <OpenInternetVerify address={address} />
              </div>
            </>
          )}
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
