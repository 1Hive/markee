'use client'

// Shared building blocks for the /markee/[address] board-detail pages: the fixed-price detail and the
// streaming detail render the same hero card, metrics bar, embed/verify panel and skeleton from here.

import { useState, useEffect, useRef } from 'react'
import { Eye, ExternalLink, ChevronDown } from 'lucide-react'
import { ModeratedContent, FlagButton } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getAddressUrl } from '@/lib/explorer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StrategyBadge } from '@/components/StrategyBadge'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'

// ── Design tokens ─────────────────────────────────────────────────────────────
import { MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'
export { MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER }
export const BOARD_LB_COLS = '42px 150px 120px minmax(260px,1fr) 70px 170px'

export const HERO_GRAD = [
  'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
  'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
  'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
].join(', ')

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
  useEffect(() => {
    if (!leaderboardAddress) return
    fetch('/api/ecosystem/leaderboards', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data?.leaderboards) return
        const found = (data.leaderboards as EcoEntry[]).find(
          lb => lb.address.toLowerCase() === leaderboardAddress.toLowerCase()
        )
        if (!found) return
        if (found.platform === 'github') {
          try {
            const ghRes = await fetch('/api/github/leaderboards', { cache: 'no-store' })
            if (ghRes.ok) {
              const ghData = await ghRes.json()
              const ghEntry = (ghData.leaderboards ?? []).find(
                (lb: EcoEntry) => lb.address.toLowerCase() === leaderboardAddress.toLowerCase()
              )
              if (ghEntry?.linkedFiles) found.linkedFiles = ghEntry.linkedFiles
            }
          } catch {}
        }
        setEntry(found)
      })
      .catch(() => {})
  }, [leaderboardAddress])
  return entry
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
      src={`https://img.logo.dev/${domain}?token=pk_V2lLjqQVQHahGBEhZYWN0g&size=32`}
      alt="" width={size} height={size}
      style={{ objectFit: 'contain', borderRadius: 3, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  )
}

