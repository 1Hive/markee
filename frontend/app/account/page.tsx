'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { Globe2, Github, Zap, Info } from 'lucide-react'
import { useSignMessage } from 'wagmi'
import { MODERATION_API } from '@/lib/moderation/config'
import { notifyEmailMessage, notifyPrefsMessage, notifyEventsOf, type EmailFrequency, type NotifyEvents } from '@/lib/moderation/queue'
import type { ActivityEvent } from '@/lib/activity/events'
import { IntegrationHealthStatus } from '@/components/IntegrationHealthStatus'
import { EmbedModal } from '@/components/modals/EmbedModal'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { StrategyBadge } from '@/components/StrategyBadge'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { MarkeeSignModal } from '@/components/modals/MarkeeSignModal'
import { EditMessageModal } from '@/components/modals/EditMessageModal'
import { StreamActivateModal } from '@/components/modals/StreamActivateModal'
import { StreamSignModal } from '@/components/modals/StreamSignModal'
import { needsVerificationGate, isVerifiedLeaderboard } from '@/lib/leaderboards/verification'
import { runwaySeconds, runwayTier } from '@/lib/superfluid/streaming'
import { MONO, PINK, BLUE, GREEN, BG2, BG, TEXT2, TEXT, MUTED, BORDER, SANS, AMBER, DANGER, LAVENDER, HERO_BG, CARD_BG } from '@/lib/design-tokens'
import type { BaseLeaderboard, LinkedFile, SuperfluidLeaderboard, GithubLeaderboard, WebsiteLeaderboard, AnyLeaderboard, MyMessage, FundedMessage } from '@/components/account/types'
import { ToastProvider, useToast } from '@/components/account/Toast'
import { YourMarkees, compareByRaised } from '@/components/account/CreatorHub'
import { ManageDrawer } from '@/components/account/ManageDrawer'
import { BestBuys, StreamBalanceCard, YourMessages, useStreamSnapshot, winningRate, winPrice } from '@/components/account/BuyerHub'
import { NeedsAttention } from '@/components/account/NeedsAttention'
import { LatestActivity } from '@/components/account/ActivityFeed'
import { fmtAddr, GlowDot, PanelHead, WalletPending } from '@/components/account/primitives'
import { formatUsd } from '@/lib/utils'
import { ModerationQueue, ModerationToast, useModeration } from '@/components/moderation'
import { useModerationQueue } from '@/hooks/useModerationQueue'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'


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
// Company logo via logo.dev CDN. Falls back to 🪧 if the image fails to load.
// ── Platform icon ─────────────────────────────────────────────────────────────
function PlatIcon({ lb, size = 20 }: { lb: AnyLeaderboard; size?: number }) {
  if (lb.platform === 'github')     return <Github size={size} style={{ color: TEXT2 }} />
  if (lb.platform === 'superfluid') return <Zap size={size} style={{ color: GREEN }} />
  return <Globe2 size={size} style={{ color: PINK }} />
}

