'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { Globe2, Github, Zap, Pencil, ChevronDown, Info, Archive, Eye, ArrowUpRight } from 'lucide-react'
import { useSignMessage } from 'wagmi'
import { MODERATION_API } from '@/lib/moderation/config'
import { notifyEmailMessage, notifyFreqMessage, type EmailFrequency } from '@/lib/moderation/queue'
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
import { AdminSettingRow } from '@/components/leaderboard/AdminSettingRow'
import { useLiveBalance } from '@/hooks/useLiveBalance'
import { needsVerificationGate, isVerifiedLeaderboard } from '@/lib/leaderboards/verification'
import { type StreamStatus, streamStatusOf, StreamStatusIcon } from '@/components/board-detail/shared'
import { MONO, PINK, BLUE, GREEN, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import { logoDevUrl, formatUsd } from '@/lib/utils'
import { LeaderboardV11ABI, StreamingLeaderboardABI, TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { ModeratedContent, FlagButton, ModerationQueue, ModerationToast, BoardModerators, useModeration } from '@/components/moderation'
import { useModerationQueue } from '@/hooks/useModerationQueue'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import type { Abi } from 'viem'

// ── Design tokens ─────────────────────────────────────────────────────────────
const SANS   = 'Manrope, system-ui, sans-serif'
const PURP   = '#7B6AF4'
const GOLD   = '#FFD45E'
const SILVER = '#C7CCD6'
const BRONZE = '#CD7F32'
const AMBER  = '#FFB547'

// ── Types ─────────────────────────────────────────────────────────────────────
interface BaseLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  // Address-resolved creator (lib/leaderboards/resolveCreators.ts) -- distinct from admin, which for
  // some platforms (Superfluid) is the beneficiary, and for migrated boards is the Cooperative
  // multisig, not whoever actually created the board. Populated for superfluid/github/openinternet/
  // forsale; streaming boards have no separate creator resolution, so callers fall back to admin
  // (matches the existing lb.creator ?? lb.admin convention already used elsewhere on this page).
  creator?: string | null
  topMessage: string | null
  topMessageOwner?: string | null
  // Address of the top markee slot itself (distinct from `address`, the leaderboard/board contract) --
  // already returned by every platform's leaderboards API, just not previously typed here. Needed as
  // the markeeId for moderation (ModeratedContent/FlagButton key flagged state per-markee, not per-board).
  topMarkeeAddress?: string | null
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

function OverviewStatCard({ n, label, color, loaded }: { n: string; label: string; color: string; loaded: boolean }) {
  if (!loaded) return (
    <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: 'rgba(138,143,191,0.15)', flexShrink: 0 }} />
        <div style={{ width: 80, height: 20, background: 'rgba(138,143,191,0.08)', borderRadius: 6 }} />
      </div>
      <div style={{ width: 90, height: 12, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
    </div>
  )
  return (
    <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <GlowDot size={8} color={color} />
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color, letterSpacing: -0.5, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{n}</span>
      </div>
      <div style={{ color: TEXT2, fontSize: 12, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function Overview({ raised, active, buyerViews, buyerCpm, ethPrice, loaded }: {
  raised: bigint; active: number; buyerViews: number
  ethPrice: number | null; buyerCpm: number | null; loaded: boolean
}) {
  const raisedUsd = ethPrice ? Number(raised) / 1e18 * ethPrice : null
  const fmtViews  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
  const sectionLabel: React.CSSProperties = { fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED, marginBottom: 10 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <div style={sectionLabel}>Creator</div>
        <div style={grid2}>
          <OverviewStatCard n={String(active)} label="Active Signs" color={GREEN} loaded={loaded} />
          <OverviewStatCard n={raisedUsd != null ? formatUsd(raisedUsd) : fmtEth(raised)} label="Total Raised" color={PINK} loaded={loaded} />
        </div>
      </div>
      <div>
        <div style={sectionLabel}>Buyer</div>
        <div style={grid2}>
          <OverviewStatCard n={fmtViews(buyerViews)} label="Total Views" color={BLUE} loaded={loaded} />
          <OverviewStatCard n={buyerCpm != null ? formatUsd(buyerCpm) : '—'} label="Cost per 1k Views" color={TEXT2} loaded={loaded} />
        </div>
      </div>
    </div>
  )
}

// ── Section navigation ────────────────────────────────────────────────────────
type SectionId = 'feed' | 'creator' | 'buyer' | 'settings'

function SidebarNav({ section, setSection, moderationCount }: { section: SectionId; setSection: (s: SectionId) => void; moderationCount: number }) {
  const items: { key: SectionId; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: 'feed', label: 'Activity Feed', badge: moderationCount > 0 ? moderationCount : undefined,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    },
    {
      key: 'creator', label: 'Creator Hub',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    },
    {
      key: 'buyer', label: 'Buyer Hub',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    },
  ]
  const settingsIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>

  const btn = (key: SectionId, label: string, icon: React.ReactNode, badge?: number) => {
    const on = section === key
    return (
      <button
        key={key}
        onClick={() => setSection(key)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '10px 14px', borderRadius: 8, marginBottom: 2,
          border: 'none', borderLeft: `3px solid ${on ? PINK : 'transparent'}`,
          background: on ? 'rgba(248,151,254,0.08)' : 'transparent',
          color: on ? TEXT : TEXT2,
          fontFamily: SANS, fontSize: 14, fontWeight: on ? 700 : 500,
          cursor: 'pointer', textAlign: 'left' as const,
        }}
      >
        <span style={{ color: on ? PINK : MUTED, flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: AMBER, background: `${AMBER}1E`, borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>{badge}</span>
        )}
      </button>
    )
  }

  return (
    <nav style={{ width: 220, flexShrink: 0, paddingTop: 4 }}>
      {items.map(it => btn(it.key, it.label, it.icon, it.badge))}
      <hr style={{ border: 'none', borderTop: `1px solid ${BORDER}`, margin: '8px 4px 8px' }} />
      {btn('settings', 'Settings', settingsIcon)}
    </nav>
  )
}

// ── Settings section ──────────────────────────────────────────────────────────
interface NotifyState { email: string | null; verified: boolean; frequency: string }

function SettingsSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{ width: 40, height: 23, borderRadius: 99, border: `1px solid ${on ? 'rgba(248,151,254,0.6)' : BORDER}`, background: on ? 'rgba(248,151,254,0.22)' : 'rgba(138,143,191,0.12)', position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'background 150ms, border-color 150ms' }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 17, height: 17, borderRadius: 99, background: on ? PINK : MUTED, transition: 'left 150ms' }} />
    </button>
  )
}

