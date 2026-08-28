'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { Globe2, Github, Zap, ExternalLink, Code2, Pencil, X, ChevronDown, Info, Menu } from 'lucide-react'
import { EditWebsiteMetaModal } from '@/components/modals/EditWebsiteMetaModal'
import { IntegrationHealthStatus } from '@/components/IntegrationHealthStatus'
import { EmbedModal } from '@/components/modals/EmbedModal'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StrategyBadge } from '@/components/StrategyBadge'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { MarkeeSignModal } from '@/components/modals/MarkeeSignModal'
import { EditMessageModal } from '@/components/modals/EditMessageModal'
import { StreamActivateModal } from '@/components/modals/StreamActivateModal'
import { StreamSignModal } from '@/components/modals/StreamSignModal'
import { DepositManagerModal } from '@/components/modals/DepositManagerModal'
import { useLiveBalance, formatLiveEth } from '@/hooks/useLiveBalance'
import { needsVerificationGate, isVerifiedLeaderboard } from '@/lib/leaderboards/verification'
import { type StreamStatus, streamStatusOf, StreamStatusIcon } from '@/components/board-detail/shared'
import { MONO, PINK, BLUE, GREEN, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import { logoDevUrl } from '@/lib/utils'

// ── Design tokens ─────────────────────────────────────────────────────────────
const SANS   = 'Manrope, system-ui, sans-serif'
const PURP   = '#7B6AF4'
const GOLD   = '#FFD45E'
const SILVER = '#C7CCD6'
const BRONZE = '#CD7F32'
const AMBER  = '#FFB020'

// ── Types ─────────────────────────────────────────────────────────────────────
interface BaseLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  topMessage: string | null
  topMessageOwner?: string | null
  topFundsAddedRaw: string
  topRateRaw?: string
  minimumPriceRaw?: string
  strategy?: 'fixed' | 'streaming'
  // Verification is address-based, not platform-based -- a streaming board can be integrated on a
  // website, GitHub, both, or neither, independent of its on-chain platform tag. Populated for every
  // board (any platform) from /api/account/verification-status, not just website/github-tagged ones.
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  // Set on boards from the shared "For Sale" factory (see /api/forsale/leaderboards) -- unlike the
  // three legacy per-vertical factories, there's no migration history to exempt these from needing a
  // verified integration to reach "Active Markees".
  verificationGated?: boolean
}
interface SuperfluidLeaderboard extends BaseLeaderboard { platform: 'superfluid' }
interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl: string
  repoHtmlUrl: string
  filePath: string
  verified: boolean
}

interface GithubLeaderboard extends BaseLeaderboard {
  platform: 'github'
  repoFullName: string | null
  repoAvatarUrl: string | null
  repoHtmlUrl: string | null
  filePath: string | null
  linkedFiles: LinkedFile[]
}
interface WebsiteLeaderboard extends BaseLeaderboard {
  platform: 'website'
  creator: string | null
  logoUrl: string | null
  siteUrl: string | null
  verifiedUrl: string | null
  verifiedUrls: string[]
  status: 'pending' | 'verified'
  isLegacy: boolean
  slug?: string
}
type AnyLeaderboard = SuperfluidLeaderboard | GithubLeaderboard | WebsiteLeaderboard

interface MyMessage {
  address: string
  message: string
  name: string
  totalFundsAdded: bigint
  createdAt: number
  strategyId: string
  strategyName: string
  isTop: boolean
  topFunds: bigint
  strategy?: 'fixed' | 'streaming'
  rank?: number | null
  flowRateRaw?: string
  // Legacy TopDawg (subgraph-sourced) vs v1.x LeaderboardFactory (RPC-sourced) — determines
  // whether MarkeeSignModal's RPC-only useLeaderboardDetail can safely target this markee's board.
  isLegacy: boolean
  // Verification data for the leaderboard this message lives on -- absent for legacy
  // subgraph-sourced rows (the subgraph query doesn't carry it), which just fall back to the
  // "Add to Your Site" / blank state like any other missing-data default in this file.
  platform?: string | null
  admin?: string | null
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  siteUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
}

interface FundedMessage {
  address: string
  message: string
  name: string
  totalFundsAdded: string
  totalContributed: string
  strategyId: string
  strategyName: string
  isTop: boolean
  topFundsRaw: string
  strategy?: 'fixed' | 'streaming'
  rank?: number | null
  flowRateRaw?: string
  platform?: string | null
  admin?: string | null
  verifiedUrls?: string[]
  linkedFiles?: LinkedFile[]
  siteUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
}

// ── GraphQL ───────────────────────────────────────────────────────────────────
const MY_MESSAGES_QUERY = `
  query GetMyMessages($owner: String!) {
    markees(
      where: { owner: $owner }
      orderBy: totalFundsAdded
      orderDirection: desc
      first: 50
    ) {
      id
      address
      message
      name
      totalFundsAdded
      createdAt
      strategy {
        id
        instanceName
        markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1) {
          address
          totalFundsAdded
        }
      }
      partnerStrategy {
        id
        instanceName
        markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1) {
          address
          totalFundsAdded
        }
      }
    }
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtEth(wei: bigint) {
  const n = Number(wei) / 1e18
  if (n === 0) return '0 ETH'
  if (n < 0.001) return '< 0.001 ETH'
  return `${n.toFixed(3)} ETH`
}

function fmtAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function platformColor(lb: AnyLeaderboard) {
  if (lb.platform === 'github')     return TEXT2
  if (lb.platform === 'superfluid') return GREEN
  return PINK
}

function platformSubtitle(lb: AnyLeaderboard) {
  if (lb.platform === 'github') {
    const gh = lb as GithubLeaderboard
    return gh.repoFullName || lb.name || 'GitHub'
  }
  if (lb.platform === 'superfluid') return lb.name || 'Superfluid'
  const w = lb as WebsiteLeaderboard
  const u = w.verifiedUrls?.[0] || w.verifiedUrl || w.siteUrl
  return u ? u.replace(/^https?:\/\//, '').replace(/\/$/, '') : (lb.name || fmtAddr(lb.address))
}

function platformHref(lb: AnyLeaderboard) {
  if (lb.platform === 'github')
    return (lb as GithubLeaderboard).repoHtmlUrl || `https://github.com`
  if (lb.platform === 'superfluid') return 'https://superfluid.finance'
  const w = lb as WebsiteLeaderboard
  return w.verifiedUrls?.[0] || w.siteUrl || `https://${lb.address}`
}

function detailUrl(lb: AnyLeaderboard) {
  return `/markee/${lb.address}`
}

// Fixed-price website boards: go through the URL verify/integrate/edit management flows.
function isFixedWebsiteBoard(lb: AnyLeaderboard): lb is WebsiteLeaderboard {
  return lb.platform === 'website' && lb.strategy !== 'streaming'
}

// Extract hostname from a URL for use with logo.dev. Returns null if unparseable.
function getLogoDomain(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).hostname } catch { return null }
}