// ── Overview stats ────────────────────────────────────────────────────────────

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
    <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: 'rgba(138,143,191,0.15)', flexShrink: 0 }} />
        <div style={{ width: 80, height: 20, background: 'rgba(138,143,191,0.08)', borderRadius: 6 }} />
      </div>
      <div style={{ width: 90, height: 12, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
    </div>
  )
  return (
    <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 18px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GlowDot size={6} color={color} />
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color, letterSpacing: -0.5, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
      </div>
      <div style={{ color: TEXT2, fontSize: 13, fontWeight: 600, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Overview({ raised, active, buyerViews, buyerCpm, ethPrice, loaded }: {
  raised: bigint; active: number; buyerViews: number
  ethPrice: number | null; buyerCpm: number | null; loaded: boolean
}) {
  const raisedUsd = ethPrice ? Number(raised) / 1e18 * ethPrice : null
  const fmtViews  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
  const groupLabel: React.CSSProperties = { fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: LAVENDER, marginBottom: 10, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 7 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }
  const group = (tint: string): React.CSSProperties => ({ background: `rgba(${tint},0.02)`, border: `1px solid rgba(${tint},0.08)`, borderRadius: 16, padding: 12 })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
      <div style={group('248,151,254')}>
        <div style={groupLabel}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v5M8 21h8" /></svg>
          Creator
        </div>
        <div style={grid2}>
          <OverviewStatCard n={String(active)} label="Active Signs" color={GREEN} loaded={loaded} />
          <OverviewStatCard n={raisedUsd != null ? formatUsd(raisedUsd) : fmtEth(raised)} label="Total Raised" color={PINK} loaded={loaded} />
        </div>
      </div>
      <div style={group('124,156,255')}>
        <div style={groupLabel}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          Buyer
        </div>
        <div style={grid2}>
          <OverviewStatCard n={fmtViews(buyerViews)} label="Total Views" color={BLUE} loaded={loaded} />
          <OverviewStatCard n={buyerCpm != null ? formatUsd(buyerCpm) : '-'} label="Cost per 1k Views" color={TEXT2} loaded={loaded} />
        </div>
      </div>
    </div>
  )
}

// ── Section navigation ────────────────────────────────────────────────────────
type SectionId = 'feed' | 'creator' | 'buyer' | 'settings'

function SidebarNav({ section, setSection, attentionCount }: { section: SectionId; setSection: (s: SectionId) => void; attentionCount: number }) {
  const items: { key: SectionId; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: 'feed', label: 'Activity Feed', badge: attentionCount > 0 ? attentionCount : undefined,
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
        aria-current={on ? 'page' : undefined}
        className="acct-side-item"
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%',
          padding: '10px 12px', borderRadius: 8, whiteSpace: 'nowrap',
          border: 'none', boxShadow: on ? `inset 2px 0 0 ${PINK}` : 'none',
          background: on ? 'rgba(248,151,254,0.08)' : 'transparent',
          color: on ? TEXT : TEXT2,
          fontFamily: SANS, fontSize: 14, fontWeight: on ? 700 : 500,
          cursor: 'pointer', textAlign: 'left' as const,
        }}
      >
        <span style={{ color: on ? PINK : MUTED, flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: AMBER, background: `${AMBER}24`, borderRadius: 99, padding: '1px 8px', flexShrink: 0 }}>{badge}</span>
        )}
      </button>
    )
  }

  return (
    <nav className="acct-side" aria-label="Dashboard">
      {items.map(it => btn(it.key, it.label, it.icon, it.badge))}
      <div role="separator" className="acct-side-sep" style={{ height: 1, background: BORDER, margin: '10px 12px' }} />
      {btn('settings', 'Settings', settingsIcon)}
    </nav>
  )
}

// ── Settings section ──────────────────────────────────────────────────────────
interface NotifyState { email: string | null; verified: boolean; frequency: string; events?: NotifyEvents }

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
  const toast = useToast()
  const { signMessageAsync } = useSignMessage()
  const [notifyState, setNotifyState] = useState<NotifyState | null>(null)
  const [freqDraft, setFreqDraft]     = useState<EmailFrequency>('daily')
  const [eventsDraft, setEventsDraft] = useState<NotifyEvents>(() => notifyEventsOf(null))
  const [editEmail, setEditEmail]     = useState(false)
  const [emailInput, setEmailInput]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
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
        setEventsDraft(notifyEventsOf(data))
        setEditEmail(!data.email)
      })
      .catch(() => {})
  }, [address])

  const savedEmail   = notifyState?.email ?? null
  const savedFreq    = (notifyState?.frequency ?? 'daily') as EmailFrequency
  const emailChanged = editEmail && emailInput.trim().toLowerCase() !== (savedEmail ?? '')
  const freqChanged  = freqDraft !== savedFreq
  const savedEvents  = notifyEventsOf(notifyState)
  const eventsChanged = (Object.keys(savedEvents) as (keyof NotifyEvents)[]).some(k => savedEvents[k] !== eventsDraft[k])
  const isDirty      = emailChanged || freqChanged || eventsChanged
  const badEmail     = emailInput.trim() && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(emailInput.trim())

  const discard = () => {
    setFreqDraft(savedFreq)
    setEventsDraft(savedEvents)
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
      if (freqChanged || eventsChanged) {
        const ts2 = Math.floor(Date.now() / 1000)
        const sig2 = await signMessageAsync({ message: notifyPrefsMessage(CANONICAL_CHAIN_ID, address, freqDraft, eventsDraft, ts2) })
        const res2 = await fetch(`${MODERATION_API}/notify`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, frequency: freqDraft, events: eventsDraft, signature: sig2, timestamp: ts2 }),
        })
        const body2 = await res2.json().catch(() => null)
        if (!res2.ok) throw new Error(body2?.error ?? `HTTP ${res2.status}`)
        setNotifyState(prev => prev ? { ...prev, frequency: freqDraft, events: eventsDraft } : prev)
      }
      toast(emailChanged ? 'Saved · verification email sent' : 'Notification settings saved')
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
      toast('Verification email re-sent')
    } catch {
      // best effort: a rejected or failed resend leaves the Resend link to try again
    }
  }

  const ghostBtn: React.CSSProperties = { background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontFamily: SANS, color: TEXT2, cursor: 'pointer' }
  const off = freqDraft === 'off' || (!savedEmail && !editEmail)

  return (
    <div style={{ maxWidth: 760 }}>
      {showVerifyBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', background: `${GREEN}14`, border: `1px solid ${GREEN}33`, borderRadius: 10, marginBottom: 16 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span style={{ color: GREEN, fontSize: 13, fontWeight: 600 }}>Email verified! You&apos;ll now receive moderation alerts.</span>
        </div>
      )}

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
        <PanelHead label="Email Notifications" />

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
              { k: 'mod',    label: 'Moderation Activity',   sub: 'A new message is posted for you to moderate.' },
              { k: 'status', label: 'Message Status Change', sub: 'Your message starts or stops winning.' },
              { k: 'budget', label: 'Low Budget',            sub: 'Your streaming budget falls below 1 day remaining.' },
            ] as const).map((ev, i) => (
              <div key={ev.k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT2 }}>{ev.label}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{ev.sub}</div>
                </div>
                <SettingsSwitch on={eventsDraft[ev.k]} onChange={on => setEventsDraft(d => ({ ...d, [ev.k]: on }))} label={ev.label} />
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
          {badEmail && <span style={{ fontSize: 12.5, color: DANGER, marginRight: 'auto' }}>Enter a valid email</span>}
          {saveError && !badEmail && <span style={{ color: DANGER, fontSize: 12.5, marginRight: 'auto' }}>{saveError}</span>}
          {saving ? (
            <WalletPending label="Saving…" />
          ) : (
            <>
              {isDirty && (
                <button onClick={discard} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 13.5, fontFamily: SANS, cursor: 'pointer' }}>Discard</button>
              )}
              <button
                disabled={!isDirty || !!badEmail}
                onClick={save}
                className="acct-btn-lg"
                style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '0 18px', height: 38, fontFamily: SANS, fontWeight: 700, fontSize: 13.5, cursor: isDirty && !badEmail ? 'pointer' : 'not-allowed', opacity: isDirty && !badEmail ? 1 : 0.4, transition: 'opacity 150ms' }}
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

