'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { formatEther } from 'viem'
import { useAccount } from 'wagmi'
import { Eye, ExternalLink, ChevronDown } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { ModeratedContent, FlagButton } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getAddressUrl } from '@/lib/explorer'
import { formatUsd } from '@/lib/utils'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useLeaderboardDetail } from '@/lib/contracts/useLeaderboardDetail'
import type { LeaderboardMarkee } from '@/lib/contracts/useLeaderboardDetail'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO  = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK  = '#F897FE'
const BLUE  = '#7C9CFF'
const GREEN = '#1DB227'
const BG    = '#060A2A'
const BG2   = '#0A0F3D'
const TEXT  = '#EDEEFF'
const TEXT2 = '#B8B6D9'
const MUTED = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

const HERO_GRAD = [
  'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
  'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
  'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
].join(', ')

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function fmtAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function priceToOvertake(topFunds: bigint) {
  return topFunds + BigInt('1000000000000000')
}

// ── Platform / served-on info from ecosystem API ──────────────────────────────
interface LinkedFile {
  repoFullName: string; repoOwner: string; repoName: string
  repoAvatarUrl: string; repoHtmlUrl: string; filePath: string; verified: boolean
}
interface EcoEntry {
  address: string; platform: string
  verifiedUrl?: string; verifiedUrls?: string[]
  logoUrl?: string; leaderboardName?: string
  linkedFiles?: LinkedFile[]
}

function useServedOn(leaderboardAddress: string) {
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
const GithubIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
)

// ── Platform cell ─────────────────────────────────────────────────────────────
function PlatformCell({ entry }: { entry: EcoEntry | null }) {
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
const NO_INTEGRATIONS = (
  <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, background: 'rgba(138,143,191,0.08)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' as const }}>
    No Verified URLs
  </span>
)

function DropdownLinks({ items, renderItem, renderDropdownItem }: {
  items: string[]
  renderItem: (first: string) => React.ReactNode
  renderDropdownItem: (item: string, idx: number) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', flex: '1 1 auto' }}>
        {renderItem(items[0])}
      </span>
      {items.length > 1 && (
        <>
          <button onClick={() => setOpen(v => !v)} style={{ flexShrink: 0, background: `${PINK}22`, border: `1px solid rgba(248,151,254,0.3)`, color: PINK, borderRadius: 99, padding: '2px 7px', fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4 }}>
            +{items.length - 1}
          </button>
          {open && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, minWidth: 220, zIndex: 30, boxShadow: '0 16px 44px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map((item, idx) => renderDropdownItem(item, idx))}
            </div>
          )}
        </>
      )}
    </span>
  )
}

