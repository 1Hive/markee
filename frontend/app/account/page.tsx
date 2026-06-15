'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { Globe2, Github, Zap, ExternalLink, Code2, CheckCircle2, Pencil, X } from 'lucide-react'
import { EditWebsiteMetaModal } from '@/components/modals/EditWebsiteMetaModal'
import { IntegrationHealthStatus } from '@/components/IntegrationHealthStatus'
import { IntegrationModal } from '@/components/modals/IntegrationModal'
import { VerifyIntegrationModal } from '@/components/modals/VerifyIntegrationModal'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const SANS   = 'Manrope, system-ui, sans-serif'
const PINK   = '#F897FE'
const BLUE   = '#7C9CFF'
const PURP   = '#7B6AF4'
const GREEN  = '#1DB227'
const GOLD   = '#FFD45E'
const BG     = '#060A2A'
const BG2    = '#0A0F3D'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'
const MUTED  = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

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
  minimumPriceRaw?: string
}
interface SuperfluidLeaderboard extends BaseLeaderboard { platform: 'superfluid' }
interface GithubLeaderboard extends BaseLeaderboard {
  platform: 'github'
  repoFullName: string | null
  repoAvatarUrl: string | null
  repoHtmlUrl: string | null
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

function Overview({ raised, active, bought, contributed, loaded }: { raised: bigint; active: number; bought: number; contributed: bigint; loaded: boolean }) {
  const cells = [
    { n: fmtEth(raised),              label: 'total raised',      color: PINK  },
    { n: String(active),              label: 'active signs',      color: GREEN },
    { n: String(bought),              label: 'messages bought',   color: TEXT  },
    { n: fmtEth(contributed),         label: 'contributed',       color: BLUE  },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      {loaded ? cells.map((c, i) => (
        <div key={i} style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <GlowDot size={8} color={c.color} />
            <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: c.color, letterSpacing: -0.5, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{c.n}</span>
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
type TabId = 'markees' | 'bought' | 'funded'
function Tabs({ tab, setTab, counts }: { tab: TabId; setTab: (t: TabId) => void; counts: { markees: number; bought: number; funded: number } }) {
  const items: { key: TabId; label: string; n: number }[] = [
    { key: 'markees', label: 'My Markees',           n: counts.markees },
    { key: 'bought',  label: "Messages I've Bought", n: counts.bought  },
    { key: 'funded',  label: "Messages I've Funded", n: counts.funded  },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}`, overflowX: 'auto' }}>
      {items.map(it => {
        const on = tab === it.key
        return (
          <button key={it.key} onClick={() => setTab(it.key)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 18px', color: on ? TEXT : MUTED, fontWeight: on ? 700 : 500, fontSize: 15, fontFamily: SANS, whiteSpace: 'nowrap', borderBottom: `2px solid ${on ? PINK : 'transparent'}`, marginBottom: -1, display: 'flex', alignItems: 'center', gap: 8 }}>
            {it.label}
            <span style={{ fontFamily: MONO, fontSize: 12, color: on ? PINK : MUTED, background: on ? `${PINK}1E` : `${MUTED}1E`, borderRadius: 99, padding: '1px 8px' }}>{it.n}</span>
          </button>
        )
      })}
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
            <div style={{ color: TEXT, fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lb.name}</div>
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
            <a href={`/markee/${lb.address}`} style={{ flex: 1, display: 'block', textAlign: 'center', background: BLUE, color: BG, border: 'none', borderRadius: 8, padding: 11, fontWeight: 700, fontSize: 14, textDecoration: 'none', fontFamily: SANS }}>Buy First Message</a>
          )}
          {onArchive && (
            <button onClick={onArchive} title="Archive" style={{ flexShrink: 0, background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '11px 14px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: SANS }}>Archive</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/markee/${lb.address}`} style={{ flex: 1, textAlign: 'center', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 13, textDecoration: 'none', fontFamily: SANS }}>View</a>
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

// ── Setup-required table (Awaiting Integration / Awaiting Activation) ────────
const SETUP_COLS = '180px 165px 1fr 220px'

function SetupStatusPill({ lb }: { lb: AnyLeaderboard }) {
  const hasFunds = BigInt(lb.topFundsAddedRaw ?? '0') > 0n
  const missingVerify = lb.platform === 'website' && ((lb as WebsiteLeaderboard).verifiedUrls?.length ?? 0) === 0
  const needsIntegration = hasFunds && missingVerify
  const col = needsIntegration ? BLUE : MUTED
  const label = needsIntegration ? 'Integration Needed' : 'No Messages Yet'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, background: `${col}1E`, border: `1px solid ${col}44`, color: col, whiteSpace: 'nowrap' }}>
      <GlowDot size={5} color={col} />{label}
    </span>
  )
}

function SetupTable({ markees, onIntegrate, onVerify, onArchive }: {
  markees: AnyLeaderboard[]
  onIntegrate?: (lb: WebsiteLeaderboard) => void
  onVerify?: (lb: WebsiteLeaderboard) => void
  onArchive: (address: string) => void
}) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 640, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: SETUP_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {['Served on', 'Status', 'Current message', ''].map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i === 3 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
        </div>
        {markees.map(lb => {
          const hasFunds = BigInt(lb.topFundsAddedRaw ?? '0') > 0n
          const missingVerify = lb.platform === 'website' && ((lb as WebsiteLeaderboard).verifiedUrls?.length ?? 0) === 0

          // Awaiting Integration: has funds but no verified URL → Verify Integration
          // Awaiting Activation: no funds → Buy First Message (all platforms, same blue style)
          const primary: React.ReactNode = (hasFunds && missingVerify) ? (
            <button
              onClick={e => { e.stopPropagation(); onVerify?.(lb as WebsiteLeaderboard) }}
              style={{ background: BLUE, color: BG, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}
            >
              Verify Integration
            </button>
          ) : (
            <a
              href={`/markee/${lb.address}`}
              onClick={e => e.stopPropagation()}
              style={{ background: BLUE, color: BG, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: SANS, whiteSpace: 'nowrap' }}
            >
              Buy First Message
            </a>
          )

          return (
            <div
              key={lb.address}
              onClick={() => window.location.href = `/markee/${lb.address}`}
              style={{ display: 'grid', gridTemplateColumns: SETUP_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <ActiveServedLabel lb={lb} />
              <SetupStatusPill lb={lb} />
              <span style={{ fontFamily: MONO, fontSize: 13, color: lb.topMessage ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: lb.topMessage ? 'normal' : 'italic' }}>
                {lb.topMessage || 'No message yet'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                {primary}
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
          )
        })}
      </div>
    </div>
  )
}

// ── Active Markees table ──────────────────────────────────────────────────────
const ACT_COLS = '200px 110px 1fr 116px'

function ActiveServedLabel({ lb }: { lb: AnyLeaderboard }) {
  const primary = platformSubtitle(lb)
  const extras = lb.platform === 'website' ? Math.max(0, ((lb as WebsiteLeaderboard).verifiedUrls?.length ?? 0) - 1) : 0
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <span style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, border: `1px solid ${BORDER}` }}>
        <PlatIcon lb={lb} size={13} />
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12.5, color: TEXT2 }}>
        {primary}
        {extras > 0 && <span style={{ color: MUTED }}> +{extras}</span>}
      </span>
    </span>
  )
}

function ActiveTable({ markees, onManage }: { markees: AnyLeaderboard[]; onManage: (lb: AnyLeaderboard) => void }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 600, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: ACT_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {['Served on', 'Total raised', 'Current message', ''].map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i === 3 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
        </div>
        {markees.map(lb => (
          <div
            key={lb.address}
            onClick={() => window.location.href = `/markee/${lb.address}`}
            style={{ display: 'grid', gridTemplateColumns: ACT_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <ActiveServedLabel lb={lb} />
            <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontWeight: 600 }}>{lb.totalFunds}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: lb.topMessage ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: lb.topMessage ? 'normal' : 'italic' }}>{lb.topMessage || 'No message yet'}</span>
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
        ))}
      </div>
    </div>
  )
}