const ACTIVE_COLS = '180px 1fr 130px 160px 110px'

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
// Day-by-day history from /api/account/stats (lib/stats/daily.ts). History only starts when daily
// tracking did, so early on the chart shows the days it has, says when tracking began, and holds
// back the % change until there's a full previous period to compare against.
type ChartType  = 'bar' | 'line'
type ChartRange = 7 | 30 | 90

interface ChartMetric {
  label: string
  // All-time headline figure.
  value: string
  // Per-day amounts, aligned with the chart's days (oldest first). For a ratio metric, num/den per day.
  daily?: number[]
  ratio?: { num: number[]; den: number[]; per: number }
  // First day with real history, or null when there's none yet.
  since: string | null
  format: (v: number) => string
}

const RANGES: ChartRange[] = [7, 30, 90]

interface AccountStats {
  days: string[]
  creator: { views: number[]; raised: string[]; viewsSince: string | null; raisedSince: string | null }
  buyer: { views: number[]; spent: string[]; viewsSince: string | null; spentSince: string | null }
}

// A ratio needs both sides tracked.
function laterDay(a: string | null | undefined, b: string | null | undefined): string | null {
  return a && b ? (a > b ? a : b) : null
}
const MIN_SLOTS = 7

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function StatsChart({ metrics, days, loading }: { metrics: ChartMetric[]; days: string[]; loading: boolean }) {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [range, setRange]         = useState<ChartRange>(30)
  const [activeIdx, setActiveIdx] = useState(0)

  const W = 560, H = 160
  const PAD = { t: 10, b: 28, l: 52, r: 12 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const metric = metrics[activeIdx]
  const since = metric.since
  // Days of real history, counting today.
  const tracked = since ? days.filter(d => d >= since).length : 0
  const rangeOk = (r: ChartRange) => r === 7 || tracked > RANGES[RANGES.indexOf(r) - 1]
  const effRange = rangeOk(range) ? range : ([...RANGES].reverse().find(rangeOk) ?? 7)
  // Never fewer than a week of slots, so one or two days of data don't stretch into giant bars.
  const nSlots = Math.min(days.length, Math.max(MIN_SLOTS, Math.min(effRange, tracked || MIN_SLOTS)))
  const slotDays = days.slice(-nSlots)
  const firstTracked = since ? slotDays.findIndex(d => d >= since) : -1
  const hasData = firstTracked !== -1

  const valueAt = (m: ChartMetric, i: number): number | null => {
    if (m.ratio) return m.ratio.den[i] > 0 ? m.ratio.num[i] / m.ratio.den[i] * m.ratio.per : null
    return m.daily?.[i] ?? 0
  }
  const offset = days.length - nSlots
  const series = slotDays.map((d, i) => (hasData && i >= firstTracked ? valueAt(metric, offset + i) : null))
  const cumulative = (() => {
    let num = 0, den = 0
    return slotDays.map((_, i) => {
      if (!hasData || i < firstTracked) return null
      if (metric.ratio) {
        num += metric.ratio.num[offset + i]; den += metric.ratio.den[offset + i]
        return den > 0 ? num / den * metric.ratio.per : null
      }
      num += metric.daily?.[offset + i] ?? 0
      return num
    })
  })()
  const shown = chartType === 'line' ? cumulative : series
  const dMax = Math.max(0, ...shown.map(v => v ?? 0))
  const scaleMax = dMax || 1

  // % change against the previous period of the same length, only once both periods are fully tracked.
  const deltaFor = (m: ChartMetric): number | null => {
    if (!m.since || days.length < effRange * 2) return null
    const prevStart = days[days.length - effRange * 2]
    if (prevStart < m.since) return null
    const total = (from: number, to: number) => {
      if (m.ratio) {
        let num = 0, den = 0
        for (let i = from; i < to; i++) { num += m.ratio.num[i]; den += m.ratio.den[i] }
        return den > 0 ? num / den : null
      }
      let sum = 0
      for (let i = from; i < to; i++) sum += m.daily?.[i] ?? 0
      return sum
    }
    const cur = total(days.length - effRange, days.length)
    const prev = total(days.length - effRange * 2, days.length - effRange)
    if (cur === null || prev === null || prev === 0) return null
    return (cur - prev) / prev * 100
  }

  const slotW = innerW / nSlots
  const barW  = Math.min(28, Math.max(2, slotW * 0.65))
  const xMid  = (i: number) => PAD.l + slotW * i + slotW / 2
  const yOf   = (v: number) => PAD.t + innerH - (v / scaleMax) * innerH

  const linePts = shown.map((v, i) => v === null ? null : [xMid(i), yOf(v)] as [number, number]).filter((p): p is [number, number] => p !== null)
  let linePath = ''
  if (linePts.length >= 2) {
    linePath = `M ${linePts[0][0].toFixed(1)} ${linePts[0][1].toFixed(1)}`
    for (let i = 1; i < linePts.length; i++) {
      const cpx = ((linePts[i - 1][0] + linePts[i][0]) / 2).toFixed(1)
      linePath += ` C ${cpx} ${linePts[i - 1][1].toFixed(1)}, ${cpx} ${linePts[i][1].toFixed(1)}, ${linePts[i][0].toFixed(1)} ${linePts[i][1].toFixed(1)}`
    }
  }
  const areaPath = linePts.length >= 2
    ? `${linePath} L ${linePts[linePts.length - 1][0].toFixed(1)} ${(PAD.t + innerH).toFixed(1)} L ${linePts[0][0].toFixed(1)} ${(PAD.t + innerH).toFixed(1)} Z`
    : ''
  const gradId = `areaGrad-${metric.label.replace(/\W/g, '')}`
  const yTick1 = PAD.t + innerH * 0.33
  const yTick2 = PAD.t + innerH * 0.67
  // Untracked days on the left are shaded and labelled rather than drawn as zeros.
  const untrackedW = hasData ? slotW * firstTracked : innerW

  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px 16px', marginBottom: 24 }}>
      {/* Stat header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const }}>
        {metrics.map((m, i) => {
          const on = i === activeIdx
          const delta = loading ? null : deltaFor(m)
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
                {delta !== null && (
                  <span title={`vs the previous ${effRange} days`} style={{ fontFamily: MONO, fontSize: 10.5, color: delta >= 0 ? GREEN : DANGER }}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
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
                title={t === 'bar' ? 'Daily' : 'Running total'}
                style={{ padding: '5px 9px', background: chartType === t ? `${LAVENDER}28` : 'transparent', border: 'none', cursor: 'pointer', color: chartType === t ? LAVENDER : MUTED, display: 'flex', alignItems: 'center' }}
              >
                {t === 'bar'
                  ? <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><rect x="0" y="6" width="3" height="7" rx="1"/><rect x="5" y="3" width="3" height="10" rx="1"/><rect x="10" y="0" width="3" height="13" rx="1"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="0,10 3,6 6.5,8 10,3 13,1"/></svg>
                }
              </button>
            ))}
          </div>
          {/* range buttons: a range opens up once there's more history than the one below it */}
          <div style={{ display: 'flex', background: BG, border: `1px solid ${BORDER}`, borderRadius: 7, overflow: 'hidden' }}>
            {RANGES.map(r => {
              const ok = rangeOk(r)
              const on = effRange === r
              return (
                <button
                  key={r}
                  disabled={!ok}
                  onClick={() => setRange(r)}
                  title={ok ? undefined : 'Available once there is more history'}
                  style={{ padding: '4px 10px', background: on ? LAVENDER : 'transparent', border: 'none', cursor: ok ? 'pointer' : 'default', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: on ? BG : MUTED, opacity: ok ? 1 : 0.4 }}
                >
                  {r}d
                </button>
              )
            })}
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

        {/* Y-axis labels, only once there's something to scale against */}
        {dMax > 0 && <>
          <text x={PAD.l - 5} y={yTick1} textAnchor="end" dominantBaseline="middle" fill={MUTED} fontSize="9" fontFamily="JetBrains Mono,monospace">{metric.format(dMax * 0.67)}</text>
          <text x={PAD.l - 5} y={yTick2} textAnchor="end" dominantBaseline="middle" fill={MUTED} fontSize="9" fontFamily="JetBrains Mono,monospace">{metric.format(dMax * 0.33)}</text>
        </>}

        {/* Days before tracking began */}
        {!loading && untrackedW > 0 && (
          <>
            <rect x={PAD.l} y={PAD.t} width={untrackedW} height={innerH} fill="rgba(138,143,191,0.05)" />
            {untrackedW > 90 && (
              <text x={PAD.l + untrackedW / 2} y={PAD.t + innerH / 2} textAnchor="middle" dominantBaseline="middle" fill={MUTED} fontSize="9.5" fontFamily="JetBrains Mono,monospace">
                {hasData ? `Tracking began ${shortDay(since!)}` : 'Daily history starts today'}
              </text>
            )}
          </>
        )}
        {!loading && hasData && dMax === 0 && (
          <text x={PAD.l + untrackedW + (innerW - untrackedW) / 2} y={PAD.t + innerH / 2} textAnchor="middle" dominantBaseline="middle" fill={MUTED} fontSize="9.5" fontFamily="JetBrains Mono,monospace">
            Nothing yet in this period
          </text>
        )}

        {/* Chart body */}
        {!loading && (chartType === 'bar'
          ? series.map((v, i) => {
              if (v === null || v <= 0) return null
              const y = yOf(v)
              return (
                <rect key={slotDays[i]} x={(xMid(i) - barW / 2).toFixed(1)} y={y.toFixed(1)} width={barW} height={(PAD.t + innerH - y).toFixed(1)} rx="2" fill={LAVENDER} opacity="0.72">
                  <title>{`${shortDay(slotDays[i])}: ${metric.format(v)}`}</title>
                </rect>
              )
            })
          : linePts.length >= 2
            ? <>
                <path d={areaPath} fill={`url(#${gradId})`}/>
                <path d={linePath} fill="none" stroke={PINK} strokeWidth="1.8" strokeLinejoin="round"/>
              </>
            : linePts.map(([x, y]) => <circle key={x} cx={x} cy={y} r="3" fill={PINK} />)
        )}

        {/* X-axis labels */}
        <text x={PAD.l + innerW / 2} y={H - 3} textAnchor="middle" fill={MUTED} fontSize="8.5" fontFamily="JetBrains Mono,monospace">
          {chartType === 'bar' ? 'Daily' : metric.ratio ? 'Over the period' : 'Running total'}
        </text>
        <text x={PAD.l} y={H - 3} textAnchor="start" fill={MUTED} fontSize="8.5" fontFamily="JetBrains Mono,monospace">{slotDays[0] ? shortDay(slotDays[0]) : ''}</text>
        <text x={PAD.l + innerW} y={H - 3} textAnchor="end"  fill={MUTED} fontSize="8.5" fontFamily="JetBrains Mono,monospace">Today</text>
      </svg>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountPage() {
  return (
    <ToastProvider>
      <AccountDashboard />
    </ToastProvider>
  )
}

function AccountDashboard() {
  const { activeAddress, hasWallet } = useActiveWallet()
  const ethPrice = useEthPrice()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [streamBalanceKey, setStreamBalanceKey] = useState(0)
  const { snapshot: streamSnapshot, failed: streamFailed } = useStreamSnapshot(activeAddress, streamBalanceKey)
  const [activity, setActivity] = useState<{ wallet: string; events: ActivityEvent[]; failed: boolean } | null>(null)
  const [activityKey, setActivityKey] = useState(0)
  const lowRunway = useMemo(() => {
    const rate = winningRate(streamSnapshot)
    if (!streamSnapshot || rate === 0n) return null
    const runway = runwaySeconds(BigInt(streamSnapshot.ethxBalanceRaw), rate)
    return runwayTier(runway) === 'normal' ? null : runway
  }, [streamSnapshot])
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
  const [section, setSectionState]            = useState<SectionId>('feed')
  // The section lives in ?section= so a reload or shared link opens the same one.
  const setSection = useCallback((next: SectionId) => {
    setSectionState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('section', next)
    window.history.replaceState(null, '', url.toString())
  }, [])
  const [archived, setArchived]               = useState<string[]>([])
  const [manageTarget, setManageTarget]       = useState<string | null>(null)
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
          markeeRateRaw: m.markeeRateRaw,
          winningSince: m.winningSince ?? null,
          wonSeconds: m.wonSeconds ?? null,
          topRateRaw: m.topRateRaw ?? '0',
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

  // Each owned board's current #1, so queue rows can say whether a message is live on the sign.
  const liveMarkees = useMemo(() => new Set(allBoards.flatMap(lb => lb.topMarkeeAddress ? [lb.topMarkeeAddress.toLowerCase()] : [])), [allBoards])
  const manageBoard = useMemo(() => allBoards.find(lb => lb.address === manageTarget) ?? null, [allBoards, manageTarget])

  const awaitingSiteBoards = useMemo(() =>
    awaitingVerification.filter(lb => !archived.includes(lb.address)), [awaitingVerification, archived])

  const sortedActiveBoards = useMemo(() =>
    [...activeBoards].sort((a, b) => compareByRaised(b, a)), [activeBoards])

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
    if (raw && map[raw]) setSectionState(map[raw])
    if (params.get('verifyOk') === '1') setVerifyOk(true)
    const clean = new URL(window.location.href)
    if (raw && map[raw]) clean.searchParams.set('section', map[raw])
    else clean.searchParams.delete('section')
    clean.searchParams.delete('tab')
    clean.searchParams.delete('verifyOk')
    clean.searchParams.delete('verifyError')
    window.history.replaceState(null, '', clean.toString())
  }, [])

  const totalRaisedWei = useMemo(() => allBoards.reduce((s, lb) => s + BigInt(lb.totalFundsRaw), 0n), [allBoards])
  const totalContribWei = useMemo(() => {
    const bought = myMessages.reduce((s, m) => s + m.totalFundsAdded, 0n)
    const funded = fundedMessages.reduce((s, m) => s + BigInt(m.totalContributed), 0n)
    return bought + funded
  }, [myMessages, fundedMessages])

  // Fetch markee.xyz view counts for CPM calculations, per board by the shared rule (lib/views/boards.ts:
  // board key + its top message's key). Includes the boards the wallet's messages sit on, not just its
  // own -- buyer views/CPM read from here too.
  const viewAddrs = useMemo(() => [...new Set([
    ...allBoards.map(b => b.address.toLowerCase()),
    ...myMessages.map(m => m.strategyId.toLowerCase()),
    ...fundedMessages.map(m => m.strategyId.toLowerCase()),
  ])].filter(Boolean).slice(0, 100).join(','), [allBoards, myMessages, fundedMessages])
  useEffect(() => {
    if (!viewAddrs) return
    fetch(`/api/views?boards=${viewAddrs}`)
      .then(r => r.json())
      .then((data: Record<string, { totalViews: number }>) => {
        setBoardViews(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.totalViews ?? 0])))
      })
      .catch(() => {})
  }, [viewAddrs])

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

  // Day-by-day history for the hub charts. Creator: the wallet's live boards. Buyer: the boards its
  // own messages are on (the same sets the headline Views figures use).
  const [stats, setStats] = useState<AccountStats | null>(null)
  const statsCreator = useMemo(() => activeBoards.map(b => b.address.toLowerCase()).slice(0, 100), [activeBoards])
  const statsBuyer = useMemo(() => [...new Set(myMessages.map(m => m.strategyId.toLowerCase()))].slice(0, 100), [myMessages])
  const statsKey = `${activeAddress ?? ''}|${fingerprintAddresses(statsCreator)}|${fingerprintAddresses(statsBuyer)}`
  useEffect(() => {
    if (!activeAddress || isLoading || isLoadingMessages) return
    let cancelled = false
    fetch(`/api/account/stats?${new URLSearchParams({ wallet: activeAddress, creator: statsCreator.join(','), buyer: statsBuyer.join(','), days: '90' })}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<AccountStats> : null)
      .then(d => { if (!cancelled) setStats(d) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsKey, isLoading, isLoadingMessages])
  const weiToChart = (w: string) => Number(BigInt(w)) / 1e18 * (ethPrice ?? 0)

  useEffect(() => {
    if (!activeAddress || section !== 'feed') return
    const wallet = activeAddress.toLowerCase()
    let cancelled = false
    fetch(`/api/account/activity?wallet=${wallet}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setActivity({ wallet, events: d.events ?? [], failed: false }) })
      .catch(() => { if (!cancelled) setActivity({ wallet, events: [], failed: true }) })
    return () => { cancelled = true }
  }, [activeAddress, section, activityKey])

  const boardNames = useMemo(() => {
    const names = new Map<string, string>()
    myMessages.forEach(m => m.strategyName && names.set(m.strategyId.toLowerCase(), m.strategyName))
    fundedMessages.forEach(m => m.strategyName && names.set(m.strategyId.toLowerCase(), m.strategyName))
    allBoards.forEach(lb => lb.name && names.set(lb.address.toLowerCase(), lb.name))
    return names
  }, [allBoards, myMessages, fundedMessages])

  const ownMessage = useCallback((markee: string) => myMessages.find(m => m.address.toLowerCase() === markee), [myMessages])

  // The board's own buy modal, the same one its marketplace price button opens.
  const openBoardBuy = useCallback((m: MyMessage | FundedMessage) => setPriceButtonTarget({
    address: m.strategyId, name: m.strategyName, strategy: m.strategy ?? 'fixed',
    platform: (m as MyMessage).isLegacy ? 'website' : (m.platform ?? 'website'),
    isLegacy: !!(m as MyMessage).isLegacy,
  } as AnyLeaderboard), [])

  const handleActivate = useCallback((lb: AnyLeaderboard) => {
    if (lb.strategy === 'streaming') setActivateStreamBoard(lb)
    else setActivateTarget(lb)
  }, [])

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
          background: `radial-gradient(ellipse 55% 100% at 18% 0%, rgba(123,106,244,0.12), transparent 65%), ${HERO_BG}`,
        }}
      >
        <div className="relative z-10" style={{ maxWidth: 1240, margin: '0 auto', padding: '36px 32px 30px' }}>
          {/* wallet header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ width: 48, height: 48, borderRadius: 13, background: BG, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: TEXT, letterSpacing: -0.6 }}>My Dashboard</h1>
              {mounted && (activeAddress
                ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 0' }}>
                    <span style={{ color: TEXT2, fontSize: 13, fontFamily: MONO }}>{fmtAddr(activeAddress)}</span>
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
                <Link
                  href="/create-a-markee"
                  className="acct-btn-lg"
                  style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 8, padding: '0 16px', height: 38, display: 'inline-flex', alignItems: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'background 120ms' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${PINK}18` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  Create New Markee
                </Link>
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
      <div style={{ flex: 1, maxWidth: 1240, width: '100%', margin: '0 auto', padding: '28px 32px 80px', boxSizing: 'border-box' }}>
        {mounted && hasWallet ? (
          <div className="acct-layout">
            <SidebarNav
              section={section}
              setSection={setSection}
              attentionCount={(isModerator ? moderationQueue.items.length : 0) + draftBoards.length + (lowRunway != null ? 1 : 0)}
            />

            <main style={{ flex: 1, minWidth: 0 }}>
              {/* ── Activity Feed ── */}
              {section === 'feed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                  <NeedsAttention
                    modLoading={moderationQueue.isLoading}
                    modItems={isModerator ? moderationQueue.items : []}
                    modBoards={moderationQueue.boards}
                    liveMarkees={liveMarkees}
                    onReview={moderationQueue.review}
                    onOpenQueue={() => setSection('creator')}
                    markeesLoading={isLoading}
                    inactive={inactiveBoards}
                    awaiting={awaitingSiteBoards}
                    ethPrice={ethPrice}
                    onActivate={handleActivate}
                    onArchive={lb => setArchived(prev => [...prev, lb.address])}
                    onAddToSite={handleOpenAddToSite}
                    lowRunway={lowRunway}
                    onDeposit={() => setSection('buyer')}
                  />
                  <LatestActivity
                    events={activity?.wallet === activeAddress?.toLowerCase() ? activity!.events : []}
                    state={activity?.wallet !== activeAddress?.toLowerCase() ? 'loading' : activity!.failed ? 'failed' : 'ready'}
                    onRetry={() => { setActivity(null); setActivityKey(k => k + 1) }}
                    boardName={b => boardNames.get(b) ?? fmtAddr(b)}
                    ethPrice={ethPrice}
                    priceLabel={markee => {
                      const m = ownMessage(markee)
                      return m && !m.isTop ? winPrice(m, ethPrice) : null
                    }}
                    onPrice={markee => { const m = ownMessage(markee); if (m) openBoardBuy(m) }}
                    onOpen={e => {
                      if (e.side === 'buy') { setSection('buyer'); return }
                      const lb = allBoards.find(b => b.address.toLowerCase() === e.board)
                      if (lb) { setSection('creator'); setManageTarget(lb.address) }
                      else window.location.href = `/markee/${e.board}`
                    }}
                  />
                </div>
              )}

              {/* ── Creator Hub ── */}
              {section === 'creator' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                  <StatsChart
                    days={stats?.days ?? []}
                    loading={!stats}
                    metrics={[
                      { label: 'Revenue', value: ethPrice && !isLoading ? formatUsd(Number(totalRaisedWei) / 1e18 * ethPrice) : '-', daily: stats?.creator.raised.map(weiToChart), since: stats?.creator.raisedSince ?? null, format: formatUsd },
                      { label: 'Views', value: !isLoading ? activeBoards.reduce((s, lb) => s + (boardViews[lb.address.toLowerCase()] ?? 0), 0).toLocaleString() : '-', daily: stats?.creator.views, since: stats?.creator.viewsSince ?? null, format: v => Math.round(v).toLocaleString() },
                      { label: 'Earned per 1k Views', value: creatorCpm ? `$${creatorCpm.toFixed(2)}` : '-', ratio: stats ? { num: stats.creator.raised.map(weiToChart), den: stats.creator.views, per: 1000 } : undefined, since: laterDay(stats?.creator.raisedSince, stats?.creator.viewsSince), format: v => `$${v.toFixed(2)}` },
                    ]}
                  />
                  <YourMarkees
                    active={sortedActiveBoards}
                    archived={archivedBoards}
                    inactive={inactiveBoards}
                    awaiting={awaitingSiteBoards}
                    loading={isLoading}
                    boardViews={boardViews}
                    ethPrice={ethPrice}
                    selected={manageTarget}
                    onManage={lb => setManageTarget(lb.address)}
                    onActivate={handleActivate}
                    onArchive={lb => setArchived(prev => [...prev, lb.address])}
                    onRestore={lb => setArchived(prev => prev.filter(a => a !== lb.address))}
                    onAddToSite={handleOpenAddToSite}
                  />

                  {/* Moderation */}
                  {isModerator && <ModerationQueue liveMarkees={liveMarkees} />}
                </div>
              )}

              {/* ── Buyer Hub ── */}
              {section === 'buyer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                  <StatsChart
                    days={stats?.days ?? []}
                    loading={!stats}
                    metrics={[
                      { label: 'Spent', value: ethPrice && !isLoadingMessages ? formatUsd(Number(totalContribWei) / 1e18 * ethPrice) : '-', daily: stats?.buyer.spent.map(weiToChart), since: stats?.buyer.spentSince ?? null, format: formatUsd },
                      { label: 'Views', value: !isLoadingMessages ? [...new Set(myMessages.map(m => m.strategyId.toLowerCase()))].reduce((s, addr) => s + (boardViews[addr] ?? 0), 0).toLocaleString() : '-', daily: stats?.buyer.views, since: stats?.buyer.viewsSince ?? null, format: v => Math.round(v).toLocaleString() },
                      { label: 'Cost per 1k Views', value: buyerCpm ? `$${buyerCpm.toFixed(2)}` : '-', ratio: stats ? { num: stats.buyer.spent.map(weiToChart), den: stats.buyer.views, per: 1000 } : undefined, since: laterDay(stats?.buyer.spentSince, stats?.buyer.viewsSince), format: v => `$${v.toFixed(2)}` },
                    ]}
                  />
                  <StreamBalanceCard
                    snapshot={streamSnapshot}
                    failed={streamFailed}
                    ethPrice={ethPrice}
                    onRetry={() => setStreamBalanceKey(k => k + 1)}
                    onChanged={() => setStreamBalanceKey(k => k + 1)}
                  />

                  {isLoadingMessages || isLoadingFunded || myMessages.length > 0 || fundedMessages.length > 0 ? (
                    <YourMessages
                      owner={activeAddress}
                      bought={myMessages}
                      funded={fundedMessages}
                      loading={isLoadingMessages || isLoadingFunded}
                      boardViews={boardViews}
                      ethPrice={ethPrice}
                      onEditStreaming={handleEditMessage}
                      onChangeBid={m => setStreamEditTarget(m)}
                      onEdited={() => activeAddress && fetchMyMessages(activeAddress)}
                      onPriceButton={openBoardBuy}
                      onAddFunds={(m, own) => setAddFundsTarget(own
                        ? { strategy: m.strategy ?? 'fixed', strategyId: m.strategyId, markeeAddress: m.address, message: m.message, totalFundsAdded: (m as MyMessage).totalFundsAdded, topFunds: (m as MyMessage).topFunds, name: m.name, isLegacy: (m as MyMessage).isLegacy }
                        : { strategy: m.strategy ?? 'fixed', strategyId: m.strategyId, markeeAddress: m.address, message: m.message, totalFundsAdded: BigInt((m as FundedMessage).totalContributed), topFunds: BigInt((m as FundedMessage).topFundsRaw), name: m.name })}
                    />
                  ) : (
                    <Empty icon="💬" title="No messages bought yet" body="Buy a message on any Markee in the network to get your words in front of an audience." ctaLabel="Browse the Marketplace →" ctaHref="/marketplace" />
                  )}
                  <BestBuys ethPrice={ethPrice} />
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
          onSuccess={() => { if (activeAddress) { fetchAll(activeAddress); fetchMyMessages(activeAddress); fetchFundedMessages(activeAddress) } }}
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

      {manageBoard && (
        <ManageDrawer
          lb={manageBoard}
          views={boardViews[manageBoard.address.toLowerCase()] ?? 0}
          ethPrice={ethPrice}
          activeAddress={activeAddress}
          onClose={() => setManageTarget(null)}
          onAddToSite={() => handleOpenAddToSite(manageBoard)}
          onSuccess={() => activeAddress && fetchAll(activeAddress)}
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

    </div>
  )
}