function SettingsSection({ address, verifyOk }: { address: string; verifyOk?: boolean }) {
  const { signMessageAsync } = useSignMessage()
  const [notifyState, setNotifyState] = useState<NotifyState | null>(null)
  const [freqDraft, setFreqDraft]     = useState<EmailFrequency>('daily')
  const [modOn, setModOn]             = useState(true)
  const [statusOn, setStatusOn]       = useState(true)
  const [budgetOn, setBudgetOn]       = useState(true)
  const [editEmail, setEditEmail]     = useState(false)
  const [emailInput, setEmailInput]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [justSaved, setJustSaved]     = useState(false)
  const [showVerifyBanner, setShowVerifyBanner] = useState(!!verifyOk)

  useEffect(() => {
    if (verifyOk) { setShowVerifyBanner(true); setTimeout(() => setShowVerifyBanner(false), 6000) }
  }, [verifyOk])

  useEffect(() => {
    if (!address) return
    fetch(`${MODERATION_API}/notify?wallet=${address}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: NotifyState | null) => {
        if (!data) return
        setNotifyState(data)
        setFreqDraft((data.frequency ?? 'daily') as EmailFrequency)
        setEditEmail(!data.email)
      })
      .catch(() => {})
  }, [address])

  const savedEmail   = notifyState?.email ?? null
  const savedFreq    = (notifyState?.frequency ?? 'daily') as EmailFrequency
  const emailChanged = editEmail && emailInput.trim().toLowerCase() !== (savedEmail ?? '')
  const freqChanged  = freqDraft !== savedFreq
  const isDirty      = emailChanged || freqChanged
  const badEmail     = emailInput.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())

  const discard = () => {
    setFreqDraft(savedFreq)
    setEmailInput('')
    setEditEmail(!savedEmail)
    setSaveError(null)
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      if (emailChanged) {
        const newEmail = emailInput.trim().toLowerCase()
        const sig = await signMessageAsync({ message: notifyEmailMessage(CANONICAL_CHAIN_ID, address, newEmail, timestamp) })
        const res = await fetch(`${MODERATION_API}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, email: newEmail, signature: sig, timestamp }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
        setNotifyState(prev => ({ ...prev ?? { frequency: freqDraft }, email: body.email, verified: false }))
        setEmailInput('')
        setEditEmail(false)
      }
      if (freqChanged) {
        const ts2 = Math.floor(Date.now() / 1000)
        const sig2 = await signMessageAsync({ message: notifyFreqMessage(CANONICAL_CHAIN_ID, address, freqDraft, ts2) })
        const res2 = await fetch(`${MODERATION_API}/notify`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, frequency: freqDraft, signature: sig2, timestamp: ts2 }),
        })
        const body2 = await res2.json().catch(() => null)
        if (!res2.ok) throw new Error(body2?.error ?? `HTTP ${res2.status}`)
        setNotifyState(prev => prev ? { ...prev, frequency: freqDraft } : prev)
      }
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (!/reject|denied/i.test(msg)) setSaveError(msg || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const resendVerification = async () => {
    if (!savedEmail) return
    // Re-POST with current email triggers a new verification email
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = await signMessageAsync({ message: notifyEmailMessage(CANONICAL_CHAIN_ID, address, savedEmail, timestamp) })
      await fetch(`${MODERATION_API}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, email: savedEmail, signature: sig, timestamp }),
      })
    } catch {
      // silent — best effort
    }
  }

  const ghostBtn: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontFamily: SANS, color: TEXT2, cursor: 'pointer' }
  const off = freqDraft === 'off'

  return (
    <div style={{ maxWidth: 760 }}>
      {showVerifyBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', background: `${GREEN}14`, border: `1px solid ${GREEN}33`, borderRadius: 10, marginBottom: 16 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span style={{ color: GREEN, fontSize: 13, fontWeight: 600 }}>Email verified! You&apos;ll now receive moderation alerts.</span>
        </div>
      )}

      <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: MUTED }}>Email Notifications</span>
        </div>

        {/* Your Email row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' as const }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Your Email</div>
            {!editEmail && savedEmail && !notifyState?.verified && (
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>Awaiting verification. Check your inbox for the link.</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
            {editEmail ? (
              <>
                <input
                  autoFocus
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setEmailInput(''); setEditEmail(!savedEmail) } }}
                  placeholder="name@example.com"
                  style={{ background: 'rgba(6,10,42,0.6)', border: `1px solid ${badEmail ? '#FF8A9B' : BORDER}`, borderRadius: 7, padding: '7px 10px', color: TEXT, fontFamily: MONO, fontSize: 13, outline: 'none', width: 220 }}
                />
                {savedEmail && (
                  <button onClick={() => { setEmailInput(''); setEditEmail(false) }} style={{ ...ghostBtn, border: 'none' }}>Cancel</button>
                )}
              </>
            ) : (
              <>
                {notifyState?.verified
                  ? <span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 8px ${GREEN}` }} />
                  : savedEmail
                    ? <span style={{ width: 8, height: 8, borderRadius: 99, background: '#FFB547', flexShrink: 0, display: 'inline-block' }} />
                    : null}
                <span style={{ fontFamily: MONO, fontSize: 13, color: savedEmail ? TEXT : MUTED }}>
                  {savedEmail ?? 'No email set'}
                </span>
                {savedEmail && !notifyState?.verified && (
                  <button onClick={resendVerification} style={{ ...ghostBtn, border: 'none', fontSize: 12 }}>Resend</button>
                )}
                <button onClick={() => { setEmailInput(savedEmail ?? ''); setEditEmail(true) }} style={ghostBtn}>Edit</button>
              </>
            )}
          </div>
        </div>

        {/* Event toggles */}
        <div style={{ opacity: off ? 0.45 : 1, pointerEvents: off ? 'none' : 'auto', borderBottom: `1px solid ${BORDER}`, padding: '14px 18px 6px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Choose When You Get Notified</div>
          <div style={{ borderLeft: `1px solid ${BORDER}`, marginLeft: 4, paddingLeft: 14 }}>
            {([
              { k: 'mod',    label: 'Moderation Activity',   sub: 'A new message is posted for you to moderate.', on: modOn,    set: setModOn },
              { k: 'status', label: 'Message Status Change', sub: 'Your message starts or stops winning.',        on: statusOn, set: setStatusOn },
              { k: 'budget', label: 'Low Budget',            sub: 'Your streaming budget falls below 1 day remaining.', on: budgetOn, set: setBudgetOn },
            ] as const).map((ev, i) => (
              <div key={ev.k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT2 }}>{ev.label}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{ev.sub}</div>
                </div>
                <SettingsSwitch on={ev.on} onChange={ev.set} label={ev.label} />
              </div>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' as const, opacity: !savedEmail && !editEmail ? 0.45 : 1, pointerEvents: !savedEmail && !editEmail ? 'none' : 'auto' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Frequency</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
              {freqDraft === 'daily' ? "One email a day, only when there's news." : freqDraft === 'every' ? 'An email for each update.' : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, background: 'rgba(138,143,191,0.08)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3 }}>
            {(['every', 'daily', 'off'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFreqDraft(f)}
                style={{ background: freqDraft === f ? 'rgba(123,106,244,0.55)' : 'transparent', color: freqDraft === f ? TEXT : MUTED, border: freqDraft === f ? `1px solid rgba(123,106,244,0.5)` : '1px solid transparent', borderRadius: 6, padding: '6px 12px', fontFamily: SANS, fontSize: 13, fontWeight: freqDraft === f ? 700 : 500, cursor: 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap' as const }}
              >
                {f === 'every' ? 'Every Time' : f === 'daily' ? 'Daily Round-up' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '12px 18px' }}>
          {badEmail && <span style={{ fontSize: 12.5, color: '#FF8A9B', marginRight: 'auto' }}>Enter a valid email</span>}
          {saveError && !badEmail && <span style={{ color: '#FF6B6B', fontSize: 12.5, marginRight: 'auto' }}>{saveError}</span>}
          {justSaved && !saveError && <span style={{ color: GREEN, fontSize: 12.5, marginRight: 'auto' }}>Saved!</span>}
          {saving ? (
            <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>Confirm in wallet…</span>
          ) : (
            <>
              {isDirty && (
                <button onClick={discard} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 13.5, fontFamily: SANS, cursor: 'pointer' }}>Discard</button>
              )}
              <button
                disabled={!isDirty || !!badEmail}
                onClick={save}
                style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '9px 18px', fontFamily: SANS, fontWeight: 700, fontSize: 13.5, cursor: isDirty && !badEmail ? 'pointer' : 'not-allowed', opacity: isDirty && !badEmail ? 1 : 0.4, transition: 'opacity 150ms' }}
              >
                Save changes
              </button>
            </>
          )}
        </div>
      </div>
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

// ── Your Markees panel ────────────────────────────────────────────────────────
const MK_COLS = 'minmax(0,1fr) 104px 84px 196px'
const PANEL_LABEL = '#B4ACF7'
const SECONDS_PER_MONTH = 60n * 60n * 24n * 30n

function fmtWeiUsd(wei: bigint, ethPrice: number | null): string {
  const eth = Number(wei) / 1e18
  return ethPrice ? formatUsd(eth * ethPrice) : `${eth.toFixed(3).replace(/\.?0+$/, '')} ETH`
}

function PanelHead({ label, n, children }: { label: string; n?: number; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '15px 18px', minHeight: 56, boxSizing: 'border-box', borderBottom: '1px solid rgba(138,143,191,0.18)', background: 'rgba(138,143,191,0.05)' }}>
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: PANEL_LABEL }}>{label}</span>
      {n != null && <span style={{ fontFamily: MONO, fontSize: 11, color: PANEL_LABEL, background: 'rgba(180,172,247,0.12)', borderRadius: 99, padding: '1px 8px' }}>{n}</span>}
      {children && <span style={{ flex: 1 }} />}
      {children}
    </div>
  )
}