// Company logo via logo.dev CDN. Falls back to 🪧 if the image fails to load.
function LogoIcon({ domain, size = 14 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span style={{ fontSize: size, lineHeight: 1 }}>🪧</span>
  return (
    <Image
      src={logoDevUrl(domain)}
      alt={`${domain} logo`}
      width={size}
      height={size}
      style={{ objectFit: 'contain', borderRadius: 2 }}
      onError={() => setFailed(true)}
    />
  )
}

// ── Platform icon ─────────────────────────────────────────────────────────────
function PlatIcon({ lb, size = 20 }: { lb: AnyLeaderboard; size?: number }) {
  if (lb.platform === 'github')     return <Github size={size} style={{ color: TEXT2 }} />
  if (lb.platform === 'superfluid') return <Zap size={size} style={{ color: GREEN }} />
  return <Globe2 size={size} style={{ color: PINK }} />
}

// ── Overview stats ────────────────────────────────────────────────────────────
function GlowDot({ size = 8, color }: { size?: number; color: string }) {
  return <span style={{ width: size, height: size, borderRadius: 99, background: color, boxShadow: `0 0 ${size * 1.5}px ${color}`, flexShrink: 0, display: 'inline-block' }} />
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        onClick={() => setOpen(true)}
        style={{
          width: 22, height: 22, borderRadius: 99,
          border: `1px solid ${BORDER}`, background: 'rgba(138,143,191,0.08)',
          color: MUTED, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'help', padding: 0,
        }}
      >
        <Info size={12} />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', right: 0, bottom: 'calc(100% + 8px)',
            width: 250, padding: '9px 11px', borderRadius: 8,
            background: BG2, border: `1px solid ${BORDER}`,
            boxShadow: '0 12px 34px rgba(0,0,0,0.5)',
            color: TEXT2, fontSize: 12, lineHeight: 1.45, zIndex: 30,
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

function Overview({ raised, active, bought, contributed, loaded }: { raised: bigint; active: number; bought: number; contributed: bigint; loaded: boolean }) {
  const cells = [
    { n: fmtEth(raised),      label: 'total raised',    color: PINK,  tip: 'Funds raised by Markees you created. This is not ETH you spent buying messages.' },
    { n: String(active),      label: 'active signs',    color: GREEN, tip: 'Your live Markees with funded messages. Website Markees also need a verified integration to count here.' },
    { n: String(bought),      label: 'messages bought', color: TEXT,  tip: 'Paid messages you own. Zero-fund placeholder Markees are not counted.' },
    { n: fmtEth(contributed), label: 'contributed',     color: BLUE,  tip: 'Total ETH you put into messages, including messages you bought and messages you funded.' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      {loaded ? cells.map((c, i) => (
        <div key={i} style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <GlowDot size={8} color={c.color} />
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: c.color, letterSpacing: -0.5, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{c.n}</span>
            </div>
            <InfoTip text={c.tip} />
          </div>
          <div style={{ color: TEXT2, fontSize: 13, fontWeight: 600 }}>{c.label}</div>
        </div>
      )) : [1, 2, 3, 4].map(i => (
        <div key={i} style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: 'rgba(138,143,191,0.15)', flexShrink: 0 }} />
            <div style={{ width: 80, height: 22, background: 'rgba(138,143,191,0.08)', borderRadius: 6 }} />
          </div>
          <div style={{ width: 100, height: 13, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
type TabId = 'pending' | 'live' | 'archive' | 'bought'

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

function Tabs({ tab, setTab, counts }: { tab: TabId; setTab: (t: TabId) => void; counts: { pending: number; live: number; archive: number; bought: number } }) {
  const narrow = useNarrow()
  const [menuOpen, setMenuOpen] = useState(false)
  const items: { key: TabId; label: string; n: number; amber?: boolean }[] = [
    ...(counts.pending > 0 ? [{ key: 'pending' as const, label: 'Pending Setup', n: counts.pending, amber: true }] : []),
    { key: 'live',  label: 'My Live Markees',        n: counts.live },
    ...(counts.archive > 0 ? [{ key: 'archive' as const, label: 'Archive', n: counts.archive }] : []),
    { key: 'bought', label: "Messages I've Bought",  n: counts.bought },
  ]

  if (narrow) {
    const active = items.find(it => it.key === tab) ?? items[0]
    return (
      <div style={{ position: 'relative', borderBottom: `1px solid ${BORDER}` }}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 4px', color: TEXT, fontFamily: SANS }}
        >
          <Menu size={18} color={MUTED} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1, textAlign: 'left' }}>{active.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: active.amber ? AMBER : PINK, background: `${active.amber ? AMBER : PINK}1E`, borderRadius: 99, padding: '1px 8px', flexShrink: 0 }}>{active.n}</span>
          <ChevronDown size={16} color={MUTED} style={{ flexShrink: 0, transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 140ms' }} />
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 12px 36px rgba(0,0,0,0.5)', zIndex: 20, overflow: 'hidden' }}>
              {items.map(it => {
                const on = tab === it.key
                const accent = it.amber ? AMBER : PINK
                return (
                  <button
                    key={it.key}
                    onClick={() => { setTab(it.key); setMenuOpen(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: on ? `${accent}0F` : 'transparent', border: 'none', cursor: 'pointer', padding: '12px 16px', color: on ? TEXT : TEXT2, fontWeight: on ? 700 : 500, fontSize: 14, fontFamily: SANS, textAlign: 'left' }}
                  >
                    <span style={{ flex: 1 }}>{it.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: on ? accent : MUTED, background: on ? `${accent}1E` : `${MUTED}1E`, borderRadius: 99, padding: '1px 8px' }}>{it.n}</span>
                  </button>
                )
              })}
              <Link
                href="/create-a-markee"
                style={{ display: 'block', padding: '12px 16px', borderTop: `1px solid ${BORDER}`, color: PINK, fontWeight: 700, fontSize: 14, fontFamily: SANS, textDecoration: 'none' }}
              >
                + Create a New Markee
              </Link>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BORDER}`, overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {items.map(it => {
          const on = tab === it.key
          const accent = it.amber ? AMBER : PINK
          return (
            <button key={it.key} onClick={() => setTab(it.key)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 18px', color: on ? TEXT : (it.amber ? AMBER : MUTED), fontWeight: on ? 700 : 500, fontSize: 15, fontFamily: SANS, whiteSpace: 'nowrap', borderBottom: `2px solid ${on ? accent : 'transparent'}`, marginBottom: -1, display: 'flex', alignItems: 'center', gap: 8 }}>
              {it.label}
              <span style={{ fontFamily: MONO, fontSize: 12, color: on ? accent : (it.amber ? AMBER : MUTED), background: on ? `${accent}1E` : `${it.amber ? AMBER : MUTED}1E`, borderRadius: 99, padding: '1px 8px' }}>{it.n}</span>
            </button>
          )
        })}
      </div>
      <Link href="/create-a-markee" style={{ flexShrink: 0, marginLeft: 16, marginRight: 4, padding: '8px 16px', background: PINK, color: BG, borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: SANS, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        + Create a New Markee
      </Link>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: 'active' | 'draft' | 'pending' }) {
  const live = status === 'active'
  const col = live ? GREEN : BLUE
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, background: `${col}1E`, border: `1px solid ${col}66`, color: col }}>
      <GlowDot size={6} color={col} /> {live ? 'Active' : 'Integration Needed'}
    </span>
  )
}

// ── Markee card for draft / inactive boards ───────────────────────────────────
function MarkeeCardDash({ lb, archived, onIntegrate, onVerify, onEdit, onArchive, onUnarchive }: {
  lb: AnyLeaderboard
  archived?: boolean
  onIntegrate?: () => void
  onVerify?: () => void
  onEdit?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
}) {
  const isDraft = BigInt(lb.topFundsAddedRaw ?? '0') === 0n
  const hasMessage = !!lb.topMessage
  const sub = platformSubtitle(lb)

  return (
    <div style={{ background: BG, border: `1px solid ${isDraft && !archived ? `${BLUE}4D` : BORDER}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, opacity: archived ? 0.6 : 1 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: BG2, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PlatIcon lb={lb} size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ color: TEXT, fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lb.name}</div>
              {lb.strategy === 'streaming' && <StrategyBadge strategy="streaming" size="xs" />}
            </div>
            <div style={{ color: MUTED, fontSize: 12, fontFamily: MONO }}>{sub}</div>
          </div>
        </div>
        {archived
          ? <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 99, padding: '4px 10px', flexShrink: 0 }}>Archived</span>
          : <StatusPill status={isDraft ? 'draft' : 'active'} />
        }
      </div>

      {/* message box */}
      {hasMessage ? (
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, minHeight: 78 }}>
          <p style={{ margin: 0, color: TEXT, fontFamily: MONO, fontSize: 13, lineHeight: 1.5 }}>{lb.topMessage}</p>
          {lb.topMessageOwner && <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 12, textAlign: 'right' }}>- {lb.topMessageOwner}</p>}
        </div>
      ) : (
        <div style={{ background: BG2, border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 14, minHeight: 78, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
          <span style={{ fontSize: 22 }}>🪧</span>
          <span style={{ color: MUTED, fontSize: 12 }}>Be the first to buy a message</span>
        </div>
      )}

      {/* actions */}
      {archived ? (
        <button onClick={onUnarchive} style={{ width: '100%', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 11, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: SANS }}>Unarchive</button>
      ) : isDraft ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {(onIntegrate || onVerify) && (
            <button onClick={onIntegrate || onVerify} style={{ flex: 1, background: BLUE, color: BG, border: 'none', borderRadius: 8, padding: 11, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: SANS }}>Finish Setup</button>
          )}
          {!onIntegrate && !onVerify && (
            <Link href={`/markee/${lb.address}`} style={{ flex: 1, display: 'block', textAlign: 'center', background: BLUE, color: BG, border: 'none', borderRadius: 8, padding: 11, fontWeight: 700, fontSize: 14, textDecoration: 'none', fontFamily: SANS }}>Buy First Message</Link>
          )}
          {onArchive && (
            <button onClick={onArchive} title="Archive" style={{ flexShrink: 0, background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '11px 14px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: SANS }}>Archive</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/markee/${lb.address}`} style={{ flex: 1, textAlign: 'center', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 13, textDecoration: 'none', fontFamily: SANS }}>View</Link>
          {onEdit && <button onClick={onEdit} style={{ flex: 1, background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>Edit</button>}
        </div>
      )}

      {/* verified URLs health */}
      {lb.platform === 'website' && (lb as WebsiteLeaderboard).verifiedUrls?.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(lb as WebsiteLeaderboard).verifiedUrls.map(url => (
            <div key={url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              <IntegrationHealthStatus url={url} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Markee name cell (placard icon + the markee's own name) ──────────────────
function MarkeeNameCell({ lb }: { lb: AnyLeaderboard }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15, lineHeight: 1 }}>
        🪧
      </span>
      <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lb.name}
      </span>
    </span>
  )
}

// ── Section header count pill ─────────────────────────────────────────────────
function CountBadge({ n }: { n: number }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: TEXT2, background: 'rgba(138,143,191,0.15)', borderRadius: 99, padding: '2px 10px' }}>{n}</span>
  )
}

// ── Sortable column header ────────────────────────────────────────────────────
function SortHead({ label, col, sortKey, sortDir, onSort, align = 'right' }: { label: string; col: string; sortKey: string; sortDir: string; onSort: (col: string) => void; align?: 'left' | 'right' }) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onSort(col)}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const,
        justifySelf: align === 'right' ? 'end' : 'start',
        fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const,
        color: active ? PINK : MUTED, transition: 'color 120ms',
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 8, opacity: active ? 1 : 0.4, lineHeight: 1 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}

// ── Shared table-sort state machine ───────────────────────────────────────────
// Every table below (Active/Archived/ReadyToEmbed/Bought/Funded) had its own copy of this exact
// sortKey/sortDir/onSort/sorted state -- pulled out once so the five don't drift independently.
// compareAscending should return the same sign convention as Array.sort's comparator when sorting
// ascending; direction (and the desc-vs-asc default when a column is first clicked) is applied here.
function useSortableTable<T>(
  items: T[],
  initialKey: string,
  compareAscending: (key: string, a: T, b: T) => number,
  opts: { initialDir?: 'asc' | 'desc'; ascByDefault?: (key: string) => boolean } = {},
) {
  const { initialDir = 'desc', ascByDefault } = opts
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: initialKey, dir: initialDir })

  const onSort = useCallback((col: string) => {
    setSort(prev => ({
      key: col,
      dir: prev.key === col ? (prev.dir === 'asc' ? 'desc' : 'asc') : (ascByDefault?.(col) ? 'asc' : 'desc'),
    }))
  }, [ascByDefault])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => compareAscending(sort.key, a, b) * dir)
  // compareAscending intentionally omitted: callers pass an inline function (a fresh reference every
  // render), and it only ever closes over field-accessor logic, never over changing outer state --
  // including it would re-sort on every render instead of only when the data or sort actually change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort])

  return { sortKey: sort.key, sortDir: sort.dir, onSort, sorted }
}

function compareByRaised<T extends { totalFundsRaw: string }>(_key: string, a: T, b: T): number {
  const at = BigInt(a.totalFundsRaw || '0')
  const bt = BigInt(b.totalFundsRaw || '0')
  return at > bt ? 1 : at < bt ? -1 : 0
}

const ascByDefaultRank = (col: string) => col === 'rank'

function compareBySpentOrRank<T extends { isTop: boolean; rank?: number | null }>(
  key: string, a: T, b: T, spent: (x: T) => bigint,
): number {
  if (key === 'rank') {
    const ar = (a.isTop ? 1 : a.rank) ?? Infinity
    const br = (b.isTop ? 1 : b.rank) ?? Infinity
    return ar - br
  }
  const as = spent(a), bs = spent(b)
  return as > bs ? 1 : as < bs ? -1 : 0
}

// ── Awaiting Activation table ─────────────────────────────────────────────────
const ACTIVATION_COLS = '1fr 150px 220px 160px'

function ActivationTable({ markees, onActivate, onArchive }: {
  markees: AnyLeaderboard[]
  onActivate: (lb: AnyLeaderboard) => void
  onArchive: (address: string) => void
}) {
  const fmtAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 640, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: ACTIVATION_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {['Markee Name', 'Pricing Strategy', 'Beneficiary', ''].map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i === 3 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
        </div>
        {markees.map(lb => (
          <div
            key={lb.address}
            onClick={() => window.location.href = `/markee/${lb.address}`}
            style={{ display: 'grid', gridTemplateColumns: ACTIVATION_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <MarkeeNameCell lb={lb} />
            <div>
              <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="sm" />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{fmtAddr(lb.admin)}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={e => { e.stopPropagation(); onActivate(lb) }}
                style={{ background: 'transparent', color: TEXT2, border: `1px solid ${TEXT2}`, borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}
              >
                Activate Markee
              </button>
              <button
                onClick={e => { e.stopPropagation(); onArchive(lb.address) }}
                title="Archive"
                style={{ background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', transition: 'color 120ms, border-color 120ms' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = TEXT2; el.style.borderColor = `${MUTED}66` }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = MUTED; el.style.borderColor = BORDER }}
              >
                Archive
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Ready to Embed table (website boards with active message but no verified URL) ──
const EMBED_COLS = '180px 1fr 90px 130px 160px 150px'
const EMBED_HEADERS_LEFT = ['Board Name', 'Current Message', 'Strategy'] as const

function ReadyToEmbedRow({ lb, onEmbed, ethPrice }: { lb: AnyLeaderboard; onEmbed: (lb: AnyLeaderboard) => void; ethPrice: number | null }) {
  const isStreaming = lb.strategy === 'streaming'
  const ratePerSec = isStreaming && lb.topRateRaw ? BigInt(lb.topRateRaw) : 0n
  const liveBalance = useLiveBalance(BigInt(lb.totalFundsRaw), ratePerSec)
  const hasActiveStream = ratePerSec > 0n
  return (
    <div
      onClick={() => window.location.href = `/markee/${lb.address}`}
      style={{ display: 'grid', gridTemplateColumns: EMBED_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <MarkeeNameCell lb={lb} />
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: lb.topMessage ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: lb.topMessage ? 'normal' : 'italic' }}>
        {lb.topMessage || 'No message yet'}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="sm" />
      </div>
      <RaisedCell balance={liveBalance} isLive={hasActiveStream} ethPrice={ethPrice} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <div style={{ textAlign: 'right' }}>
          {hasActiveStream
            ? <FlowRateCell weiPerSec={lb.topRateRaw} ethPrice={ethPrice} streamStatus="active" />
            : <SpentCell wei={BigInt(lb.totalFundsRaw)} ethPrice={ethPrice} />
          }
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={e => { e.stopPropagation(); onEmbed(lb) }}
          style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}
        >
          Add to Your Site
        </button>
      </div>
    </div>
  )
}

function ReadyToEmbedTable({ markees, onEmbed, ethPrice }: { markees: AnyLeaderboard[]; onEmbed: (lb: AnyLeaderboard) => void; ethPrice: number | null }) {
  const { sortKey, sortDir, onSort, sorted } = useSortableTable(markees, 'raised', compareByRaised)

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 760, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: EMBED_COLS, gap: 12, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {EMBED_HEADERS_LEFT.map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i >= 2 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SortHead label="Total Raised" col="raised" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Latest Spend</span>
          <span />
        </div>
        {sorted.map(lb => (
          <ReadyToEmbedRow key={lb.address} lb={lb} onEmbed={onEmbed} ethPrice={ethPrice} />
        ))}
      </div>
    </div>
  )
}

// ── Active Markees table ──────────────────────────────────────────────────────
const ACT_COLS = '200px 110px 1fr 116px'

function ServedOnCell({ lb }: { lb: AnyLeaderboard }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const iconBox = (child: React.ReactNode) => (
    <span style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      {child}
    </span>
  )

  const pill = (n: number) => (
    <button
      onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
      style={{ background: `${MUTED}20`, border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 99, padding: '1px 6px', fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const }}
    >
      +{n}
    </button>
  )

  const dropdown = (items: Array<{ href: string; label: string }>) => open && (
    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 6, minWidth: 220, zIndex: 50, boxShadow: '0 16px 44px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map(({ href, label }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: TEXT2, textDecoration: 'none', fontSize: 12, fontFamily: MONO, padding: '7px 10px', borderRadius: 6, display: 'block', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; (e.currentTarget as HTMLElement).style.color = PINK }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
        >
          {label}
        </a>
      ))}
    </div>
  )

  // GitHub-platform boards always render this way; other-platform boards (e.g. a "For Sale" factory
  // board, which carries no inherent platform tag) render it too once they have a verified linked
  // file -- Served On is derived from actual verification, not a rigid creation-time tag.
  const hasVerifiedGithubFile = (lb.linkedFiles ?? []).some(f => f.verified)
  if (lb.platform === 'github' || (lb.platform !== 'superfluid' && hasVerifiedGithubFile)) {
    const gh = lb as GithubLeaderboard
    const files = gh.linkedFiles ?? []
    const first = files[0] ?? null
    const extras = files.length - 1
    const fileUrl = (f: LinkedFile) => `https://github.com/${f.repoFullName}/blob/HEAD/${f.filePath}`
    return (
      <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, position: 'relative' as const }}>
        {iconBox(<Github size={13} style={{ color: TEXT2 }} />)}
        {first ? (
          <a
            href={fileUrl(first)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title={first.filePath}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, color: TEXT2, textDecoration: 'none', borderBottom: `1px dotted ${MUTED}` }}
          >
            {first.repoFullName}
          </a>
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, color: MUTED }}>
            {gh.repoFullName || 'GitHub'}
          </span>
        )}
        {extras > 0 && pill(extras)}
        {dropdown(files.map(f => ({ href: fileUrl(f), label: f.filePath })))}
      </span>
    )
  }

  if (lb.platform === 'superfluid') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {iconBox(
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/partners/superfluid.png" alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, color: TEXT2 }}>
          {lb.name || 'Superfluid'}
        </span>
      </span>
    )
  }

  // Website
  const w = lb as WebsiteLeaderboard
  const urls = w.verifiedUrls?.length ? w.verifiedUrls : w.verifiedUrl ? [w.verifiedUrl] : []
  const primaryUrl = urls[0] || w.siteUrl || null
  const primaryLabel = primaryUrl ? primaryUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : (lb.name || fmtAddr(lb.address))
  const extras = Math.max(0, urls.length - 1)
  const logoDomain = getLogoDomain(primaryUrl)
  return (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, position: 'relative' as const }}>
      {iconBox(
        logoDomain
          ? <LogoIcon domain={logoDomain} size={14} />
          : <Globe2 size={13} style={{ color: PINK }} />
      )}
      {primaryUrl ? (
        <a
          href={primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, color: TEXT2, textDecoration: 'none', borderBottom: `1px dotted ${MUTED}` }}
        >
          {primaryLabel}
        </a>
      ) : (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, color: MUTED }}>
          {lb.name || fmtAddr(lb.address)}
        </span>
      )}
      {extras > 0 && pill(extras)}
      {dropdown(urls.map(u => ({ href: u, label: u.replace(/^https?:\/\//, '').replace(/\/$/, '') })))}
    </span>
  )
}

const ACTIVE_COLS = '180px 1fr 90px 130px 160px 110px'
const ACTIVE_HEADERS_LEFT = ['Served on', 'Current Message', 'Strategy'] as const

function RaisedCell({ balance, isLive, ethPrice }: { balance: bigint; isLive: boolean; ethPrice: number | null }) {
  const eth = Number(balance) / 1e18
  const usd = ethPrice ? eth * ethPrice : null
  if (isLive) {
    return (
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ fontFamily: MONO, fontSize: 11.5, color: BLUE, fontWeight: 600, letterSpacing: 0.3 }}>
          {formatLiveEth(balance, 10)} ETH
        </div>
        {usd !== null
          ? <div style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 1 }}>${usd.toFixed(2)}</div>
          : <div style={{ fontFamily: MONO, fontSize: 10, color: GREEN, marginTop: 1 }}>▲ live</div>
        }
      </div>
    )
  }
  const ethStr = eth === 0 ? '0 ETH' : eth < 0.001 ? '< 0.001 ETH' : `${eth.toFixed(3).replace(/\.?0+$/, '')} ETH`
  return (
    <div style={{ textAlign: 'right' as const }}>
      <div style={{ fontFamily: MONO, fontSize: 12.5, color: BLUE, fontWeight: 600 }}>{ethStr}</div>
      {usd !== null && <div style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 1 }}>${usd.toFixed(2)}</div>}
    </div>
  )
}