function ServedOnCell({ entry }: { entry: EcoEntry | null }) {
  if (!entry) return NO_INTEGRATIONS

  if (entry.platform === 'github') {
    const files = (entry.linkedFiles ?? []).filter(f => f.verified)
    if (files.length === 0) return NO_INTEGRATIONS

    const fileUrl = (f: LinkedFile) => `https://github.com/${f.repoFullName}/blob/HEAD/${f.filePath}`
    const fileLabel = (f: LinkedFile) => f.filePath.split('/').pop() ?? f.filePath

    return (
      <DropdownLinks
        items={files.map(f => f.repoFullName + '::' + f.filePath)}
        renderItem={() => (
          <a href={fileUrl(files[0])} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 13, color: TEXT, textDecoration: 'none', borderBottom: `1px dotted ${MUTED}`, minWidth: 0, overflow: 'hidden' }}
            title={`${files[0].repoFullName}/${files[0].filePath}`}
          >
            <span style={{ flexShrink: 0, display: 'flex' }}><GithubIcon size={12} color={TEXT2} /></span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {files[0].repoName}/{fileLabel(files[0])}
            </span>
          </a>
        )}
        renderDropdownItem={(_, idx) => {
          const f = files[idx]
          return (
            <a key={`${f.repoFullName}/${f.filePath}`} href={fileUrl(f)} target="_blank" rel="noopener noreferrer"
              style={{ color: TEXT2, textDecoration: 'none', fontSize: 12, padding: '7px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 7, transition: 'background 100ms, color 100ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; (e.currentTarget as HTMLElement).style.color = PINK }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
            >
              <GithubIcon size={12} color="currentColor" />
              <span style={{ fontFamily: MONO }}>{f.repoName}/{f.filePath}</span>
            </a>
          )
        }}
      />
    )
  }

  const urls = entry.verifiedUrls?.length ? entry.verifiedUrls : entry.verifiedUrl ? [entry.verifiedUrl] : []
  if (urls.length === 0) return NO_INTEGRATIONS

  const clean = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const href = (u: string) => u.startsWith('http') ? u : `https://${u}`
  const host = (u: string) => { try { return new URL(href(u)).hostname } catch { return clean(u) } }

  return (
    <DropdownLinks
      items={urls}
      renderItem={(u) => (
        <a href={href(u)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', fontFamily: MONO, fontSize: 13, color: TEXT, textDecoration: 'none', borderBottom: `1px dotted ${MUTED}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={clean(u)}
        >
          {host(u)}
        </a>
      )}
      renderDropdownItem={(u, idx) => (
        <a key={idx} href={href(u)} target="_blank" rel="noopener noreferrer"
          style={{ color: TEXT2, textDecoration: 'none', fontSize: 12, padding: '7px 10px', borderRadius: 7, display: 'block', fontFamily: MONO, transition: 'background 100ms, color 100ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; (e.currentTarget as HTMLElement).style.color = PINK }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
        >{clean(u)}</a>
      )}
    />
  )
}

// ── Metrics bar ───────────────────────────────────────────────────────────────
function MetricsBar({ meta, topViews, markeeCount, entry, ethPrice }: {
  meta: { totalLeaderboardFunds: bigint; address: string }
  topViews: number
  markeeCount: number
  entry: EcoEntry | null
  ethPrice: number | null
}) {
  const totalEth = parseFloat(formatEther(meta.totalLeaderboardFunds))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const cell = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{label}</span>
      {node}
    </div>
  )
  const val = (text: string, color = TEXT) => (
    <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{text}</span>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, padding: '26px 0', borderTop: `1px solid ${BORDER}` }}>
      {cell('Platform', <PlatformCell entry={entry} />)}
      {cell('Served on', <ServedOnCell entry={entry} />)}
      {cell('Total funds added', val(totalLabel, GREEN))}
      {cell('Total views', val(formatViews(topViews), BLUE))}
      {cell('Messages bought', val(markeeCount.toLocaleString()))}
      {cell('Contract address',
        <a href={getAddressUrl(CANONICAL_CHAIN_ID, meta.address)} target="_blank" rel="noopener noreferrer"
          style={{ alignSelf: 'flex-start', fontFamily: MONO, fontSize: 15, color: PINK, textDecoration: 'none', borderBottom: `1px dotted ${PINK}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {fmtAddr(meta.address)} <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}

// ── Featured card ─────────────────────────────────────────────────────────────
function FeaturedCard({ markee, topViews, ethPrice, onBuy }: {
  markee: LeaderboardMarkee
  topViews: number
  ethPrice: number | null
  onBuy: () => void
}) {
  const [hover, setHover] = useState(false)
  const priceEth = parseFloat(formatEther(priceToOvertake(markee.totalFundsAdded)))
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`
  const displayName = markee.name || fmtAddr(markee.owner)

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 2, textTransform: 'uppercase' as const }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, boxShadow: `0 0 12px ${PINK}` }} />
        <span>Top Message</span>
        <span style={{ flex: 1, height: 1, background: BORDER, marginLeft: 8 }} />
      </div>

      <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={markee.address}>
        <button
          onClick={onBuy}
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
            <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markee.address} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: BLUE }}>
              <Eye size={10} style={{ opacity: 0.7 }} /> {formatViews(topViews)}
            </span>
          </div>

          {/* message */}
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 'clamp(20px, 3vw, 34px)', lineHeight: 1.12, letterSpacing: '-0.02em', textWrap: 'balance' as any, background: `linear-gradient(120deg, ${TEXT} 0%, ${PINK} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {markee.message || 'No message yet'}
          </div>

          {/* bottom-right: author */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, fontSize: 13, color: TEXT2, flexWrap: 'wrap' }}>
            <span style={{ color: MUTED }}>-</span>
            {markee.name && <span style={{ color: TEXT }}>{markee.name}</span>}
            <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11 }}>{fmtAddr(markee.owner)}</span>
          </div>

          {/* hover price pill */}
          <span style={{ position: 'absolute', bottom: -15, left: '50%', transform: `translateX(-50%) ${hover ? 'translateY(0)' : 'translateY(4px)'}`, display: 'inline-flex', alignItems: 'center', gap: 6, background: PINK, color: BG, fontFamily: MONO, fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 8, whiteSpace: 'nowrap' as const, boxShadow: '0 8px 28px rgba(248,151,254,0.42)', opacity: hover ? 1 : 0, transition: 'opacity 180ms, transform 180ms', pointerEvents: 'none', zIndex: 3 }}>
            {priceLabel} to change
          </span>
        </button>
      </ModeratedContent>
    </div>
  )
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ markee }: { markee: LeaderboardMarkee }) {
  return (
    <div style={{ gridColumn: '1 / -1', background: BG, borderTop: `1px solid ${BORDER}`, padding: '12px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <ExternalLink size={13} style={{ color: MUTED, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: TEXT2 }}>View full transaction history on</span>
      <a href={getAddressUrl(CANONICAL_CHAIN_ID, markee.address)} target="_blank" rel="noopener noreferrer"
        style={{ fontFamily: MONO, fontSize: 13, color: PINK, textDecoration: 'none', borderBottom: `1px dotted ${PINK}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        Basescan {fmtAddr(markee.address)} <ExternalLink size={10} />
      </a>
    </div>
  )
}