// ── Messages I've Bought table ────────────────────────────────────────────────
const MSG_COLS = '180px 1fr 110px 80px'

function BoughtTable({ items }: { items: MyMessage[] }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 560, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {['Leaderboard', 'Your message', 'Spent', 'Status'].map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i > 1 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
        </div>
        {items.map(m => (
          <div
            key={m.address}
            onClick={() => window.location.href = `/markee/${m.strategyId || m.address}`}
            style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.strategyName}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: m.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: m.message ? 'normal' : 'italic' }}>{m.message || 'No message'}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: BLUE, fontWeight: 600, textAlign: 'right' }}>{fmtEth(m.totalFundsAdded)}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {m.isTop
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: GOLD, background: `${GOLD}1E`, padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>★ Top</span>
                : <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, background: `${MUTED}1E`, padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>Overtaken</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Messages I've Funded table ────────────────────────────────────────────────
const FUNDED_COLS = '180px 1fr 120px 80px'

function FundedTable({ items }: { items: FundedMessage[] }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 560, background: BG2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: FUNDED_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
          {['Leaderboard', 'Current message', 'Contributed', 'Status'].map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: i > 1 ? 'right' as const : 'left' as const }}>{h}</span>
          ))}
        </div>
        {items.map(m => (
          <div
            key={m.address}
            onClick={() => window.location.href = `/markee/${m.strategyId || m.address}`}
            style={{ display: 'grid', gridTemplateColumns: FUNDED_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,156,255,0.04)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.strategyName}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: m.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: m.message ? 'normal' : 'italic' }}>{m.message || 'No message yet'}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: BLUE, fontWeight: 600, textAlign: 'right' }}>{fmtEth(BigInt(m.totalContributed))}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {m.isTop
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: GOLD, background: `${GOLD}1E`, padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>★ Top</span>
                : <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, background: `${MUTED}1E`, padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>Not Top</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Manage integrations modal ─────────────────────────────────────────────────
function ManageModal({ lb, onClose, onIntegrate, onVerify, onEdit }: { lb: AnyLeaderboard; onClose: () => void; onIntegrate?: () => void; onVerify?: () => void; onEdit?: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,10,42,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', margin: 'auto', background: BG2, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: -0.4 }}>{lb.name}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a href={detailUrl(lb)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textDecoration: 'none', color: TEXT, fontSize: 14, fontWeight: 600 }}>
            <ExternalLink size={15} style={{ color: BLUE }} /> View leaderboard
          </a>
          {onEdit && (
            <button onClick={() => { onClose(); onEdit() }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', color: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>
              <Pencil size={15} style={{ color: MUTED }} /> Edit website info
            </button>
          )}
          {onIntegrate && (
            <button onClick={() => { onClose(); onIntegrate() }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', color: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>
              <Code2 size={15} style={{ color: MUTED }} /> Integration guide
            </button>
          )}
          {onVerify && (
            <button onClick={() => { onClose(); onVerify() }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', color: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }}>
              <CheckCircle2 size={15} style={{ color: GREEN }} /> Verify integration
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
      <a href={ctaHref} style={{ display: 'inline-block', background: PINK, color: BG, fontWeight: 700, padding: '12px 22px', borderRadius: 10, textDecoration: 'none', fontFamily: MONO, fontSize: 14 }}>{ctaLabel}</a>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { address: walletAddress, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Platform leaderboards
  const [superfluidBoards, setSuperfluidBoards] = useState<SuperfluidLeaderboard[]>([])
  const [githubBoards, setGithubBoards]         = useState<GithubLeaderboard[]>([])
  const [websiteBoards, setWebsiteBoards]       = useState<WebsiteLeaderboard[]>([])
  const [isLoading, setIsLoading]               = useState(false)

  // Messages
  const [myMessages, setMyMessages]             = useState<MyMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [fundedMessages, setFundedMessages]     = useState<FundedMessage[]>([])
  const [isLoadingFunded, setIsLoadingFunded]   = useState(false)

  // UI state
  const [tab, setTab]                         = useState<TabId>('markees')
  const [archived, setArchived]               = useState<string[]>([])
  const [manageTarget, setManageTarget]       = useState<AnyLeaderboard | null>(null)
  const [editingBoard, setEditingBoard]       = useState<WebsiteLeaderboard | null>(null)
  const [integrationBoard, setIntegrationBoard] = useState<WebsiteLeaderboard | null>(null)
  const [verifyBoard, setVerifyBoard]         = useState<WebsiteLeaderboard | null>(null)

  const fetchAll = useCallback(async (addr: string) => {
    setIsLoading(true)
    try {
      const [sfRes, ghRes, oiRes] = await Promise.all([
        fetch('/api/superfluid/leaderboards?bust=1',   { cache: 'no-store' }),
        fetch('/api/github/leaderboards?bust=1',       { cache: 'no-store' }),
        fetch('/api/openinternet/leaderboards?bust=1', { cache: 'no-store' }),
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
            .filter((lb: BaseLeaderboard) => lb.admin.toLowerCase() === addr.toLowerCase())
            .map((lb: BaseLeaderboard) => ({ ...lb, platform: 'github' as const }))
        )
      }
      if (oiRes.ok) {
        const data = await oiRes.json()
        setWebsiteBoards(
          (data.leaderboards ?? [])
            .filter((lb: any) => {
              if (lb.isLegacy) return false
              const c = lb.creator ?? lb.admin
              return c && c.toLowerCase() === addr.toLowerCase()
            })
            .map((lb: any) => ({ ...lb, platform: 'website' as const }))
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
                return { address: m.address, message: m.message ?? '', name: m.name ?? '', totalFundsAdded: BigInt(m.totalFundsAdded ?? '0'), createdAt: Number(m.createdAt ?? 0), strategyId: strat?.id ?? '', strategyName: strat?.instanceName ?? 'Unknown Leaderboard', isTop, topFunds }
              })
            })
            .catch(() => [])
        : Promise.resolve([] as MyMessage[])

      const [rpcMessages, subgraphMessages] = await Promise.all([rpcPromise, subgraphPromise])

      // Merge, deduplicating by markee address (RPC wins for duplicates)
      const seen = new Set(rpcMessages.map(m => m.address.toLowerCase()))
      const merged = [...rpcMessages, ...subgraphMessages.filter(m => !seen.has(m.address.toLowerCase()))]
      merged.sort((a, b) => (b.totalFundsAdded > a.totalFundsAdded ? 1 : -1))
      setMyMessages(merged)
    } catch { /* non-critical */ }
    finally { setIsLoadingMessages(false) }
  }, [])

  const fetchFundedMessages = useCallback(async (addr: string) => {
    setIsLoadingFunded(true)
    try {
      const res = await fetch(`/api/account/funded?owner=${addr.toLowerCase()}`)
      if (!res.ok) return
      const data = await res.json()
      setFundedMessages(data.funded ?? [])
    } catch { /* non-critical */ }
    finally { setIsLoadingFunded(false) }
  }, [])

  useEffect(() => {
    if (walletAddress) {
      fetchAll(walletAddress)
      fetchMyMessages(walletAddress)
      fetchFundedMessages(walletAddress)
    }
  }, [walletAddress, fetchAll, fetchMyMessages, fetchFundedMessages])

  // Derived board lists
  const allBoards = useMemo(() =>
    [...superfluidBoards, ...githubBoards, ...websiteBoards].sort((a, b) => {
      const d = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
      return d > 0n ? 1 : d < 0n ? -1 : 0
    }), [superfluidBoards, githubBoards, websiteBoards])

  const awaitingVerification = useMemo(() =>
    allBoards.filter(lb => lb.platform === 'website' && BigInt(lb.topFundsAddedRaw ?? '0') > 0n && ((lb as WebsiteLeaderboard).verifiedUrls?.length ?? 0) === 0) as WebsiteLeaderboard[], [allBoards])
  const awaitingVerificationAddrs = useMemo(() => new Set(awaitingVerification.map(lb => lb.address)), [awaitingVerification])

  const activeBoards = useMemo(() =>
    allBoards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') > 0n && !awaitingVerificationAddrs.has(lb.address) && !archived.includes(lb.address)), [allBoards, awaitingVerificationAddrs, archived])

  const inactiveBoards = useMemo(() =>
    allBoards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') === 0n && !archived.includes(lb.address)), [allBoards, archived])

  const archivedBoards = useMemo(() =>
    allBoards.filter(lb => archived.includes(lb.address)), [allBoards, archived])

  const draftBoards = useMemo(() =>
    [...awaitingVerification.filter(lb => !archived.includes(lb.address)), ...inactiveBoards], [awaitingVerification, inactiveBoards, archived])

  const totalRaisedWei = useMemo(() => allBoards.reduce((s, lb) => s + BigInt(lb.totalFundsRaw), 0n), [allBoards])
  const totalContribWei = useMemo(() => myMessages.reduce((s, m) => s + m.totalFundsAdded, 0n), [myMessages])

  // Manage a leaderboard (from active table) — opens the manage modal
  const handleManage = useCallback((lb: AnyLeaderboard) => {
    if (lb.platform === 'website') setManageTarget(lb)
    else window.open(detailUrl(lb), '_self')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column' }}>
      <Header activePage="account" useRegularLinks />

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
              {mounted && walletAddress
                ? <p style={{ margin: '2px 0 0', color: MUTED, fontSize: 14, fontFamily: MONO }}>{fmtAddr(walletAddress)}</p>
                : <p style={{ margin: '2px 0 0', color: MUTED, fontSize: 14 }}>Connect your wallet to continue</p>
              }
            </div>
            {mounted && !isConnected && (
              <div style={{ marginLeft: 'auto' }}><ConnectButton /></div>
            )}
          </div>

          {mounted && isConnected && (
            <Overview raised={totalRaisedWei} active={activeBoards.length} bought={myMessages.length} contributed={totalContribWei} loaded={!isLoading} />
          )}
        </div>
      </section>

      {/* Tabs + content */}
      <div style={{ flex: 1, maxWidth: 1240, width: '100%', margin: '0 auto', padding: '0 40px 80px' }}>
        {mounted && isConnected ? (
          <>
            <div style={{ position: 'sticky', top: 66, background: BG, zIndex: 10, paddingTop: 24 }}>
              <Tabs tab={tab} setTab={setTab} counts={{ markees: allBoards.length, bought: myMessages.length, funded: fundedMessages.length }} />
            </div>

            <div style={{ paddingTop: 28 }}>
              {/* ── My Markees ── */}
              {tab === 'markees' && (
                allBoards.length === 0 && !isLoading ? (
                  <Empty icon="🪧" title="No Markees yet" body="Create your first sign on a platform and start raising funds wherever your audience is." ctaLabel="Create a Markee →" ctaHref="/raise-funding" />
                ) : isLoading ? (
                  <div style={{ overflow: 'auto' }}>
                    <div style={{ minWidth: 640, background: BG2 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: SETUP_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                          {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                    {/* Awaiting Integration — website boards with funds but no verified URL */}
                    {awaitingVerification.filter(lb => !archived.includes(lb.address)).length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: BLUE }}>Awaiting Integration</h2>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{awaitingVerification.filter(lb => !archived.includes(lb.address)).length}</span>
                        </div>
                        <SetupTable
                          markees={awaitingVerification.filter(lb => !archived.includes(lb.address))}
                          onVerify={lb => setVerifyBoard(lb)}
                          onArchive={addr => setArchived(prev => [...prev, addr])}
                        />
                      </div>
                    )}

                    {/* Awaiting Activation — boards with no messages yet */}
                    {inactiveBoards.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: BLUE }}>Awaiting Activation</h2>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{inactiveBoards.length}</span>
                        </div>
                        <SetupTable
                          markees={inactiveBoards}
                          onIntegrate={lb => setIntegrationBoard(lb)}
                          onArchive={addr => setArchived(prev => [...prev, addr])}
                        />
                      </div>
                    )}

                    {/* Active Markees */}
                    {activeBoards.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>Active Markees</h2>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{activeBoards.length}</span>
                        </div>
                        <ActiveTable markees={activeBoards} onManage={handleManage} />
                      </div>
                    )}

                    {/* No active markees prompt */}
                    {activeBoards.length === 0 && (awaitingVerification.length > 0 || inactiveBoards.length > 0) && (
                      <p style={{ color: MUTED, fontSize: 14 }}>No active signs yet — complete setup above to go live.</p>
                    )}

                    {/* Archived */}
                    {archivedBoards.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: MUTED }}>Archived</h2>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{archivedBoards.length}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
                          {archivedBoards.map(lb => (
                            <MarkeeCardDash key={lb.address} lb={lb} archived onUnarchive={() => setArchived(prev => prev.filter(a => a !== lb.address))} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* ── Messages I've Bought ── */}
              {tab === 'bought' && (
                isLoadingMessages ? (
                  <div style={{ overflow: 'auto' }}>
                    <div style={{ minWidth: 500, background: BG2 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                          {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : myMessages.length === 0 ? (
                  <Empty icon="💬" title="No messages bought yet" body="Buy a message on any Markee in the network to get your words in front of an audience." ctaLabel="Browse the Marketplace →" ctaHref="/marketplace" />
                ) : (
                  <BoughtTable items={myMessages} />
                )
              )}

              {/* ── Messages I've Funded ── */}
              {tab === 'funded' && (
                isLoadingFunded ? (
                  <div style={{ overflow: 'auto' }}>
                    <div style={{ minWidth: 500, background: BG2 }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: FUNDED_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                          {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : fundedMessages.length === 0 ? (
                  <Empty icon="🤝" title="No funded messages yet" body="When you add funds to someone else's Markee, those contributions appear here." ctaLabel="Browse the Marketplace →" ctaHref="/marketplace" />
                ) : (
                  <FundedTable items={fundedMessages} />
                )
              )}
            </div>
          </>
        ) : mounted && !isConnected ? (
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
                <div key={i} style={{ display: 'grid', gridTemplateColumns: SETUP_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                  {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />

      {/* Manage modal (website boards) */}
      {manageTarget && (
        <ManageModal
          lb={manageTarget}
          onClose={() => setManageTarget(null)}
          onEdit={manageTarget.platform === 'website' ? () => setEditingBoard(manageTarget as WebsiteLeaderboard) : undefined}
          onIntegrate={manageTarget.platform === 'website' ? () => setIntegrationBoard(manageTarget as WebsiteLeaderboard) : undefined}
          onVerify={manageTarget.platform === 'website' ? () => setVerifyBoard(manageTarget as WebsiteLeaderboard) : undefined}
        />
      )}

      {editingBoard && (
        <EditWebsiteMetaModal
          isOpen={!!editingBoard}
          onClose={() => setEditingBoard(null)}
          leaderboardAddress={editingBoard.address}
          initialSiteUrl={editingBoard.siteUrl}
          initialLogoUrl={editingBoard.logoUrl}
          onSuccess={() => { setEditingBoard(null); if (walletAddress) fetchAll(walletAddress) }}
        />
      )}

      {integrationBoard && (
        <IntegrationModal
          isOpen={!!integrationBoard}
          onClose={() => setIntegrationBoard(null)}
          leaderboard={{ address: integrationBoard.address, name: integrationBoard.name, verifiedUrls: integrationBoard.verifiedUrls, status: integrationBoard.status }}
          onOpenVerify={() => { setIntegrationBoard(null); setVerifyBoard(integrationBoard) }}
        />
      )}

      {verifyBoard && (
        <VerifyIntegrationModal
          isOpen={!!verifyBoard}
          onClose={() => setVerifyBoard(null)}
          leaderboard={{ address: verifyBoard.address, name: verifyBoard.name, verifiedUrls: verifyBoard.verifiedUrls }}
          onVerified={() => { if (walletAddress) fetchAll(walletAddress) }}
          onOpenIntegration={() => { setVerifyBoard(null); setIntegrationBoard(verifyBoard) }}
        />
      )}
    </div>
  )
}