export function ServedOnCell({ entry, markeeAddress, onAddToSite }: {
  entry: EcoEntry | null
  /** Top markee's address -- view counts are tracked per-markee, not per-leaderboard. */
  markeeAddress?: string
  onAddToSite?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const isGithub = entry?.platform === 'github'
  const files = isGithub ? (entry?.linkedFiles ?? []).filter(f => f.verified) : []
  const urls = !isGithub ? (entry?.verifiedUrls?.length ? entry.verifiedUrls : entry?.verifiedUrl ? [entry.verifiedUrl] : []) : []

  const [repoTraffic, setRepoTraffic] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!isGithub || !entry?.address || files.length === 0) return
    fetch(`/api/github/traffic-multi?address=${entry.address}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { repos?: Record<string, { count: number }> }) => {
        if (!d?.repos) return
        const m: Record<string, number> = {}
        for (const [repo, t] of Object.entries(d.repos)) m[repo] = t.count
        setRepoTraffic(m)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGithub, entry?.address, files.length])

  const [urlViews, setUrlViews] = useState<Record<string, number>>({})
  useEffect(() => {
    if (isGithub || urls.length === 0 || !markeeAddress) return
    fetch(`/api/views?address=${markeeAddress}&urls=${urls.map(encodeURIComponent).join('||')}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, number> | null) => { if (d) setUrlViews(d) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGithub, urls.join('||'), markeeAddress])

  if (!entry) {
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

  const sortedFiles = [...files].sort((a, b) => (repoTraffic[b.repoFullName] ?? 0) - (repoTraffic[a.repoFullName] ?? 0))
  const sortedUrls = [...urls].sort((a, b) => (urlViews[b] ?? 0) - (urlViews[a] ?? 0))
  const hasAny = isGithub ? sortedFiles.length > 0 : sortedUrls.length > 0
  const extra = (isGithub ? sortedFiles.length : sortedUrls.length) - 1
  const topFile = sortedFiles[0]
  const topUrl = sortedUrls[0]
  const topDomain = topUrl ? getLogoDomain(topUrl) : null

  const dropdownRowStyle: React.CSSProperties = {
    color: TEXT2, textDecoration: 'none', fontSize: 12, padding: '7px 10px', borderRadius: 7,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    transition: 'background 100ms, color 100ms',
  }
  const hoverIn = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = BG; (e.currentTarget as HTMLElement).style.color = PINK }
  const hoverOut = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', flex: '1 1 auto' }}>
        {hasAny ? (
          isGithub ? (
            <a href={fileUrl(topFile)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 13, color: TEXT, textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}
              title={`${topFile.repoFullName}/${topFile.filePath}`}
            >
              <GithubIcon size={16} color={TEXT2} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${MUTED}` }}>{topFile.repoOwner}</span>
            </a>
          ) : (
            <a href={href(topUrl)} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 13, color: TEXT, textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}
              title={clean(topUrl)}
            >
              {topDomain ? <SiteLogo domain={topDomain} /> : <span style={{ flexShrink: 0 }}>🪧</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${MUTED}` }}>{host(topUrl)}</span>
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

      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Hide integrations' : 'Show all integrations'}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, cursor: 'pointer' }}
      >
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, minWidth: 260, zIndex: 30, boxShadow: '0 16px 44px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {onAddToSite && (
            <button
              onClick={() => { setOpen(false); onAddToSite() }}
              style={{ color: PINK, background: `${PINK}14`, border: `1px solid rgba(248,151,254,0.3)`, textDecoration: 'none', fontSize: 12, fontWeight: 700, fontFamily: MONO, padding: '8px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: hasAny ? 6 : 0 }}
            >
              + Add to Your Site
            </button>
          )}
          {isGithub ? sortedFiles.map(f => (
            <a key={`${f.repoFullName}/${f.filePath}`} href={fileUrl(f)} target="_blank" rel="noopener noreferrer"
              style={dropdownRowStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
                <GithubIcon size={12} color="currentColor" />
                <span style={{ fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.repoName}/{f.filePath}</span>
              </span>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: MONO, color: MUTED }}>
                <Eye size={10} style={{ opacity: 0.7 }} /> {formatViews(repoTraffic[f.repoFullName] ?? 0)}
              </span>
            </a>
          )) : sortedUrls.map(u => (
            <a key={u} href={href(u)} target="_blank" rel="noopener noreferrer"
              style={dropdownRowStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            >
              <span style={{ fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clean(u)}</span>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, fontFamily: MONO, color: MUTED }}>
                <Eye size={10} style={{ opacity: 0.7 }} /> {formatViews(urlViews[u] ?? 0)}
              </span>
            </a>
          ))}
        </div>
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

export function MetricsBar({ address, entry, topMarkeeAddress, onAddToSite, topViews, viewsLoading, markeeCount, totalLabel, totalNode, messagesLabel = 'Messages bought' }: {
  address: string
  entry: EcoEntry | null
  topMarkeeAddress?: string
  onAddToSite?: () => void
  topViews: number
  viewsLoading?: boolean
  markeeCount: number
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
    <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, padding: '26px 0', borderTop: `1px solid ${BORDER}` }}>
      {cell('Served on', <ServedOnCell entry={entry} markeeAddress={topMarkeeAddress} onAddToSite={onAddToSite} />)}
      {cell(totalLabel, totalNode)}
      {cell('Total views', viewsLoading ? <ViewsSpinner size={16} color={BLUE} /> : <MetricValue text={formatViews(topViews)} color={BLUE} />)}
      {cell(messagesLabel, <MetricValue text={markeeCount.toLocaleString()} />)}
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
            position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
            borderRadius: 16, padding: '18px 26px 22px', backdropFilter: 'blur(4px)',
            transition: 'border-color 180ms, transform 180ms, box-shadow 180ms',
            transform: hover ? 'translateY(-2px)' : 'none',
            boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
            fontFamily: 'Manrope, system-ui, sans-serif',
          }}
        >
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

          {/* hover pill */}
          {pillLabel && (
            <span style={{ position: 'absolute', bottom: -15, left: '50%', transform: `translateX(-50%) ${hover ? 'translateY(0)' : 'translateY(4px)'}`, display: 'inline-flex', alignItems: 'center', gap: 6, background: PINK, color: BG, fontFamily: MONO, fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 8, whiteSpace: 'nowrap' as const, boxShadow: '0 8px 28px rgba(248,151,254,0.42)', opacity: hover ? 1 : 0, transition: 'opacity 180ms, transform 180ms', pointerEvents: 'none', zIndex: 3 }}>
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
  const [rechecking,    setRechecking]   = useState(false)
  const [syncStatus,   setSyncStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [syncMessage,  setSyncMessage]  = useState<string | null>(null)
  const [views,        setViews]        = useState<number | null>(null)
  const [viewsLoading,  setViewsLoading] = useState(false)

  useEffect(() => {
    // no-store: this is the sole "am I connected" gate, checked on every mount -- including right
    // after the OAuth redirect back. A cached "connected: false" from before the user authenticated
    // would otherwise look identical to GitHub never actually connecting.
    fetch('/api/github/me', { cache: 'no-store' })
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
        if (data.verified) void handleSync()
      } else {
        setError(data.error ?? 'Registration failed')
        setStep('ready')
      }
    } catch {
      setError('Network error'); setStep('ready')
    }
  }

  async function handleDisconnect() {
    setStep('checking')
    try { await fetch('/api/github/me', { method: 'DELETE' }) } catch { /* best-effort */ }
    setLogin(null); setRepos([]); setSelectedRepo(''); setSelectedFile(''); setResult(null); setError(null)
    setStep('not-connected')
  }

  // Keeps the connected repo, drops just the file + result so the picker re-opens for a second file.
  function handleAddAnotherFile() {
    setSelectedFile(''); setResult(null); setError(null); setStep('ready')
  }

  // Re-checks the delimiter is now present after the user edits the file post-link.
  async function handleRecheck() {
    if (!selectedRepo || !selectedFile) return
    setRechecking(true); setError(null)
    try {
      const res = await fetch('/api/github/verify-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: address, repoFullName: selectedRepo, filePath: selectedFile }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ verified: data.verified, filePath: selectedFile })
        if (data.verified) void handleSync()
        else setError(`Not found yet — make sure the delimiter is committed to ${selectedFile} on the default branch.`)
      } else {
        setError(data.error ?? 'Check failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setRechecking(false)
    }
  }

  // Pushes the current top message into the linked file(s) now.
  async function handleSync() {
    setSyncStatus('loading'); setSyncMessage(null)
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
      if (res.ok && data.success) {
        const ok = data.results?.filter(r => r.success).length ?? 1
        const fail = data.results?.filter(r => !r.success).length ?? 0
        setSyncStatus('success')
        setSyncMessage(fail > 0 ? `Updated ${ok}, ${fail} failed` : `Updated ${ok} file${ok !== 1 ? 's' : ''}`)
      } else {
        setSyncStatus('error')
        setSyncMessage(data.error ?? 'Sync failed')
      }
    } catch {
      setSyncStatus('error'); setSyncMessage('Network error')
    }
  }

  async function handleRefreshViews() {
    setViewsLoading(true)
    try {
      const res = await fetch(`/api/github/traffic?address=${address.toLowerCase()}`)
      const data = await res.json().catch(() => ({})) as { count?: number }
      if (res.ok && data.count !== undefined) setViews(data.count)
    } catch { /* best-effort */ }
    finally { setViewsLoading(false) }
  }

  const accountRow = login && (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GithubIcon size={11} color={MUTED} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{login}</span>
      </span>
      <button
        onClick={handleDisconnect}
        style={{ background: 'transparent', border: 'none', color: MUTED, fontFamily: MONO, fontSize: 11, cursor: 'pointer', padding: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TEXT2 }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED }}
      >
        Change account
      </button>
    </div>
  )

  const inputStyle = {
    background: '#030714', border: `1px solid ${BORDER}`, borderRadius: 7,
    padding: '7px 10px', fontFamily: MONO, fontSize: 12, color: TEXT,
    width: '100%', outline: 'none',
  }

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
    <a
      href={`/api/github/connect?returnTo=${encodeURIComponent(buildGithubReturnTo(address))}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`,
        borderRadius: 10, padding: '13px 16px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
        color: TEXT, textDecoration: 'none', transition: 'border-color 140ms, background 140ms',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.background = 'rgba(15,27,107,0.7)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.background = 'rgba(15,27,107,0.5)' }}
    >
      <GithubIcon size={16} color="currentColor" />
      Connect GitHub
    </a>
  )

  if (step === 'done' && result) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {accountRow}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: TEXT, minWidth: 0 }}>
          <GithubIcon size={15} color={TEXT2} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRepo}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: result.verified ? GREEN : MUTED }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: result.verified ? GREEN : MUTED, flexShrink: 0 }} />
          {result.verified ? 'VERIFIED' : 'LINKED'}
        </span>
      </div>
      {!result.verified && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT2, lineHeight: 1.5 }}>
          Add the delimiter snippet to {result.filePath}, commit it, then check again.
        </span>
      )}

      {/* Before verification: just Check now, so the user stays focused on getting the delimiter
          committed. Sync/Views (and syncing itself) only make sense once it's actually found --
          Check now auto-syncs the moment verification succeeds, so this is really a 2-click flow
          (check, then optionally check views) rather than 3. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
        {!result.verified ? (
          <button
            onClick={handleRecheck}
            disabled={rechecking}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11, color: TEXT2, cursor: rechecking ? 'wait' : 'pointer', opacity: rechecking ? 0.6 : 1 }}
          >
            {rechecking ? 'Checking…' : 'Check now'}
          </button>
        ) : (
          <>
            <button
              onClick={handleSync}
              disabled={syncStatus === 'loading'}
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11, color: TEXT2, cursor: syncStatus === 'loading' ? 'wait' : 'pointer', opacity: syncStatus === 'loading' ? 0.6 : 1 }}
            >
              {syncStatus === 'loading' ? 'Syncing…' : 'Sync message'}
            </button>
            <button
              onClick={handleRefreshViews}
              disabled={viewsLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11, color: TEXT2, cursor: viewsLoading ? 'wait' : 'pointer', opacity: viewsLoading ? 0.6 : 1 }}
            >
              <Eye size={11} />
              {viewsLoading ? 'Loading…' : views !== null ? `${views.toLocaleString()} views` : 'Check views'}
            </button>
          </>
        )}
      </div>
      {syncMessage && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: syncStatus === 'success' ? GREEN : 'rgba(255,100,120,0.9)' }}>{syncMessage}</span>
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
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {accountRow}
      {selectedRepo && selectedFile ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: 'rgba(15,27,107,0.5)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: TEXT, minWidth: 0 }}>
            <GithubIcon size={15} color={TEXT2} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedRepo}</span>
          </span>
          <button
            onClick={() => { setSelectedRepo(''); setSelectedFile('') }}
            style={{ background: 'transparent', border: 'none', color: MUTED, fontFamily: MONO, fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TEXT2 }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED }}
          >
            Change
          </button>
        </div>
      ) : (
        <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)} disabled={step === 'registering'} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">Select repository…</option>
          {repos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
        </select>
      )}
      {!selectedFile && (
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
      )}
      {error && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{error}</span>}
      <button
        onClick={handleRegister}
        disabled={!selectedRepo || !selectedFile || step === 'registering'}
        style={{
          background: (!selectedRepo || !selectedFile || step === 'registering') ? 'transparent' : PINK,
          color: (!selectedRepo || !selectedFile || step === 'registering') ? MUTED : BG,
          border: (!selectedRepo || !selectedFile || step === 'registering') ? `1px solid ${BORDER}` : 'none',
          borderRadius: 8, padding: '13px 16px', fontFamily: 'inherit', fontWeight: 700,
          fontSize: 14, width: '100%',
          cursor: (!selectedRepo || !selectedFile || step === 'registering') ? 'not-allowed' : 'pointer',
          opacity: (!selectedRepo || !selectedFile || step === 'registering') ? 0.6 : 1, transition: 'opacity 140ms',
        }}
      >
        {step === 'registering' ? 'Verifying…' : 'Verify'}
      </button>
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
   - Two tabs: "Buy a Message" and "Boost Existing Message"
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

Per-markee ABI (call on each markee contract address returned by getTopMarkees):
- message() view -> string
- name() view -> string

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
- Style to match your site's existing design system. The pattern works with any CSS framework.

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