// ── Leaderboard row ───────────────────────────────────────────────────────────
const LB_COLS = '150px 120px 1fr 70px 200px'

function LeaderRow({ markee, views, ethPrice, featured, isOwner, onAddFunds, onEdit }: {
  markee: LeaderboardMarkee
  views: number
  ethPrice: number | null
  featured: boolean
  isOwner: boolean
  onAddFunds: (m: LeaderboardMarkee) => void
  onEdit: (m: LeaderboardMarkee) => void
}) {
  const [open, setOpen] = useState(false)
  const fundsEth = parseFloat(formatEther(markee.totalFundsAdded))
  const fundsLabel = ethPrice ? formatUsd(fundsEth * ethPrice) : `${fundsEth.toFixed(3)} ETH`
  const displayWho = markee.name || fmtAddr(markee.owner)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: LB_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', background: featured ? `${PINK}0A` : 'transparent', borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent', transition: 'background 120ms' }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{displayWho}</span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: BLUE, fontWeight: 600 }}>{fundsLabel}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{markee.message || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message</span>}</span>
        <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Eye size={10} style={{ opacity: 0.6 }} /> {views > 0 ? formatViews(views) : '—'}
        </span>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const }}
          >
            History <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
          </button>
          {isOwner && (
            <button
              onClick={() => onEdit(markee)}
              style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}44`, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onAddFunds(markee)}
            style={{ background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}
          >
            Add Funds
          </button>
        </div>
      </div>
      {open && <HistoryPanel markee={markee} />}
    </>
  )
}

// ── Embed panel ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
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

function CodeBlock({ code, label, hideCopy }: { code: string; label?: string; hideCopy?: boolean }) {
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
      <div style={{ background: '#030714', border: `1px solid rgba(138,143,191,0.15)`, borderRadius: 10, padding: '14px 16px', maxHeight: 220, overflowY: 'auto' as const }}>
        <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, color: TEXT2, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, lineHeight: 1.65 }}>
          {code}
        </pre>
      </div>
    </div>
  )
}

// ── GitHub verify sub-component ───────────────────────────────────────────────
function GitHubVerify({ address }: { address: string }) {
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

  useEffect(() => {
    fetch('/api/github/me')
      .then(r => r.json())
      .then((me: { connected: boolean; login?: string }) => {
        if (!me.connected) { setStep('not-connected'); return }
        setLogin(me.login ?? null)
        return fetch('/api/github/my-repos').then(r => r.json())
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
      } else {
        setError(data.error ?? 'Registration failed')
        setStep('ready')
      }
    } catch {
      setError('Network error'); setStep('ready')
    }
  }

  const inputStyle = {
    background: '#030714', border: `1px solid ${BORDER}`, borderRadius: 7,
    padding: '7px 10px', fontFamily: MONO, fontSize: 12, color: TEXT,
    width: '100%', outline: 'none',
  }

  if (step === 'checking') return (
    <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>Checking connection…</span>
  )

  if (step === 'not-connected') return (
    <a
      href={`/api/github/connect?returnTo=${encodeURIComponent(`/markee/${address}?embed=1`)}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: '#030714', border: `1px solid ${BORDER}`,
        borderRadius: 8, padding: '8px 14px', fontFamily: MONO, fontSize: 12,
        color: TEXT2, textDecoration: 'none', transition: 'border-color 140ms, color 140ms',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
    >
      <GithubIcon size={13} color="currentColor" />
      Connect GitHub to link a file
    </a>
  )

  if (step === 'done' && result) return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={result.verified ? GREEN : MUTED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span style={{ fontFamily: MONO, fontSize: 12, color: result.verified ? GREEN : TEXT2, lineHeight: 1.5 }}>
        {result.verified
          ? `Verified — ${result.filePath} is linked`
          : `Linked — add the delimiter snippet to ${result.filePath}, commit it, then Sync Message`}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {login && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GithubIcon size={11} color={MUTED} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{login}</span>
        </div>
      )}
      <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)} disabled={step === 'registering'} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="">Select repository…</option>
        {repos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
      </select>
      {selectedRepo && (
        <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)} disabled={loadingFiles || step === 'registering'} style={{ ...inputStyle, cursor: loadingFiles ? 'wait' : 'pointer' }}>
          <option value="">{loadingFiles ? 'Loading files…' : 'Select markdown file…'}</option>
          {files.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      )}
      {error && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,100,120,0.9)' }}>{error}</span>}
      <button
        onClick={handleRegister}
        disabled={!selectedRepo || !selectedFile || step === 'registering'}
        style={{
          alignSelf: 'flex-start', background: PINK, color: BG, border: 'none',
          borderRadius: 7, padding: '8px 16px', fontFamily: MONO, fontWeight: 700,
          fontSize: 12, cursor: (!selectedRepo || !selectedFile || step === 'registering') ? 'not-allowed' : 'pointer',
          opacity: (!selectedRepo || !selectedFile || step === 'registering') ? 0.5 : 1, transition: 'opacity 140ms',
        }}
      >
        {step === 'registering' ? 'Linking…' : 'Link & Verify File'}
      </button>
    </div>
  )
}