function SegToggle<K extends string>({ options, value, onChange, label }: {
  options: { k: K; l: string; n?: number }[]
  value: K
  onChange: (k: K) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(o => {
        const on = value === o.k
        return (
          <button
            key={o.k} role="radio" aria-checked={on} onClick={() => onChange(o.k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: on ? 'rgba(248,151,254,0.14)' : 'transparent', color: on ? PINK : TEXT2, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {o.l}{o.n != null && <span style={{ fontFamily: MONO, fontSize: 11, color: on ? PINK : PANEL_LABEL }}>{o.n}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ArchiveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      aria-label={label}
      style={{ height: 32, boxSizing: 'border-box', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, cursor: 'pointer', padding: '0 10px', color: TEXT2, fontSize: 12.5, fontWeight: 600, fontFamily: SANS }}
    >
      <Archive size={13} style={{ color: MUTED }} />
      Archive
    </button>
  )
}

function AttnGroup<T>({ title, sub, items, render }: { title: string; sub: string; items: T[]; render: (item: T) => React.ReactNode }) {
  const [all, setAll] = useState(false)
  const hidden = items.length - 3
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: AMBER }}>{title}</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: AMBER, background: `${AMBER}24`, borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>
        <span style={{ fontSize: 12.5, color: MUTED }}>{sub}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(all ? items : items.slice(0, 3)).map(render)}
        {hidden > 0 && (
          <button
            onClick={() => setAll(v => !v)}
            aria-expanded={all}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 38, boxSizing: 'border-box', background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 14, color: TEXT2, fontSize: 13, fontWeight: 600, fontFamily: SANS, cursor: 'pointer' }}
          >
            {all ? 'Show fewer' : `Show ${hidden} more ${hidden === 1 ? 'Markee' : 'Markees'}`}
            <ChevronDown size={12} style={{ transform: all ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
          </button>
        )}
      </div>
    </section>
  )
}

function AttnMarkeeItem({ lb, meta, cta, onCta, onArchive }: { lb: AnyLeaderboard; meta: string; cta: string; onCta: () => void; onArchive: () => void }) {
  return (
    <div style={{ background: 'rgba(10,15,61,0.5)', border: '1px solid rgba(138,143,191,0.18)', borderRadius: 14, boxShadow: `inset 3px 0 0 ${AMBER}`, padding: '12px 16px 12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lb.name || fmtAddr(lb.address)}</span>
      <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="xs" />
      <span style={{ fontSize: 12, color: MUTED }}>{meta}</span>
      <span style={{ flex: 1 }} />
      <ArchiveButton onClick={onArchive} label={`Archive ${lb.name || 'Markee'}`} />
      <button
        onClick={onCta}
        style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}
      >
        {cta}
      </button>
    </div>
  )
}

function MarkeeTableHead() {
  const th = (label: string, right?: boolean) => (
    <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: MUTED, textAlign: right ? 'right' : 'left' }}>{label}</span>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: MK_COLS, gap: 12, padding: '11px 18px' }}>
      {th('Shown on')}{th('Winning bid', true)}{th('Raised', true)}<span />
    </div>
  )
}

function MarkeeRow({ lb, archived, views, ethPrice, activeAddress, onAddToSite, onRestore, onSuccess }: {
  lb: AnyLeaderboard
  archived?: boolean
  views: number
  ethPrice: number | null
  activeAddress: string | undefined
  onAddToSite: () => void
  onRestore: () => void
  onSuccess: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isStreaming = lb.strategy === 'streaming'
  const ratePerSec = isStreaming && lb.topRateRaw ? BigInt(lb.topRateRaw) : 0n
  const raised = useLiveBalance(BigInt(lb.totalFundsRaw), ratePerSec)
  const topBid = BigInt(lb.topFundsAddedRaw ?? '0')
  const amount = (color: string = TEXT): React.CSSProperties => ({ textAlign: 'right', fontSize: 14, fontWeight: 700, color, whiteSpace: 'nowrap' })
  const dash = <span style={{ textAlign: 'right', color: MUTED, fontSize: 12.5 }}>–</span>
  const ghostBtn: React.CSSProperties = { background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }

  return (
    <div>
      <div
        onClick={archived ? undefined : () => setExpanded(v => !v)}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(138,143,191,0.05)' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        style={{
          display: 'grid', gridTemplateColumns: MK_COLS, gap: 12, padding: '12px 18px', alignItems: 'center',
          borderTop: `1px solid ${BORDER}`, cursor: archived ? 'default' : 'pointer', opacity: archived ? 0.7 : 1,
          background: expanded ? 'rgba(248,151,254,0.06)' : 'transparent', boxShadow: expanded ? `inset 2px 0 0 ${PINK}` : 'none',
          transition: 'background 120ms',
        }}
      >
        <span style={{ minWidth: 0 }}>
          {archived
            ? <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lb.name || fmtAddr(lb.address)}</span>
            : <span style={{ display: 'flex', minWidth: 0 }}><ServedOnCell lb={lb} onAddToSite={onAddToSite} /></span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
            <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="xs" />
            {archived
              ? <span>Archived</span>
              : <span title="Views" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Eye size={12} style={{ color: MUTED }} />
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: views ? TEXT2 : MUTED }}>{views.toLocaleString()}</span>
                </span>}
          </span>
        </span>

        {topBid === 0n ? dash
          : isStreaming ? (ratePerSec > 0n
            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <GlowDot size={7} color={GREEN} />
                <span style={amount(GREEN)}>{fmtWeiUsd(ratePerSec * SECONDS_PER_MONTH, ethPrice)}<span style={{ fontSize: 11.5, fontWeight: 500, color: MUTED }}>/mo</span></span>
              </span>
            : <span style={{ textAlign: 'right', fontSize: 12, color: MUTED }}>No active bids</span>)
          : <span style={amount()}>{fmtWeiUsd(topBid, ethPrice)}</span>}

        {topBid === 0n ? dash : <span style={amount()}>{fmtWeiUsd(raised, ethPrice)}</span>}

        <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          {archived ? (
            <button onClick={e => { e.stopPropagation(); onRestore() }} style={ghostBtn}>Restore</button>
          ) : (
            <>
              <a href={`/markee/${lb.address}`} onClick={e => e.stopPropagation()} style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                View Markee <ArrowUpRight size={11} />
              </a>
              <button
                onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                aria-expanded={expanded}
                style={{ ...ghostBtn, color: PINK, border: `1px solid ${PINK}`, fontWeight: 700, background: expanded ? `${PINK}14` : 'transparent' }}
              >
                Manage
              </button>
            </>
          )}
        </span>
      </div>
      {expanded && <LiveMarkeeAdminPanel lb={lb} activeAddress={activeAddress} onSuccess={onSuccess} />}
    </div>
  )
}