function ActiveTableRow({ lb, onManage, ethPrice }: { lb: AnyLeaderboard; onManage: (lb: AnyLeaderboard) => void; ethPrice: number | null }) {
  const isStreaming = lb.strategy === 'streaming'
  const ratePerSec = isStreaming && lb.topRateRaw ? BigInt(lb.topRateRaw) : 0n
  const liveBalance = useLiveBalance(BigInt(lb.totalFundsRaw), ratePerSec)
  const hasActiveStream = ratePerSec > 0n
  return (
    <div
      onClick={() => window.location.href = `/markee/${lb.address}`}
      style={{ display: 'grid', gridTemplateColumns: ACTIVE_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <ServedOnCell lb={lb} />
      <span style={{ fontFamily: MONO, fontSize: 12.5, color: lb.topMessage ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: lb.topMessage ? 'normal' : 'italic' }}>
        {lb.topMessage || 'No message yet'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="sm" />
      </div>
      <RaisedCell balance={liveBalance} isLive={hasActiveStream} ethPrice={ethPrice} />
      <div style={{ textAlign: 'right' as const }}>
        {hasActiveStream
          ? <FlowRateCell weiPerSec={lb.topRateRaw} ethPrice={ethPrice} streamStatus="active" />
          : <span style={{ color: MUTED }}>—</span>
        }
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={e => { e.stopPropagation(); onManage(lb) }}
          style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', transition: 'border-color 120ms, color 120ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${PINK}66`; (e.currentTarget as HTMLElement).style.color = TEXT }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
        >
          Manage
        </button>
      </div>
    </div>
  )
}

function ActiveTable({ markees, onManage, ethPrice }: { markees: AnyLeaderboard[]; onManage: (lb: AnyLeaderboard) => void; ethPrice: number | null }) {
  const { sortKey, sortDir, onSort, sorted } = useSortableTable(markees, 'raised', compareByRaised)

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 760, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: ACTIVE_COLS, gap: 12, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {ACTIVE_HEADERS_LEFT.map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i >= 2 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SortHead label="Total Raised" col="raised" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Streaming</span>
          <span />
        </div>
        {sorted.map(lb => (
          <ActiveTableRow key={lb.address} lb={lb} onManage={onManage} ethPrice={ethPrice} />
        ))}
      </div>
    </div>
  )
}

// ── Archived Markees table ────────────────────────────────────────────────────
function ArchivedTable({ markees, onUnarchive }: { markees: AnyLeaderboard[]; onUnarchive: (address: string) => void }) {
  const { sortKey, sortDir, onSort, sorted } = useSortableTable(markees, 'raised', compareByRaised)

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 600, background: BG2, opacity: 0.8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: ACT_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Served on</span>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <SortHead label="Total raised" col="raised" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="left" />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Current message</span>
          <span />
        </div>
        {sorted.map(lb => (
          <div
            key={lb.address}
            onClick={() => window.location.href = `/markee/${lb.address}`}
            style={{ display: 'grid', gridTemplateColumns: ACT_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <ServedOnCell lb={lb} />
            <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontWeight: 600 }}>{lb.totalFunds}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: lb.topMessage ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: lb.topMessage ? 'normal' : 'italic' }}>{lb.topMessage || 'No message yet'}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={e => { e.stopPropagation(); onUnarchive(lb.address) }}
                style={{ background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', transition: 'border-color 120ms, color 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${MUTED}66`; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = MUTED }}
              >
                Unarchive
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Stream status type/icon now live in board-detail/shared.tsx (also used by StreamSignModal's
// "Manage Your Stream" view) -- imported at the top of this file.

// ── Flow rate cell (wei/sec → ETH/mo blue top, $USD/mo grey bottom) ──────────
function FlowRateCell({ weiPerSec, ethPrice, streamStatus }: {
  weiPerSec: string | undefined
  ethPrice: number | null
  streamStatus?: StreamStatus
}) {
  const rate = BigInt(weiPerSec ?? '0')
  if (rate === 0n) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {streamStatus && <StreamStatusIcon status={streamStatus} />}
        <span style={{ color: MUTED }}>—</span>
      </div>
    )
  }
  const ethPerMonth = Number(rate) / 1e18 * 60 * 60 * 24 * 30
  const ethStr = ethPerMonth < 0.001 ? '< 0.001 ETH/mo' : `${ethPerMonth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
  const usd = ethPrice ? ethPerMonth * ethPrice : null
  return (
    <div style={{ textAlign: 'right' as const }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {streamStatus && <StreamStatusIcon status={streamStatus} />}
        <span style={{ fontFamily: MONO, fontSize: 12, color: BLUE, fontWeight: 600 }}>{ethStr}</span>
      </div>
      {usd !== null && <div style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 2 }}>${usd.toFixed(2)}/mo</div>}
    </div>
  )
}

// ── ETH + USD stacked cell ────────────────────────────────────────────────────
function SpentCell({ wei, ethPrice }: { wei: bigint; ethPrice: number | null }) {
  const eth = Number(wei) / 1e18
  const ethStr = eth === 0 ? '0 ETH' : eth < 0.001 ? '< 0.001 ETH' : `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH`
  const usd = ethPrice ? eth * ethPrice : null
  return (
    <div style={{ textAlign: 'right' as const }}>
      <div style={{ fontFamily: MONO, fontSize: 12.5, color: BLUE, fontWeight: 600 }}>{ethStr}</div>
      {usd !== null && <div style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 1 }}>${usd.toFixed(2)}</div>}
    </div>
  )
}

// ── Ranking cell ──────────────────────────────────────────────────────────────
function rankTierColor(r: number): string {
  if (r === 1) return GOLD
  if (r === 2) return SILVER
  if (r === 3) return BRONZE
  return MUTED
}

function RankingCell({ isTop, rank }: {
  isTop: boolean; rank: number | null | undefined
}) {
  const effectiveRank = isTop ? 1 : (rank ?? null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
      {effectiveRank != null
        ? <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            border: `1.5px solid ${rankTierColor(effectiveRank)}`,
            color: rankTierColor(effectiveRank),
            fontFamily: MONO, fontSize: 12, fontWeight: 800,
          }}>{effectiveRank}</span>
        : <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>—</span>
      }
    </div>
  )
}

// ── Messages I've Bought table ────────────────────────────────────────────────
const MSG_COLS = '190px 1fr 90px 120px 170px 100px'

// Bought/Funded rows are messages on OTHER people's leaderboards -- "Markee Name" (the creator's own
// label for their board) isn't meaningful to a buyer the way it is on the creator's own dashboard
// tabs. What matters here is where the board is actually served, same as every other table on this
// page, or -- if it isn't served anywhere verified yet -- a way to fix that from here rather than
// only from the board's own creator's account.
function toServedOnLb(m: MyMessage | FundedMessage): AnyLeaderboard {
  const base = {
    address: m.strategyId, name: m.strategyName, totalFunds: '', totalFundsRaw: '0',
    markeeCount: 0, admin: m.admin ?? '', topMessage: null, topFundsAddedRaw: '0',
    strategy: m.strategy, verifiedUrls: m.verifiedUrls ?? [], linkedFiles: m.linkedFiles ?? [],
  }
  if (m.platform === 'github') {
    return { ...base, platform: 'github', repoFullName: m.repoFullName ?? null, repoAvatarUrl: null, repoHtmlUrl: m.repoHtmlUrl ?? null, filePath: null, linkedFiles: m.linkedFiles ?? [] }
  }
  if (m.platform === 'superfluid') return { ...base, platform: 'superfluid' }
  return {
    ...base, platform: 'website', creator: null, logoUrl: null, siteUrl: m.siteUrl ?? null,
    verifiedUrl: (m.verifiedUrls ?? [])[0] ?? null, verifiedUrls: m.verifiedUrls ?? [], status: 'pending', isLegacy: false,
  }
}

function ServedOnOrAddToSite({ m, onAddToSite }: { m: MyMessage | FundedMessage; onAddToSite: (m: any) => void }) {
  const lb = toServedOnLb(m)
  const verified = isVerifiedLeaderboard(lb, { verifiedUrls: m.verifiedUrls, linkedFiles: m.linkedFiles })
  if (needsVerificationGate(lb) && !verified) {
    return (
      <button
        onClick={e => { e.stopPropagation(); onAddToSite(m) }}
        style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}
      >
        Add to Your Site
      </button>
    )
  }
  return <ServedOnCell lb={lb} />
}

function BoughtTable({ items, ethPrice, onEdit, onAddFunds, onAddToSite }: { items: MyMessage[]; ethPrice: number | null; onEdit: (m: MyMessage) => void; onAddFunds: (m: MyMessage) => void; onAddToSite: (m: MyMessage) => void }) {
  const { sortKey, sortDir, onSort, sorted } = useSortableTable(
    items, 'spent',
    (key, a, b) => compareBySpentOrRank(key, a, b, x => x.totalFundsAdded),
    { ascByDefault: ascByDefaultRank },
  )

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 800, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 12, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {(['Served On', 'Your Message', 'Strategy'] as const).map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i >= 2 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SortHead label="Total Spent" col="spent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Current Bid</span>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SortHead label="Your Rank" col="rank" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
        </div>
        {sorted.map(m => {
          const strategy = m.strategy ?? 'fixed'
          const isStreaming = strategy === 'streaming'
          const streamStatus = isStreaming ? streamStatusOf(m.isTop, m.flowRateRaw) : undefined
          return (
            <div
              key={m.address}
              onClick={() => window.location.href = `/markee/${m.strategyId || m.address}`}
              style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <ServedOnOrAddToSite m={m} onAddToSite={onAddToSite} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
                <button
                  onClick={e => { e.stopPropagation(); onEdit(m) }}
                  title="Edit message"
                  style={{ flexShrink: 0, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: MUTED, lineHeight: 0, transition: 'color 120ms, border-color 120ms' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = PINK; el.style.borderColor = `${PINK}66` }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = MUTED; el.style.borderColor = BORDER }}
                >
                  <Pencil size={11} />
                </button>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: m.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: m.message ? 'normal' : 'italic' }}>{m.message || 'No message'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><StrategyBadge strategy={strategy} size="sm" /></div>
              <SpentCell wei={m.totalFundsAdded} ethPrice={ethPrice} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <div style={{ textAlign: 'right' }}>
                  {isStreaming
                    ? <FlowRateCell weiPerSec={m.flowRateRaw} ethPrice={ethPrice} streamStatus={streamStatus} />
                    : <span style={{ color: MUTED }}>—</span>
                  }
                </div>
              </div>
              <RankingCell isTop={m.isTop} rank={m.rank} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Messages I've Funded table ────────────────────────────────────────────────
const FUNDED_COLS = '190px 1fr 90px 120px 170px 100px'

function FundedTable({ items, ethPrice, onAddFunds, onAddToSite }: { items: FundedMessage[]; ethPrice: number | null; onAddFunds: (m: FundedMessage) => void; onAddToSite: (m: FundedMessage) => void }) {
  const { sortKey, sortDir, onSort, sorted } = useSortableTable(
    items, 'spent',
    (key, a, b) => compareBySpentOrRank(key, a, b, x => BigInt(x.totalContributed)),
    { ascByDefault: ascByDefaultRank },
  )

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 800, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: FUNDED_COLS, gap: 12, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {(['Served On', 'Current Message', 'Strategy'] as const).map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i >= 2 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SortHead label="Total Spent" col="spent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Current Bid</span>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SortHead label="Your Rank" col="rank" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
        </div>
        {sorted.map(m => {
          const strategy = m.strategy ?? 'fixed'
          const isStreaming = strategy === 'streaming'
          const streamStatus = isStreaming ? streamStatusOf(m.isTop, m.flowRateRaw) : undefined
          return (
            <div
              key={m.address}
              onClick={() => window.location.href = `/markee/${m.strategyId || m.address}`}
              style={{ display: 'grid', gridTemplateColumns: FUNDED_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <ServedOnOrAddToSite m={m} onAddToSite={onAddToSite} />
              <span style={{ fontFamily: MONO, fontSize: 12.5, color: m.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: m.message ? 'normal' : 'italic' }}>{m.message || 'No message yet'}</span>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><StrategyBadge strategy={strategy} size="sm" /></div>
              <SpentCell wei={BigInt(m.totalContributed)} ethPrice={ethPrice} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <div style={{ textAlign: 'right' }}>
                  {isStreaming
                    ? <FlowRateCell weiPerSec={m.flowRateRaw} ethPrice={ethPrice} streamStatus={streamStatus} />
                    : <span style={{ color: MUTED }}>—</span>
                  }
                </div>
              </div>
              <RankingCell isTop={m.isTop} rank={m.rank} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Manage integrations modal ─────────────────────────────────────────────────
function ManageModal({ lb, onClose, onEmbed, onEdit }: { lb: AnyLeaderboard; onClose: () => void; onEmbed?: () => void; onEdit?: () => void }) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,10,42,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', margin: 'auto', background: BG2, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: -0.4 }}>{lb.name}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href={detailUrl(lb)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textDecoration: 'none', color: TEXT, fontSize: 14, fontWeight: 600 }}>
            <ExternalLink size={15} style={{ color: BLUE }} /> View leaderboard
          </Link>
          {onEdit && (
            <button onClick={() => { onClose(); onEdit() }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', color: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>
              <Pencil size={15} style={{ color: MUTED }} /> Edit website info
            </button>
          )}
          {onEmbed && (
            <button onClick={() => { onClose(); onEmbed() }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', color: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>
              <Code2 size={15} style={{ color: MUTED }} /> Embed
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ icon, title, body, ctaLabel, ctaHref }: { icon: string; title: string; body: string; ctaLabel: string; ctaHref: string }) {
  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px dashed ${BORDER}`, borderRadius: 16, padding: '56px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 30, marginBottom: 12 }}>{icon}</div>
      <p style={{ margin: '0 0 6px', color: TEXT, fontWeight: 700, fontSize: 17 }}>{title}</p>
      <p style={{ margin: '0 auto 20px', color: MUTED, fontSize: 14, maxWidth: '42ch', lineHeight: 1.55 }}>{body}</p>
      <Link href={ctaHref} style={{ display: 'inline-block', background: PINK, color: BG, fontWeight: 700, padding: '12px 22px', borderRadius: 10, textDecoration: 'none', fontFamily: MONO, fontSize: 14 }}>{ctaLabel}</Link>
    </div>
  )
}

// Cheap FNV-1a fingerprint of a board-address list, used only as a useEffect dependency -- avoids
// allocating an ~8.4KB comma-joined string of every address (up to 200 boards) on every render just
// to compare it for change.
function fingerprintAddresses(addrs: string[]): string {
  let hash = 2166136261
  for (const addr of addrs) {
    for (let i = 0; i < addr.length; i++) {
      hash ^= addr.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
  }
  return `${addrs.length}:${(hash >>> 0).toString(36)}`
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { activeAddress, hasWallet } = useActiveWallet()
  const ethPrice = useEthPrice()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [depositManagerOpen, setDepositManagerOpen] = useState(false)

  // Platform leaderboards
  const [superfluidBoards, setSuperfluidBoards] = useState<SuperfluidLeaderboard[]>([])
  const [githubBoards, setGithubBoards]         = useState<GithubLeaderboard[]>([])
  const [websiteBoards, setWebsiteBoards]       = useState<WebsiteLeaderboard[]>([])
  const [streamingBoards, setStreamingBoards]   = useState<AnyLeaderboard[]>([])
  const [isLoading, setIsLoading]               = useState(false)

  // Messages
  const [myMessages, setMyMessages]             = useState<MyMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [fundedMessages, setFundedMessages]     = useState<FundedMessage[]>([])
  const [isLoadingFunded, setIsLoadingFunded]   = useState(false)

  // UI state
  const [tab, setTab]                         = useState<TabId>('live')
  const [archived, setArchived]               = useState<string[]>([])
  const [manageTarget, setManageTarget]           = useState<AnyLeaderboard | null>(null)
  const [activateTarget, setActivateTarget]       = useState<AnyLeaderboard | null>(null)
  const [activateStreamBoard, setActivateStreamBoard] = useState<AnyLeaderboard | null>(null)
  const [editingBoard, setEditingBoard]         = useState<WebsiteLeaderboard | null>(null)
  const [embedTarget, setEmbedTarget]           = useState<AnyLeaderboard | null>(null)
  const [embedInitialPlatform, setEmbedInitialPlatform] = useState<'github' | 'website'>('website')
  const embedReopenApplied = useRef(false)
  const [editMessageTarget, setEditMessageTarget]       = useState<MyMessage | null>(null)
  const [streamEditTarget, setStreamEditTarget]         = useState<MyMessage | null>(null)
  const [addFundsTarget, setAddFundsTarget] = useState<{
    strategy: 'fixed' | 'streaming'
    strategyId: string
    markeeAddress: string
    message: string
    totalFundsAdded: bigint
    topFunds: bigint
    name?: string
    isLegacy?: boolean
  } | null>(null)

  const fetchAll = useCallback(async (addr: string) => {
    setIsLoading(true)
    try {
      const [sfRes, ghRes, oiRes, strRes, fsRes] = await Promise.all([
        fetch('/api/superfluid/leaderboards?bust=1',   { cache: 'no-store' }),
        fetch('/api/github/leaderboards?bust=1',       { cache: 'no-store' }),
        fetch('/api/openinternet/leaderboards?bust=1', { cache: 'no-store' }),
        fetch('/api/streaming/leaderboards?bust=1',    { cache: 'no-store' }),
        fetch('/api/forsale/leaderboards?bust=1',      { cache: 'no-store' }),
      ])
      if (sfRes.ok) {
        const data = await sfRes.json()
        setSuperfluidBoards(
          (data.leaderboards ?? [])
            .filter((lb: BaseLeaderboard & { creator?: string | null }) => (lb.creator ?? lb.admin).toLowerCase() === addr.toLowerCase())
            .map((lb: BaseLeaderboard) => ({ ...lb, platform: 'superfluid' as const }))
        )
      }
      if (ghRes.ok) {
        const data = await ghRes.json()
        setGithubBoards(
          (data.leaderboards ?? [])
            .filter((lb: any) => (lb.creator ?? lb.admin).toLowerCase() === addr.toLowerCase())
            .map((lb: any) => ({ ...lb, platform: 'github' as const, linkedFiles: lb.linkedFiles ?? [] }))
        )
      }
      if (oiRes.ok || fsRes.ok) {
        const oiData = oiRes.ok ? await oiRes.json() : { leaderboards: [] }
        const fsData = fsRes.ok ? await fsRes.json() : { leaderboards: [] }
        const byCreator = (lb: any) => {
          if (lb.isLegacy) return false
          const c = lb.creator ?? lb.admin
          return c && c.toLowerCase() === addr.toLowerCase()
        }
        setWebsiteBoards([
          ...(oiData.leaderboards ?? []).filter(byCreator).map((lb: any) => ({ ...lb, platform: 'website' as const })),
          ...(fsData.leaderboards ?? []).filter(byCreator).map((lb: any) => ({ ...lb, platform: 'website' as const })),
        ])
      }
      if (strRes.ok) {
        const data = await strRes.json()
        setStreamingBoards(
          (data.leaderboards ?? [])
            .filter((lb: any) => lb.admin && lb.admin.toLowerCase() === addr.toLowerCase())
            .map((lb: any): AnyLeaderboard => {
              if (lb.platform === 'github') {
                return { ...lb, platform: 'github', repoFullName: null, repoAvatarUrl: null, repoHtmlUrl: null, filePath: null, linkedFiles: [] }
              }
              if (lb.platform === 'superfluid') {
                return { ...lb, platform: 'superfluid' }
              }
              // Don't override verifiedUrls/logoUrl/etc — the streaming API already reads them from KV
              return { ...lb, platform: 'website' as const, creator: lb.admin ?? null, isLegacy: false }
            })
        )
      }
    } catch (err) {
      console.error('[account] fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchMyMessages = useCallback(async (addr: string) => {
    setIsLoadingMessages(true)
    try {
      const addrLow = addr.toLowerCase()

      // RPC-based: v1.1+ leaderboards (Superfluid, GitHub, OI v1.2+)
      const rpcPromise = fetch(`/api/account/messages?owner=${addrLow}`)
        .then(r => r.ok ? r.json() : null)
        .then((data): MyMessage[] => (data?.messages ?? []).map((m: any) => ({
          address: m.address,
          message: m.message ?? '',
          name: m.name ?? '',
          totalFundsAdded: BigInt(m.totalFundsAdded ?? '0'),
          createdAt: 0,
          strategyId: m.strategyId ?? '',
          strategyName: m.strategyName ?? 'Unknown Leaderboard',
          isTop: m.isTop ?? false,
          topFunds: BigInt(m.topFundsRaw ?? '0'),
          strategy: m.strategy ?? 'fixed',
          rank: m.rank ?? null,
          flowRateRaw: m.flowRateRaw ?? '0',
          isLegacy: false,
          platform: m.platform ?? null,
          admin: m.admin ?? null,
          verifiedUrls: m.verifiedUrls ?? [],
          linkedFiles: m.linkedFiles ?? [],
          siteUrl: m.siteUrl ?? null,
          repoFullName: m.repoFullName ?? null,
          repoHtmlUrl: m.repoHtmlUrl ?? null,
        })))
        .catch(() => [])

      // Subgraph-based: legacy TopDawg contracts
      const subgraphUrl = `https://gateway.thegraph.com/api/${process.env.NEXT_PUBLIC_GRAPH_TOKEN}/subgraphs/id/8kMCKUHSY7o6sQbsvufeLVo8PifxrsnagjVTMGcs6KdF`
      const subgraphPromise = process.env.NEXT_PUBLIC_GRAPH_TOKEN
        ? fetch(subgraphUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: MY_MESSAGES_QUERY, variables: { owner: addrLow } }) })
            .then(r => r.ok ? r.json() : null)
            .then((json): MyMessage[] => {
              const raw = json?.data?.markees ?? []
              return raw.map((m: any) => {
                const strat = m.partnerStrategy ?? m.strategy
                const topMarkees: { address: string; totalFundsAdded: string }[] = strat?.markees ?? []
                const topFunds = topMarkees[0] ? BigInt(topMarkees[0].totalFundsAdded) : 0n
                const isTop = topMarkees.length === 0 || topMarkees[0]?.address?.toLowerCase() === m.address?.toLowerCase()
                return { address: m.address, message: m.message ?? '', name: m.name ?? '', totalFundsAdded: BigInt(m.totalFundsAdded ?? '0'), createdAt: Number(m.createdAt ?? 0), strategyId: strat?.id ?? '', strategyName: strat?.instanceName ?? 'Unknown Leaderboard', isTop, topFunds, isLegacy: true }
              })
            })
            .catch(() => [])
        : Promise.resolve([] as MyMessage[])

      const [rpcMessages, subgraphMessages] = await Promise.all([rpcPromise, subgraphPromise])

      // Merge, deduplicating by markee address (RPC wins for duplicates)
      const seen = new Set(rpcMessages.map(m => m.address.toLowerCase()))
      const merged = [...rpcMessages, ...subgraphMessages.filter(m => !seen.has(m.address.toLowerCase()))]
      // Streaming markees have totalFundsAdded=0 on-chain (ETHx flows via Superfluid, not direct additions).
      const paidMessages = merged.filter(m => m.strategy === 'streaming' || m.totalFundsAdded > 0n)
      paidMessages.sort((a, b) => (b.totalFundsAdded > a.totalFundsAdded ? 1 : -1))
      setMyMessages(paidMessages)
    } catch { /* non-critical */ }
    finally { setIsLoadingMessages(false) }
  }, [])

  const fetchFundedMessages = useCallback(async (addr: string) => {
    setIsLoadingFunded(true)
    try {
      const res = await fetch(`/api/account/funded?owner=${addr.toLowerCase()}`)
      if (!res.ok) return
      const data = await res.json()
      setFundedMessages((data.funded ?? []).map((m: any) => ({
        ...m,
        strategy: m.strategy ?? 'fixed',
        rank: m.rank ?? null,
        flowRateRaw: m.flowRateRaw ?? '0',
      })))
    } catch { /* non-critical */ }
    finally { setIsLoadingFunded(false) }
  }, [])

  useEffect(() => {
    if (activeAddress) {
      fetchAll(activeAddress)
      fetchMyMessages(activeAddress)
      fetchFundedMessages(activeAddress)
    }
  }, [activeAddress, fetchAll, fetchMyMessages, fetchFundedMessages])

  // Derived board lists
  const allBoards = useMemo(() =>
    [...superfluidBoards, ...githubBoards, ...websiteBoards, ...streamingBoards].sort((a, b) => {
      const d = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return d > 0n ? 1 : d < 0n ? -1 : 0
    }), [superfluidBoards, githubBoards, websiteBoards, streamingBoards])

  // Verification is address-based, not platform-based (see BaseLeaderboard comment) -- fetched once
  // for every board regardless of platform, since the per-platform listing routes only reliably know
  // about their own vertical's integration data.
  const [verificationMap, setVerificationMap] = useState<Record<string, { verifiedUrls: string[]; linkedFiles: LinkedFile[] }>>({})
  const allBoardAddrs = useMemo(() => allBoards.map(b => b.address.toLowerCase()), [allBoards])
  const allBoardAddrsFingerprint = fingerprintAddresses(allBoardAddrs)
  useEffect(() => {
    if (allBoardAddrs.length === 0) return
    // POST, not a query string: 200 boards join to ~8.4KB, past what CDNs will carry in a URL.
    fetch('/api/account/verification-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: allBoardAddrs }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setVerificationMap(data) })
      .catch(() => {})
  // allBoardAddrs re-derives to an equal array whenever the fingerprint does (both come from
  // allBoards); keying on the fingerprint instead of the array reference avoids re-fetching on every
  // render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBoardAddrsFingerprint])

  const isVerified = useCallback((lb: AnyLeaderboard): boolean =>
    isVerifiedLeaderboard(lb, verificationMap[lb.address.toLowerCase()]), [verificationMap])

  // Reopen the embed modal after a GitHub OAuth round-trip initiated from here (see
  // buildGithubReturnTo in board-detail/shared.tsx) -- ?embed=1&embedAddress=<leaderboard>.
  // Searches every board type, not just GitHub-platform ones: "Connect GitHub" is reachable from
  // any leaderboard's embed panel (you can link a GitHub repo for a website/superfluid board too).
  useEffect(() => {
    if (embedReopenApplied.current || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('embed')) return
    const addr = params.get('embedAddress')
    if (!addr) { embedReopenApplied.current = true; return }
    const match = allBoards.find(b => b.address.toLowerCase() === addr.toLowerCase())
    if (!match) return // boards still loading
    embedReopenApplied.current = true
    setEmbedTarget(match)
    // Reopening after a GitHub OAuth round-trip means the user was in the GitHub panel when they
    // clicked "Connect GitHub" -- reopen there regardless of the board's own served platform.
    setEmbedInitialPlatform('github')
    const clean = new URL(window.location.href)
    clean.searchParams.delete('embed')
    clean.searchParams.delete('embedAddress')
    window.history.replaceState(null, '', clean.toString())
  }, [allBoards])

  // Every funded, verification-gated board sits in "Add to Your Site" until it has at least one
  // verified integration (website or GitHub) -- see needsVerificationGate for which boards that is.
  const awaitingVerification = useMemo(() =>
    allBoards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n && needsVerificationGate(lb) && !isVerified(lb)),
    [allBoards, isVerified])
  const awaitingVerificationAddrs = useMemo(() => new Set(awaitingVerification.map(lb => lb.address)), [awaitingVerification])

  const activeBoards = useMemo(() =>
    allBoards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n && !awaitingVerificationAddrs.has(lb.address) && !archived.includes(lb.address)), [allBoards, awaitingVerificationAddrs, archived])

  const inactiveBoards = useMemo(() =>
    allBoards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') === 0n && !archived.includes(lb.address)), [allBoards, archived])

  const archivedBoards = useMemo(() =>
    allBoards.filter(lb => archived.includes(lb.address)), [allBoards, archived])

  // draftBoards is exactly the "Pending Setup" tab's contents (awaitingVerification + inactive,
  // both already archived-filtered) -- used here only as its count/visibility source; the tab body
  // itself still renders the two underlying memos directly (see the JSX below) so nothing about
  // their own filtering changes.
  const draftBoards = useMemo(() =>
    [...awaitingVerification.filter(lb => !archived.includes(lb.address)), ...inactiveBoards], [awaitingVerification, inactiveBoards, archived])

  // Evict off a tab the instant its last item disappears (e.g. the last pending board just got
  // activated) -- otherwise the tab bar would either keep showing an empty selected tab or, since
  // Pending Setup/Archive hide themselves at count 0, silently strand the user on a tab with no
  // button pointing at it anymore.
  useEffect(() => {
    if (tab === 'pending' && draftBoards.length === 0) setTab('live')
    if (tab === 'archive' && archivedBoards.length === 0) setTab('live')
  }, [tab, draftBoards.length, archivedBoards.length])

  const totalRaisedWei = useMemo(() => allBoards.reduce((s, lb) => s + BigInt(lb.totalFundsRaw), 0n), [allBoards])
  const totalContribWei = useMemo(() => {
    const bought = myMessages.reduce((s, m) => s + m.totalFundsAdded, 0n)
    const funded = fundedMessages.reduce((s, m) => s + BigInt(m.totalContributed), 0n)
    return bought + funded
  }, [myMessages, fundedMessages])

  // Manage a leaderboard (from active table) — opens the manage modal
  const handleManage = useCallback((lb: AnyLeaderboard) => {
    if (isFixedWebsiteBoard(lb)) setManageTarget(lb)
    else window.open(detailUrl(lb), '_self')
  }, [])

  const handleEditMessage = useCallback((m: MyMessage) => {
    if (m.strategy === 'streaming') setStreamEditTarget(m)
    else setEditMessageTarget(m)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column' }}>
      <Header activePage="account" />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          borderBottom: `1px solid ${BORDER}`,
          background: [
            'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
            'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
            'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
          ].join(', '),
        }}
      >
        <HeroBackground />
        <div className="relative z-10" style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 40px 32px' }}>
          {/* wallet header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: TEXT, letterSpacing: -0.6 }}>My dashboard</h1>
              {mounted && (activeAddress
                ? <p style={{ margin: '2px 0 0', color: MUTED, fontSize: 14, fontFamily: MONO }}>{fmtAddr(activeAddress)}</p>
                : <p style={{ margin: '2px 0 0', color: MUTED, fontSize: 14 }}>Connect your wallet to continue</p>
              )}
            </div>
            {mounted && !hasWallet && (
              <div style={{ marginLeft: 'auto' }}><ConnectButton /></div>
            )}
            {mounted && hasWallet && (
              <button
                onClick={() => setDepositManagerOpen(true)}
                style={{
                  marginLeft: 'auto', flexShrink: 0,
                  background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 10,
                  padding: '11px 18px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  transition: 'border-color 120ms, color 120ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${PINK}66`; (e.currentTarget as HTMLElement).style.color = TEXT }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
              >
                Deposit Manager
              </button>
            )}
          </div>

          {mounted && hasWallet && (
            <Overview raised={totalRaisedWei} active={activeBoards.length} bought={myMessages.length} contributed={totalContribWei} loaded={!isLoading} />
          )}
        </div>
      </section>

      {/* Tabs + content */}
      <div style={{ flex: 1, maxWidth: 1240, width: '100%', margin: '0 auto', padding: '0 40px 80px' }}>
        {mounted && hasWallet ? (
          <>
            <div style={{ position: 'sticky', top: 66, background: BG, zIndex: 10, paddingTop: 24 }}>
              <Tabs tab={tab} setTab={setTab} counts={{ pending: draftBoards.length, live: activeBoards.length, archive: archivedBoards.length, bought: myMessages.length + fundedMessages.length }} />
            </div>

            <div style={{ paddingTop: 28 }}>
              {/* ── Pending Setup ── */}
              {tab === 'pending' && (
                isLoading ? (
                  <div style={{ overflow: 'auto' }}>
                    <div style={{ minWidth: 640, background: BG2 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: ACTIVE_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                          {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                    {/* Ready to Activate — boards with no messages yet (shown first, it's step 1) */}
                    {inactiveBoards.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT2 }}>Ready to Activate</h2>
                          <CountBadge n={inactiveBoards.length} />
                        </div>
                        <ActivationTable
                          markees={inactiveBoards}
                          onActivate={lb => lb.strategy === 'streaming' ? setActivateStreamBoard(lb) : setActivateTarget(lb)}
                          onArchive={addr => setArchived(prev => [...prev, addr])}
                        />
                      </div>
                    )}

                    {/* Ready to Add to Your Site — any funded board (any platform/strategy) without a verified website or GitHub integration yet */}
                    {awaitingVerification.filter(lb => !archived.includes(lb.address)).length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: PINK }}>Ready to Add to Your Site</h2>
                          <CountBadge n={awaitingVerification.filter(lb => !archived.includes(lb.address)).length} />
                        </div>
                        <ReadyToEmbedTable
                          markees={awaitingVerification.filter(lb => !archived.includes(lb.address))}
                          onEmbed={lb => { setEmbedTarget(lb); setEmbedInitialPlatform(lb.platform === 'github' ? 'github' : 'website') }}
                          ethPrice={ethPrice}
                        />
                      </div>
                    )}
                  </div>
                )
              )}

              {/* ── My Live Markees ── */}
              {tab === 'live' && (
                isLoading ? (
                  <div style={{ overflow: 'auto' }}>
                    <div style={{ minWidth: 640, background: BG2 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: ACTIVE_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                          {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : activeBoards.length === 0 ? (
                  <Empty icon="🪧" title="No live Markees yet" body="Once a Markee is funded and integrated, it shows up here fully live." ctaLabel="Create a Markee →" ctaHref="/raise-funding" />
                ) : (
                  <ActiveTable markees={activeBoards} onManage={handleManage} ethPrice={ethPrice} />
                )
              )}

              {/* ── Archive ── */}
              {tab === 'archive' && (
                isLoading ? (
                  <div style={{ overflow: 'auto' }}>
                    <div style={{ minWidth: 600, background: BG2 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: ACT_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                          {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ArchivedTable
                    markees={archivedBoards}
                    onUnarchive={addr => setArchived(prev => prev.filter(a => a !== addr))}
                  />
                )
              )}

              {/* ── Messages I've Bought (Bought + Funded, stacked) ── */}
              {tab === 'bought' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                  {isLoadingMessages ? (
                    <div style={{ overflow: 'auto' }}>
                      <div style={{ minWidth: 800, background: BG2 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                            {[1, 2, 3, 4, 5, 6].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : myMessages.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>Bought</h2>
                        <CountBadge n={myMessages.length} />
                      </div>
                      <BoughtTable items={myMessages} ethPrice={ethPrice} onEdit={handleEditMessage} onAddFunds={m => setAddFundsTarget({ strategy: m.strategy ?? 'fixed', strategyId: m.strategyId, markeeAddress: m.address, message: m.message, totalFundsAdded: m.totalFundsAdded, topFunds: m.topFunds, name: m.name, isLegacy: m.isLegacy })} onAddToSite={m => { setEmbedTarget({ address: m.strategyId, name: m.strategyName } as AnyLeaderboard); setEmbedInitialPlatform(m.platform === 'github' ? 'github' : 'website') }} />
                    </div>
                  ) : null}

                  {isLoadingFunded ? (
                    <div style={{ overflow: 'auto' }}>
                      <div style={{ minWidth: 800, background: BG2 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: FUNDED_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                            {[1, 2, 3, 4, 5, 6].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : fundedMessages.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>Funded</h2>
                        <CountBadge n={fundedMessages.length} />
                      </div>
                      <FundedTable items={fundedMessages} ethPrice={ethPrice} onAddFunds={m => setAddFundsTarget({ strategy: m.strategy ?? 'fixed', strategyId: m.strategyId, markeeAddress: m.address, message: m.message, totalFundsAdded: BigInt(m.totalContributed), topFunds: BigInt(m.topFundsRaw), name: m.name })} onAddToSite={m => { setEmbedTarget({ address: m.strategyId, name: m.strategyName } as AnyLeaderboard); setEmbedInitialPlatform(m.platform === 'github' ? 'github' : 'website') }} />
                    </div>
                  ) : null}

                  {!isLoadingMessages && !isLoadingFunded && myMessages.length === 0 && fundedMessages.length === 0 && (
                    <Empty icon="💬" title="No messages bought yet" body="Buy a message on any Markee in the network to get your words in front of an audience." ctaLabel="Browse the Marketplace →" ctaHref="/marketplace" />
                  )}
                </div>
              )}
            </div>
          </>
        ) : mounted && !hasWallet ? (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <div style={{ background: BG2, borderRadius: 20, padding: '60px 24px', border: `1px solid ${BORDER}`, maxWidth: 440, margin: '0 auto' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', display: 'block' }}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <p style={{ color: TEXT, fontWeight: 600, fontSize: 17, margin: '0 0 8px' }}>Connect your wallet</p>
              <p style={{ color: MUTED, fontSize: 14, margin: '0 0 24px' }}>See all the Markees you've created across every platform.</p>
              <ConnectButton />
            </div>
          </div>
        ) : (
          // Loading skeleton before hydration
          <div style={{ paddingTop: 28, overflow: 'auto' }}>
            <div style={{ minWidth: 640, background: BG2 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: ACTIVE_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                  {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />

      {/* Manage modal (website + github boards) */}
      {manageTarget && (
        <ManageModal
          lb={manageTarget}
          onClose={() => setManageTarget(null)}
          onEdit={manageTarget.platform === 'website' ? () => setEditingBoard(manageTarget as WebsiteLeaderboard) : undefined}
          onEmbed={manageTarget.platform === 'website' || manageTarget.platform === 'github' ? () => { setEmbedTarget(manageTarget); setEmbedInitialPlatform(manageTarget.platform === 'github' ? 'github' : 'website') } : undefined}
        />
      )}

      {editingBoard && (
        <EditWebsiteMetaModal
          isOpen={!!editingBoard}
          onClose={() => setEditingBoard(null)}
          leaderboardAddress={editingBoard.address}
          initialSiteUrl={editingBoard.siteUrl}
          initialLogoUrl={editingBoard.logoUrl}
          onSuccess={() => { setEditingBoard(null); if (activeAddress) fetchAll(activeAddress) }}
        />
      )}

      <EmbedModal
        isOpen={!!embedTarget}
        onClose={() => { setEmbedTarget(null); if (activeAddress) fetchAll(activeAddress) }}
        leaderboard={embedTarget ? { address: embedTarget.address, name: embedTarget.name, strategy: embedTarget.strategy ?? 'fixed' } : null}
        initialPlatform={embedInitialPlatform}
      />

      {/* Fixed-price activation modal */}
      <BuyMessageModal
        isOpen={!!activateTarget}
        onClose={() => setActivateTarget(null)}
        strategyAddress={activateTarget?.address as `0x${string}` | undefined}
        title="ACTIVATE MARKEE"
        messageLabel="SET FIRST MESSAGE"
        messagePlaceholder="Your message here..."
        ctaLabel="Activate Markee"
        onSuccess={() => {
          const addr = activateTarget?.address
          setActivateTarget(null)
          if (addr) window.location.href = `/markee/${addr}`
        }}
      />

      {/* Streaming activation: single modal handles create + approve + stream */}
      {activateStreamBoard && (
        <StreamActivateModal
          isOpen={!!activateStreamBoard}
          board={activateStreamBoard.address as `0x${string}`}
          onClose={() => setActivateStreamBoard(null)}
          onSuccess={() => {
            const addr = activateStreamBoard?.address
            setActivateStreamBoard(null)
            if (addr) window.location.href = `/markee/${addr}`
          }}
          messageLabel="SET FIRST MESSAGE"
          messagePlaceholder="Your message here..."
        />
      )}

      {/* Edit message — fixed board */}
      {editMessageTarget && (
        <EditMessageModal
          isOpen={!!editMessageTarget}
          onClose={() => setEditMessageTarget(null)}
          strategyAddress={editMessageTarget.strategyId as `0x${string}`}
          markeeAddress={editMessageTarget.address as `0x${string}`}
          currentMessage={editMessageTarget.message}
          onSuccess={() => { setEditMessageTarget(null); if (activeAddress) fetchMyMessages(activeAddress) }}
        />
      )}

      {/* Add funds — fixed board, legacy TopDawg (subgraph-sourced, not RPC-leaderboard-shaped) */}
      {addFundsTarget?.strategy === 'fixed' && addFundsTarget.isLegacy && (
        <BuyMessageModal
          isOpen
          onClose={() => setAddFundsTarget(null)}
          strategyAddress={addFundsTarget.strategyId as `0x${string}`}
          userMarkee={{ address: addFundsTarget.markeeAddress, owner: activeAddress ?? '', message: addFundsTarget.message, totalFundsAdded: addFundsTarget.totalFundsAdded }}
          initialMode="addFunds"
          topFundsAdded={addFundsTarget.topFunds}
          onSuccess={() => { setAddFundsTarget(null); if (activeAddress) { fetchMyMessages(activeAddress); fetchFundedMessages(activeAddress) } }}
        />
      )}

      {/* Add funds — fixed board, v1.x LeaderboardFactory */}
      {addFundsTarget?.strategy === 'fixed' && !addFundsTarget.isLegacy && (
        <MarkeeSignModal
          isOpen
          onClose={() => setAddFundsTarget(null)}
          leaderboardAddress={addFundsTarget.strategyId}
          initialView="addFunds"
          initialTargetAddress={addFundsTarget.markeeAddress}
          onSuccess={() => { setAddFundsTarget(null); if (activeAddress) { fetchMyMessages(activeAddress); fetchFundedMessages(activeAddress) } }}
        />
      )}

      {/* Add funds — streaming board */}
      {addFundsTarget?.strategy === 'streaming' && (
        <StreamSignModal
          isOpen
          board={addFundsTarget.strategyId}
          initialView="fund"
          initialTargetAddress={addFundsTarget.markeeAddress}
          onClose={() => setAddFundsTarget(null)}
          onSuccess={() => { setAddFundsTarget(null); if (activeAddress) fetchMyMessages(activeAddress) }}
        />
      )}

      {/* Manage rate — streaming board */}
      {streamEditTarget && (
        <StreamSignModal
          isOpen={!!streamEditTarget}
          board={streamEditTarget.strategyId}
          initialView="manage"
          initialTargetAddress={streamEditTarget.address}
          onClose={() => setStreamEditTarget(null)}
          onSuccess={() => { setStreamEditTarget(null); if (activeAddress) fetchMyMessages(activeAddress) }}
        />
      )}

      <DepositManagerModal isOpen={depositManagerOpen} onClose={() => setDepositManagerOpen(false)} />
    </div>
  )
}