// ── OpenInternet verify sub-component ─────────────────────────────────────────
function OpenInternetVerify({ address }: { address: string }) {
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

function EmbedPanel({ address, name, platform }: { address: string; name?: string; platform?: string }) {
  const [websiteOpen, setWebsiteOpen] = useState(false)

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
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Add these delimiters to your markdown file once to mark where the Markee block is rendered. Use the Sync and Refresh buttons above to push the current message and pull traffic stats.
                </p>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                <CodeBlock code={delimiterSnippet} label="Add to your markdown file and commit" />
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  <button
                    onClick={() => setWebsiteOpen(v => !v)}
                    style={{ background: 'transparent', border: 'none', color: TEXT2, fontSize: 13, fontFamily: MONO, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: websiteOpen ? 'rotate(90deg)' : 'none', transition: 'transform 140ms' }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    Also embed on a website
                  </button>
                  {websiteOpen && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Copy this prompt into any AI coding agent with access to your site</span>
                        <CopyButton text={llmPrompt} />
                      </div>
                      <CodeBlock code={llmPrompt} hideCopy />
                    </div>
                  )}
                </div>
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
            </>
          )}
      {/* ── Verify Integration ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 20px' }}>
        <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase' as const, color: MUTED, letterSpacing: '0.08em', marginBottom: 12 }}>
          Verify Integration
        </div>
        {isGithub
          ? <GitHubVerify address={address} />
          : <OpenInternetVerify address={address} />
        }
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton() {
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
          <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: LB_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                {[...Array(5)].map((_, j) => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MarkeeDetailPage() {
  const params = useParams()
  const leaderboardAddress = params.address as string
  const ethPrice = useEthPrice()
  const { address: connectedAddress } = useAccount()

  const { meta, markees: allMarkees, isLoading } = useLeaderboardDetail(leaderboardAddress)
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

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="marketplace" useRegularLinks />

      {isLoading ? (
        <Skeleton />
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

            <FeaturedCard markee={topMarkee} topViews={topViews} ethPrice={ethPrice} onBuy={openBuy} />
            <div style={{ height: 28 }} />
            <MetricsBar meta={{ totalLeaderboardFunds: totalFunds, address: leaderboardAddress }} topViews={topViews} markeeCount={markees.length} entry={ecoEntry} ethPrice={ethPrice} />
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
                <div style={{ minWidth: 720, background: BG2 }}>
                  {/* column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: LB_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center', borderLeft: '3px solid transparent' }}>
                    {['Bought by', 'Funds added', 'Current message', 'Views', ''].map((h, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{h}</span>
                    ))}
                  </div>
                  {markees.map((m, i) => (
                    <LeaderRow
                      key={m.address}
                      markee={m}
                      views={viewsMap.get(m.address.toLowerCase()) ?? 0}
                      ethPrice={ethPrice}
                      featured={i === 0}
                      isOwner={!!connectedAddress && m.owner.toLowerCase() === connectedAddress.toLowerCase()}
                      onAddFunds={openAddFunds}
                      onEdit={openEdit}
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
          onSuccess={() => setBuyOpen(false)}
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
          onSuccess={() => { setAddFundsOpen(false); setModalTarget(null) }}
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
          onSuccess={() => { setEditOpen(false); setModalTarget(null) }}
          userMarkee={modalTarget as any}
          initialMode="updateMessage"
          strategyAddress={modalTarget.pricingStrategy as `0x${string}`}
        />
      )}

    </div>
  )
}