// ── Active Markees table ──────────────────────────────────────────────────────
function ServedOnCell({ lb, onAddToSite }: { lb: AnyLeaderboard; onAddToSite?: () => void }) {
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

  // Only when onAddToSite is passed (My Live Markees) is the dropdown reachable with zero or one
  // integration -- other callers keep the original behavior of only offering a dropdown once there's
  // more than one to actually pick between.
  const chevron = onAddToSite && (
    <button
      onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
      aria-label={open ? 'Hide integrations' : 'Show all integrations'}
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, cursor: 'pointer' }}
    >
      <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
    </button>
  )

  const dropdown = (items: Array<{ href: string; label: string }>) => open && (
    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 6, minWidth: 220, zIndex: 50, boxShadow: '0 16px 44px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 1 }}>
      {onAddToSite && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(false); onAddToSite() }}
          style={{ color: PINK, background: `${PINK}14`, border: `1px solid rgba(248,151,254,0.3)`, fontSize: 12, fontWeight: 700, fontFamily: MONO, padding: '8px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: items.length > 0 ? 4 : 0 }}
        >
          + Add to Another Site
        </button>
      )}
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
        {onAddToSite ? chevron : extras > 0 && pill(extras)}
        {dropdown(files.map(f => ({ href: fileUrl(f), label: f.filePath })))}
      </span>
    )
  }

  if (lb.platform === 'superfluid') {
    // Verification is address-based, independent of platform tag (see the comment above) -- a
    // Superfluid-platform board can still have a verified website/GitHub integration attached, so
    // this branch gets the same add/view dropdown as the others rather than a dead-end label.
    const sfFiles = (lb.linkedFiles ?? []).filter(f => f.verified)
    const sfUrls = lb.verifiedUrls ?? []
    const sfFileUrl = (f: LinkedFile) => `https://github.com/${f.repoFullName}/blob/HEAD/${f.filePath}`
    return (
      <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, position: 'relative' as const }}>
        {iconBox(
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/partners/superfluid.png" alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 12, color: TEXT2 }}>
          {lb.name || 'Superfluid'}
        </span>
        {onAddToSite && chevron}
        {dropdown([
          ...sfFiles.map(f => ({ href: sfFileUrl(f), label: f.filePath })),
          ...sfUrls.map(u => ({ href: u, label: u.replace(/^https?:\/\//, '').replace(/\/$/, '') })),
        ])}
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
      {onAddToSite ? chevron : extras > 0 && pill(extras)}
      {dropdown(urls.map(u => ({ href: u, label: u.replace(/^https?:\/\//, '').replace(/\/$/, '') })))}
    </span>
  )
}

const ACTIVE_COLS = '180px 1fr 130px 160px 110px'

function LiveMarkeeAdminPanel({ lb, activeAddress, onSuccess }: {
  lb: AnyLeaderboard
  activeAddress: string | undefined
  onSuccess: () => void
}) {
  const isAdmin = !!activeAddress && !!lb.admin && lb.admin.toLowerCase() === activeAddress.toLowerCase()
  const isStreaming = lb.strategy === 'streaming'
  // Legacy is a website-only historical concept (pre-migration TopDawg boards) -- github/superfluid/
  // streaming-platform listing routes never set it, so every board on those platforms already uses
  // the modern ABI with the setters below. Only a website-platform board can genuinely be legacy.
  const isLegacyFixed = !isStreaming && lb.platform === 'website' && (lb as WebsiteLeaderboard).isLegacy === true
  const contractAddress = lb.address as `0x${string}`

  return (
    <div onClick={e => e.stopPropagation()} style={{ borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.35)', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>Settings</div>
        {!isAdmin ? (
          <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>Only this Markee's admin wallet can change these.</p>
        ) : isLegacyFixed ? (
          <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>Admin settings aren't available for legacy boards from this dashboard.</p>
        ) : isStreaming ? (
          <div>
            <AdminSettingRow label="Minimum price" contractAddress={contractAddress} abi={StreamingLeaderboardABI as unknown as Abi} getterName="minimumMonthlyRate" setterName="setMinimumMonthlyRate" inputType="uint256" onSuccess={onSuccess} />
            <AdminSettingRow label="Beneficiary" contractAddress={contractAddress} abi={StreamingLeaderboardABI as unknown as Abi} getterName="beneficiaryAddress" setterName="setBeneficiaryAddress" inputType="address" onSuccess={onSuccess} />
            <AdminSettingRow label="Max message characters" contractAddress={contractAddress} abi={StreamingLeaderboardABI as unknown as Abi} getterName="maxMessageLength" setterName="setMaxMessageLength" inputType="uint256" onSuccess={onSuccess} />
            <AdminSettingRow label="Max author characters" contractAddress={contractAddress} abi={StreamingLeaderboardABI as unknown as Abi} getterName="maxNameLength" setterName="setMaxNameLength" inputType="uint256" onSuccess={onSuccess} />
            <AdminSettingRow
              label="Transfer Admin" contractAddress={contractAddress} abi={StreamingLeaderboardABI as unknown as Abi} getterName="admin" setterName="setAdmin" inputType="address"
              dangerous="confirm" warning="Hands full control of this Markee to another wallet. Only the new admin can undo it." onSuccess={onSuccess}
            />
          </div>
        ) : (lb as BaseLeaderboard).verificationGated ? (
          <div>
            <AdminSettingRow label="Minimum price" contractAddress={contractAddress} abi={TopDawgPartnerStrategyABI as unknown as Abi} getterName="minimumPrice" setterName="setMinimumPrice" inputType="uint256" onSuccess={onSuccess} />
            <AdminSettingRow label="Max message characters" contractAddress={contractAddress} abi={TopDawgPartnerStrategyABI as unknown as Abi} getterName="maxMessageLength" setterName="setMaxMessageLength" inputType="uint256" onSuccess={onSuccess} />
            <AdminSettingRow label="Max author characters" contractAddress={contractAddress} abi={TopDawgPartnerStrategyABI as unknown as Abi} getterName="maxNameLength" setterName="setMaxNameLength" inputType="uint256" onSuccess={onSuccess} />
            <AdminSettingRow label="Beneficiary" contractAddress={contractAddress} abi={TopDawgPartnerStrategyABI as unknown as Abi} getterName="beneficiaryAddress" setterName="setBeneficiaryAddress" inputType="address" onSuccess={onSuccess} />
            <AdminSettingRow
              label="Transfer Admin" contractAddress={contractAddress} abi={TopDawgPartnerStrategyABI as unknown as Abi} getterName="admin" setterName="setAdminAddress" inputType="address"
              dangerous="confirm" warning="Hands full control of this Markee to another wallet. Only the new admin can undo it." onSuccess={onSuccess}
            />
          </div>
        ) : (
          <div>
            <AdminSettingRow label="Beneficiary" contractAddress={contractAddress} abi={LeaderboardV11ABI as unknown as Abi} getterName="beneficiaryAddress" setterName="setBeneficiaryAddress" inputType="address" onSuccess={onSuccess} />
            <AdminSettingRow
              label="Transfer Admin" contractAddress={contractAddress} abi={LeaderboardV11ABI as unknown as Abi} getterName="admin" setterName="setAdmin" inputType="address"
              dangerous="confirm" warning="Hands full control of this Markee to another wallet. Only the new admin can undo it." onSuccess={onSuccess}
            />
          </div>
        )}
      </div>

      {/* Per-board moderators, managed by the board's owners (admin or creator) -- kept separate from
          lib/moderation/config.ts's global admins, whose flags only apply on markee.xyz. Legacy
          boards aren't scanned for the queue, so there is nothing for moderators to review there. */}
      {!isLegacyFixed && <BoardModerators board={lb.address} />}
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
                <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={m.address} boardAdmin={m.admin} className="min-w-0 flex-1">
                  <span style={{ fontFamily: MONO, fontSize: 12.5, color: m.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: m.message ? 'normal' : 'italic', display: 'block' }}>{m.message || 'No message'}</span>
                </ModeratedContent>
                <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={m.address} boardAdmin={m.admin} compact />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={m.address} boardAdmin={m.admin} className="min-w-0 flex-1">
                  <span style={{ fontFamily: MONO, fontSize: 12.5, color: m.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: m.message ? 'normal' : 'italic', display: 'block' }}>{m.message || 'No message yet'}</span>
                </ModeratedContent>
                <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={m.address} boardAdmin={m.admin} compact />
              </div>
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

// ── StatsChart ────────────────────────────────────────────────────────────────
type ChartType  = 'bar' | 'line'
type ChartRange = '7d' | '30d' | '90d'
const LAVENDER = '#A898F5'

interface ChartMetric { label: string; value: string; delta?: number }

function StatsChart({ metrics, seed = 1 }: { metrics: ChartMetric[]; seed?: number }) {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [range, setRange]         = useState<ChartRange>('30d')
  const [activeIdx, setActiveIdx] = useState(0)

  const W = 560, H = 160
  const PAD = { t: 10, b: 28, l: 44, r: 12 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const nPoints = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const barW    = Math.max(2, (innerW / nPoints) * 0.65)

  const data = useMemo(() => {
    const pts: number[] = []
    for (let i = 0; i < nPoints; i++) {
      pts.push(Math.abs(Math.sin(seed * 3.14 + i * 2.71 + i * i * 0.01)) * 0.8 + 0.15)
    }
    return pts
  }, [seed, nPoints])

  const cumData = useMemo(() =>
    data.reduce((acc, v) => { acc.push((acc[acc.length - 1] ?? 0) + v); return acc }, [] as number[]),
    [data]
  )

  const displayData = chartType === 'line' ? cumData : data
  const dMax = Math.max(...displayData) || 1

  const xLine = (i: number) => PAD.l + (nPoints > 1 ? (i / (nPoints - 1)) * innerW : innerW / 2)
  const yOf   = (v: number) => PAD.t + innerH - (v / dMax) * innerH

  const linePath = useMemo(() => {
    const pts = displayData.map((v, i) => [xLine(i), yOf(v)] as [number, number])
    if (pts.length < 2) return ''
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(1)
      d += ` C ${cpx} ${pts[i - 1][1].toFixed(1)}, ${cpx} ${pts[i][1].toFixed(1)}, ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayData, nPoints])

  const areaPath  = `${linePath} L ${xLine(nPoints - 1).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} L ${PAD.l} ${(PAD.t + innerH).toFixed(1)} Z`
  const gradId    = `areaGrad-${seed}`
  const yTick1    = PAD.t + innerH * 0.33
  const yTick2    = PAD.t + innerH * 0.67

  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px 16px', marginBottom: 24 }}>
      {/* Stat header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const }}>
        {metrics.map((m, i) => {
          const on = i === activeIdx
          return (
            <button
              key={m.label}
              onClick={() => setActiveIdx(i)}
              style={{
                background: on ? `${LAVENDER}1A` : 'transparent',
                border: `1px solid ${on ? LAVENDER + '44' : 'transparent'}`,
                borderRadius: 9, padding: '8px 12px', cursor: 'pointer', textAlign: 'left' as const,
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase' as const, color: on ? LAVENDER : MUTED, marginBottom: 3 }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: on ? PINK : TEXT }}>{m.value}</span>
                {m.delta !== undefined && (
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: m.delta >= 0 ? GREEN : '#FF6B6B' }}>
                    {m.delta >= 0 ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}%
                  </span>
                )}
              </div>
            </button>
          )
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          {/* bar / line toggle */}
          <div style={{ display: 'flex', background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, overflow: 'hidden' }}>
            {(['bar', 'line'] as ChartType[]).map(t => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                title={t === 'bar' ? 'Bar chart' : 'Line chart'}
                style={{ padding: '5px 9px', background: chartType === t ? `${LAVENDER}28` : 'transparent', border: 'none', cursor: 'pointer', color: chartType === t ? LAVENDER : MUTED, display: 'flex', alignItems: 'center' }}
              >
                {t === 'bar'
                  ? <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><rect x="0" y="6" width="3" height="7" rx="1"/><rect x="5" y="3" width="3" height="10" rx="1"/><rect x="10" y="0" width="3" height="13" rx="1"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="0,10 3,6 6.5,8 10,3 13,1"/></svg>
                }
              </button>
            ))}
          </div>
          {/* range buttons */}
          <div style={{ display: 'flex', background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, overflow: 'hidden' }}>
            {(['7d', '30d', '90d'] as ChartRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{ padding: '4px 10px', background: range === r ? LAVENDER : 'transparent', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: range === r ? BG : MUTED }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG chart */}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={PINK} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={PINK} stopOpacity="0.02"/>
          </linearGradient>
        </defs>

        {/* Gridlines */}
        <line x1={PAD.l} y1={yTick1} x2={PAD.l + innerW} y2={yTick1} stroke={BORDER} strokeWidth="1"/>
        <line x1={PAD.l} y1={yTick2} x2={PAD.l + innerW} y2={yTick2} stroke={BORDER} strokeWidth="1"/>
        <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} stroke={BORDER} strokeWidth="1"/>

        {/* Y-axis labels (proportional to dMax — placeholder scale) */}
        <text x={PAD.l - 5} y={yTick1} textAnchor="end" dominantBaseline="middle" fill={MUTED} fontSize="9" fontFamily="JetBrains Mono,monospace">
          {(dMax * 0.67).toFixed(1)}
        </text>
        <text x={PAD.l - 5} y={yTick2} textAnchor="end" dominantBaseline="middle" fill={MUTED} fontSize="9" fontFamily="JetBrains Mono,monospace">
          {(dMax * 0.33).toFixed(1)}
        </text>

        {/* Chart body */}
        {chartType === 'bar'
          ? data.map((v, i) => {
              const x = PAD.l + (i / nPoints) * innerW + (innerW / nPoints - barW) / 2
              const y = yOf(v)
              return <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)} width={barW} height={(PAD.t + innerH - y).toFixed(1)} rx="2" fill={LAVENDER} opacity="0.72"/>
            })
          : <>
              <path d={areaPath} fill={`url(#${gradId})`}/>
              <path d={linePath} fill="none" stroke={PINK} strokeWidth="1.8" strokeLinejoin="round"/>
            </>
        }

        {/* Centre label */}
        <text x={W / 2} y={PAD.t + innerH / 2 + 4} textAnchor="middle" fill={`${MUTED}50`} fontSize="10" fontFamily="JetBrains Mono,monospace">
          {chartType === 'bar' ? 'Daily totals' : 'Cumulative total'}
        </text>

        {/* X-axis labels */}
        <text x={PAD.l} y={H - 3} textAnchor="start" fill={MUTED} fontSize="8.5" fontFamily="JetBrains Mono,monospace">{nPoints} days ago</text>
        <text x={PAD.l + innerW} y={H - 3} textAnchor="end"  fill={MUTED} fontSize="8.5" fontFamily="JetBrains Mono,monospace">Today</text>
      </svg>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { activeAddress, hasWallet } = useActiveWallet()
  const ethPrice = useEthPrice()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [depositManagerOpen, setDepositManagerOpen] = useState(false)
  const [addrCopied, setAddrCopied] = useState(false)

  // Platform leaderboards
  const [superfluidBoards, setSuperfluidBoards] = useState<SuperfluidLeaderboard[]>([])
  const [githubBoards, setGithubBoards]         = useState<GithubLeaderboard[]>([])
  const [websiteBoards, setWebsiteBoards]       = useState<WebsiteLeaderboard[]>([])
  const [streamingBoards, setStreamingBoards]   = useState<AnyLeaderboard[]>([])
  // Starts true, not false: fetchAll() only runs once activeAddress resolves (wallet hydration takes
  // at least one tick), so a false initial value left a window -- after mount, before the wallet
  // address arrives -- where isLoading was false AND draftBoards was still empty at the same time.
  // The eviction effect below only checks isLoading to decide whether draftBoards' emptiness is real,
  // so that window was enough to bounce a user with genuine pending boards off the tab before the
  // fetch had even started, with nothing to bounce them back once real data arrived. A disconnected
  // visitor never sees this: the tab content is gated on hasWallet separately, so isLoading staying
  // true forever when there's no wallet to fetch for is inert.
  const [isLoading, setIsLoading]               = useState(true)
  const { isAdmin: isGlobalModerator } = useModeration()
  const moderationQueue = useModerationQueue()

  // Messages
  const [myMessages, setMyMessages]             = useState<MyMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [fundedMessages, setFundedMessages]     = useState<FundedMessage[]>([])
  const [isLoadingFunded, setIsLoadingFunded]   = useState(false)
  const [boardViews, setBoardViews]             = useState<Record<string, number>>({})

  // UI state
  const [section, setSection]                 = useState<SectionId>('creator')
  const [archived, setArchived]               = useState<string[]>([])
  const [markeeView, setMarkeeView]           = useState<'active' | 'archived'>('active')
  // "Archive" is purely a local dashboard preference -- there's no on-chain or backend concept of
  // it -- so without persisting it, every reload silently un-archives everything. Keyed per wallet
  // in localStorage; the ref tracks which wallet's list is currently loaded so the save effect below
  // can't fire with a stale empty array before the load effect has actually run for this wallet.
  const archivedLoadedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeAddress) return
    try {
      const raw = localStorage.getItem(`markee:archived:${activeAddress.toLowerCase()}`)
      setArchived(raw ? JSON.parse(raw) : [])
    } catch { setArchived([]) }
    archivedLoadedForRef.current = activeAddress.toLowerCase()
  }, [activeAddress])
  useEffect(() => {
    if (!activeAddress || archivedLoadedForRef.current !== activeAddress.toLowerCase()) return
    try { localStorage.setItem(`markee:archived:${activeAddress.toLowerCase()}`, JSON.stringify(archived)) } catch { /* non-critical */ }
  }, [archived, activeAddress])
  const [activateTarget, setActivateTarget]       = useState<AnyLeaderboard | null>(null)
  const [activateStreamBoard, setActivateStreamBoard] = useState<AnyLeaderboard | null>(null)
  const [embedTarget, setEmbedTarget]           = useState<AnyLeaderboard | null>(null)
  const [embedInitialPlatform, setEmbedInitialPlatform] = useState<'github' | 'website'>('website')
  const embedReopenApplied = useRef(false)
  const [editMessageTarget, setEditMessageTarget]       = useState<MyMessage | null>(null)
  const [streamEditTarget, setStreamEditTarget]         = useState<MyMessage | null>(null)
  // My Live Markees' price-to-change button -- opens the same rich buy/change modal any visitor
  // would see for that board (StreamSignModal for streaming, MarkeeSignModal for modern fixed
  // boards, BuyMessageModal for legacy fixed boards whose data is subgraph- not RPC-sourced). None
  // of these need an initialView: if the connected admin already backs/owns the top message, each
  // modal's own list view already offers Manage/Add Funds for that row.
  const [priceButtonTarget, setPriceButtonTarget]       = useState<AnyLeaderboard | null>(null)
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

  const awaitingSiteBoards = useMemo(() =>
    awaitingVerification.filter(lb => !archived.includes(lb.address)), [awaitingVerification, archived])

  const sortedActiveBoards = useMemo(() =>
    [...activeBoards].sort((a, b) => compareByRaised('raised', b, a)), [activeBoards])

  // draftBoards is exactly the "Pending Setup" tab's contents (awaitingVerification + inactive,
  // both already archived-filtered) -- used here only as its count/visibility source; the tab body
  // itself still renders the two underlying memos directly (see the JSX below) so nothing about
  // their own filtering changes.
  const draftBoards = useMemo(() =>
    [...awaitingSiteBoards, ...inactiveBoards], [awaitingSiteBoards, inactiveBoards])

  // Boards the wallet created, plus any it was added to as a moderator (the queue lists those).
  const isModerator = isGlobalModerator || moderationQueue.boards.length > 0

  // Read initial section and verifyOk from URL params (e.g. after email verification redirect).
  const [verifyOk, setVerifyOk] = useState(false)
  const sectionAppliedRef = useRef(false)
  useEffect(() => {
    if (sectionAppliedRef.current || typeof window === 'undefined') return
    sectionAppliedRef.current = true
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('section') ?? params.get('tab')
    const map: Record<string, SectionId> = {
      settings: 'settings', feed: 'feed', creator: 'creator', buyer: 'buyer',
      moderation: 'feed', live: 'creator', pending: 'creator', archive: 'creator', bought: 'buyer',
    }
    if (raw && map[raw]) setSection(map[raw])
    if (params.get('verifyOk') === '1') setVerifyOk(true)
    const clean = new URL(window.location.href)
    clean.searchParams.delete('section')
    clean.searchParams.delete('tab')
    clean.searchParams.delete('verifyOk')
    clean.searchParams.delete('verifyError')
    window.history.replaceState(null, '', clean.toString())
  }, [])

  const showingNow = useMemo(() => myMessages.filter(m => m.isTop), [myMessages])
  const outbid = useMemo(() => myMessages.filter(m => !m.isTop), [myMessages])

  const totalRaisedWei = useMemo(() => allBoards.reduce((s, lb) => s + BigInt(lb.totalFundsRaw), 0n), [allBoards])
  const totalContribWei = useMemo(() => {
    const bought = myMessages.reduce((s, m) => s + m.totalFundsAdded, 0n)
    const funded = fundedMessages.reduce((s, m) => s + BigInt(m.totalContributed), 0n)
    return bought + funded
  }, [myMessages, fundedMessages])

  // Fetch markee.xyz view counts for CPM calculations
  useEffect(() => {
    const addrs = allBoards.map(b => b.address.toLowerCase()).slice(0, 100)
    if (addrs.length === 0) return
    fetch(`/api/views?addresses=${addrs.join(',')}`)
      .then(r => r.json())
      .then((data: Record<string, { totalViews: number }>) => {
        setBoardViews(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.totalViews ?? 0])))
      })
      .catch(() => {})
  }, [allBoards])

  const creatorCpm = useMemo(() => {
    if (!ethPrice) return null
    const raisedUsd = Number(totalRaisedWei) / 1e18 * ethPrice
    if (!raisedUsd) return null
    const totalViews = activeBoards.reduce((s, lb) => s + (boardViews[lb.address.toLowerCase()] ?? 0), 0)
    if (!totalViews) return null
    return (raisedUsd / totalViews) * 1000
  }, [ethPrice, totalRaisedWei, activeBoards, boardViews])

  const buyerViews = useMemo(() => {
    const addrs = new Set(myMessages.map(m => m.strategyId.toLowerCase()))
    return [...addrs].reduce((s, a) => s + (boardViews[a] ?? 0), 0)
  }, [myMessages, boardViews])

  const buyerCpm = useMemo(() => {
    if (!ethPrice) return null
    const contribUsd = Number(totalContribWei) / 1e18 * ethPrice
    if (!contribUsd || !buyerViews) return null
    return (contribUsd / buyerViews) * 1000
  }, [ethPrice, totalContribWei, buyerViews])

  const handleOpenAddToSite = useCallback((lb: AnyLeaderboard) => {
    setEmbedTarget(lb)
    setEmbedInitialPlatform(lb.platform === 'github' ? 'github' : 'website')
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
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: TEXT, letterSpacing: -0.6 }}>My Dashboard</h1>
              {mounted && (activeAddress
                ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 0' }}>
                    <span style={{ color: MUTED, fontSize: 14, fontFamily: MONO }}>{fmtAddr(activeAddress)}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(activeAddress).then(() => { setAddrCopied(true); setTimeout(() => setAddrCopied(false), 2000) }).catch(() => {})}
                      title="Copy address"
                      style={{ display: 'flex', background: 'transparent', border: 'none', color: addrCopied ? GREEN : MUTED, cursor: 'pointer', padding: 2, flexShrink: 0 }}
                    >
                      {addrCopied
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      }
                    </button>
                  </div>
                )
                : <p style={{ margin: '2px 0 0', color: MUTED, fontSize: 14 }}>Connect your wallet to continue</p>
              )}
            </div>
            {mounted && !hasWallet && (
              <div style={{ marginLeft: 'auto' }}><ConnectButton /></div>
            )}
            {mounted && hasWallet && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <button
                  onClick={() => setDepositManagerOpen(true)}
                  style={{
                    background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 10,
                    padding: '11px 18px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    transition: 'border-color 120ms, color 120ms',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${PINK}66`; (e.currentTarget as HTMLElement).style.color = TEXT }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
                >
                  Deposit Manager
                </button>
                <a
                  href="/"
                  style={{
                    background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 10,
                    padding: '11px 18px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    textDecoration: 'none', display: 'inline-block',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${PINK}18` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  Create New Markee
                </a>
              </div>
            )}
          </div>

          {mounted && hasWallet && (
            <Overview
              raised={totalRaisedWei}
              active={activeBoards.length}
              buyerViews={buyerViews}
              buyerCpm={buyerCpm}
              ethPrice={ethPrice}
              loaded={!isLoading && !isLoadingMessages}
            />
          )}
        </div>
      </section>

      {/* Sidebar + content */}
      <div style={{ flex: 1, maxWidth: 1240, width: '100%', margin: '0 auto', padding: '0 40px 80px' }}>
        {mounted && hasWallet ? (
          <div style={{ display: 'flex', gap: 32, paddingTop: 28, alignItems: 'flex-start' }}>
            <SidebarNav
              section={section}
              setSection={setSection}
              moderationCount={isModerator ? moderationQueue.items.length : 0}
            />

            <main style={{ flex: 1, minWidth: 0 }}>
              {/* ── Activity Feed ── */}
              {section === 'feed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {isModerator ? (
                    <ModerationQueue />
                  ) : (
                    <div style={{ background: BG2, border: `1px dashed ${BORDER}`, borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
                      <p style={{ margin: '0 0 6px', color: TEXT, fontWeight: 700, fontSize: 16 }}>No activity yet</p>
                      <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Create or moderate a Markee to see activity here.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Creator Hub ── */}
              {section === 'creator' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <StatsChart
                    seed={1}
                    metrics={[
                      { label: 'Revenue', value: ethPrice && !isLoading ? formatUsd(Number(totalRaisedWei) / 1e18 * ethPrice) : '—', delta: 12.4 },
                      { label: 'Views', value: !isLoading ? activeBoards.reduce((s, lb) => s + (boardViews[lb.address.toLowerCase()] ?? 0), 0).toLocaleString() : '—', delta: 5.1 },
                      { label: 'Earned per 1k Views', value: creatorCpm ? `$${creatorCpm.toFixed(2)}` : '—', delta: 7.2 },
                    ]}
                  />
                  <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                    <PanelHead label="Your Markees" n={draftBoards.length + activeBoards.length}>
                      <SegToggle
                        label="Show"
                        value={markeeView}
                        onChange={setMarkeeView}
                        options={[
                          { k: 'active', l: 'Active', n: draftBoards.length + activeBoards.length },
                          { k: 'archived', l: 'Archived', n: archivedBoards.length },
                        ]}
                      />
                      <Link href="/raise-funding" style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: SANS, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Create New Markee
                      </Link>
                    </PanelHead>

                    {!isLoading && markeeView === 'active' && draftBoards.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 18px 20px', borderBottom: `1px solid ${BORDER}` }}>
                        {inactiveBoards.length > 0 && (
                          <AttnGroup
                            title="Not Yet Activated"
                            sub="Activate to set the first message."
                            items={inactiveBoards}
                            render={lb => (
                              <AttnMarkeeItem
                                key={lb.address}
                                lb={lb}
                                meta={`Pays out to ${fmtAddr(lb.admin)}`}
                                cta="Activate"
                                onCta={() => lb.strategy === 'streaming' ? setActivateStreamBoard(lb) : setActivateTarget(lb)}
                                onArchive={() => setArchived(prev => [...prev, lb.address])}
                              />
                            )}
                          />
                        )}
                        {awaitingSiteBoards.length > 0 && (
                          <AttnGroup
                            title="Not on a Site Yet"
                            sub="Add the embed to your site to go live."
                            items={awaitingSiteBoards}
                            render={lb => (
                              <AttnMarkeeItem
                                key={lb.address}
                                lb={lb}
                                meta={`${fmtWeiUsd(BigInt(lb.totalFundsRaw), ethPrice)} raised`}
                                cta="Add to Your Site"
                                onCta={() => handleOpenAddToSite(lb)}
                                onArchive={() => setArchived(prev => [...prev, lb.address])}
                              />
                            )}
                          />
                        )}
                      </div>
                    )}

                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: 620 }}>
                        <MarkeeTableHead />
                        {isLoading ? (
                          [1, 2, 3].map(i => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: MK_COLS, gap: 12, padding: '16px 18px', borderTop: `1px solid ${BORDER}` }}>
                              {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                            </div>
                          ))
                        ) : (markeeView === 'active' ? sortedActiveBoards : archivedBoards).length === 0 ? (
                          <div style={{ padding: '22px 18px', borderTop: `1px solid ${BORDER}`, fontSize: 13, color: MUTED }}>
                            {markeeView === 'active' ? 'No live Markees yet.' : 'No archived Markees.'}
                          </div>
                        ) : (
                          (markeeView === 'active' ? sortedActiveBoards : archivedBoards).map(lb => (
                            <MarkeeRow
                              key={lb.address}
                              lb={lb}
                              archived={markeeView === 'archived'}
                              views={boardViews[lb.address.toLowerCase()] ?? 0}
                              ethPrice={ethPrice}
                              activeAddress={activeAddress}
                              onAddToSite={() => handleOpenAddToSite(lb)}
                              onRestore={() => setArchived(prev => prev.filter(a => a !== lb.address))}
                              onSuccess={() => activeAddress && fetchAll(activeAddress)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Moderation */}
                  {isModerator && (
                    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }}>Moderation</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: moderationQueue.items.length > 0 ? AMBER : MUTED, background: moderationQueue.items.length > 0 ? `${AMBER}1E` : 'rgba(138,143,191,0.15)', borderRadius: 99, padding: '1px 8px' }}>{moderationQueue.items.length}</span>
                      </div>
                      <ModerationQueue />
                    </div>
                  )}
                </div>
              )}

              {/* ── Buyer Hub ── */}
              {section === 'buyer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                  <StatsChart
                    seed={2}
                    metrics={[
                      { label: 'Spent', value: ethPrice && !isLoadingMessages ? formatUsd(Number(totalContribWei) / 1e18 * ethPrice) : '—', delta: -3.2 },
                      { label: 'Views', value: !isLoadingMessages ? [...new Set(myMessages.map(m => m.strategyId.toLowerCase()))].reduce((s, addr) => s + (boardViews[addr] ?? 0), 0).toLocaleString() : '—', delta: 8.5 },
                      { label: 'Cost per 1k Views', value: buyerCpm ? `$${buyerCpm.toFixed(2)}` : '—', delta: -1.8 },
                    ]}
                  />
                  {!isLoadingMessages && myMessages.length > 0 && (
                    <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT2 }}>
                      <span style={{ color: GREEN, fontWeight: 600 }}>{showingNow.length} showing now</span>
                      {' · '}
                      <span>{outbid.length} outbid</span>
                    </div>
                  )}

                  {isLoadingMessages ? (
                    <div style={{ overflow: 'auto' }}>
                      <div style={{ minWidth: 640, background: BG2 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 12, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                            {[1, 2, 3, 4, 5, 6].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {showingNow.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>Showing now</h2>
                            <CountBadge n={showingNow.length} />
                          </div>
                          <BoughtTable items={showingNow} ethPrice={ethPrice} onEdit={handleEditMessage} onAddFunds={m => setAddFundsTarget({ strategy: m.strategy ?? 'fixed', strategyId: m.strategyId, markeeAddress: m.address, message: m.message, totalFundsAdded: m.totalFundsAdded, topFunds: m.topFunds, name: m.name, isLegacy: m.isLegacy })} onAddToSite={m => { setEmbedTarget({ address: m.strategyId, name: m.strategyName } as AnyLeaderboard); setEmbedInitialPlatform(m.platform === 'github' ? 'github' : 'website') }} />
                        </div>
                      )}
                      {outbid.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT2 }}>Outbid</h2>
                            <CountBadge n={outbid.length} />
                          </div>
                          <BoughtTable items={outbid} ethPrice={ethPrice} onEdit={handleEditMessage} onAddFunds={m => setAddFundsTarget({ strategy: m.strategy ?? 'fixed', strategyId: m.strategyId, markeeAddress: m.address, message: m.message, totalFundsAdded: m.totalFundsAdded, topFunds: m.topFunds, name: m.name, isLegacy: m.isLegacy })} onAddToSite={m => { setEmbedTarget({ address: m.strategyId, name: m.strategyName } as AnyLeaderboard); setEmbedInitialPlatform(m.platform === 'github' ? 'github' : 'website') }} />
                        </div>
                      )}
                    </>
                  )}

                  {isLoadingFunded ? (
                    <div style={{ overflow: 'auto' }}>
                      <div style={{ minWidth: 640, background: BG2 }}>
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
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>Funded by me</h2>
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

              {/* ── Settings ── */}
              {section === 'settings' && activeAddress && (
                <SettingsSection address={activeAddress} verifyOk={verifyOk} />
              )}
            </main>
          </div>
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

      {mounted && isModerator && <ModerationToast onReview={() => setSection('feed')} />}
      <Footer />

      {/* My Live Markees' price-to-change button -- same modal any visitor would see for that
          board, no initialView: if the connected admin already backs/owns the top message, the
          modal's own list view already offers Manage/Add Funds for that row. */}
      {priceButtonTarget?.strategy === 'streaming' && (
        <StreamSignModal
          isOpen
          board={priceButtonTarget.address}
          onClose={() => setPriceButtonTarget(null)}
          onSuccess={() => { if (activeAddress) fetchAll(activeAddress) }}
        />
      )}
      {priceButtonTarget && priceButtonTarget.strategy !== 'streaming' && priceButtonTarget.platform === 'website' && (priceButtonTarget as WebsiteLeaderboard).isLegacy && (
        <BuyMessageModal
          isOpen
          onClose={() => setPriceButtonTarget(null)}
          strategyAddress={priceButtonTarget.address as `0x${string}`}
          onSuccess={() => { if (activeAddress) fetchAll(activeAddress) }}
        />
      )}
      {priceButtonTarget && priceButtonTarget.strategy !== 'streaming' && !(priceButtonTarget.platform === 'website' && (priceButtonTarget as WebsiteLeaderboard).isLegacy) && (
        <MarkeeSignModal
          isOpen
          onClose={() => setPriceButtonTarget(null)}
          leaderboardAddress={priceButtonTarget.address}
          onSuccess={() => { if (activeAddress) fetchAll(activeAddress) }}
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
