'use client'

// Right-side Manage drawer for one of the wallet's Markees: Integrated Sites, per-board Moderators,
// Markee Settings (contract setters) and Transfer Admin.

import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import type { Abi } from 'viem'
import { ArrowUpRight, ExternalLink, Eye, Info, Link2 } from 'lucide-react'
import { StrategyBadge } from '@/components/StrategyBadge'
import { AdminSettingRow } from '@/components/leaderboard/AdminSettingRow'
import { BoardModerators } from '@/components/moderation'
import { LeaderboardV11ABI, StreamingLeaderboardABI, TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { metaUpdateMessage } from '@/lib/openinternet/meta'
import { unlinkFileMessage } from '@/lib/github/unlink'
import { MONO, PINK, BG, BG2, TEXT, TEXT2, MUTED, BORDER, SANS, DANGER } from '@/lib/design-tokens'
import type { AnyLeaderboard, BaseLeaderboard, WebsiteLeaderboard } from '@/components/account/types'
import { SECONDS_PER_MONTH, WalletPending, fmtAddr, fmtCount, isUserRejection } from '@/components/account/primitives'
import { integrationsOf, type Integration } from '@/components/account/sites'
import { useToast } from '@/components/account/Toast'

const ghostBtn: React.CSSProperties = { background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 14px', height: 38, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }
const pinkOutline: React.CSSProperties = { ...ghostBtn, color: PINK, border: `1px solid ${PINK}`, fontWeight: 700 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', color: TEXT, fontSize: 13.5, outline: 'none', fontFamily: MONO }

function DrawerSection({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '22px 28px 24px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{title}</div>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.5, maxWidth: '52ch' }}>{sub}</p>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  )
}

function FeaturedTag() {
  const [open, setOpen] = useState(false)
  const tip = "This integration is displayed in the Marketplace and on the Markee's public page."
  return (
    <span
      tabIndex={0}
      aria-label={`Featured: ${tip}`}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 10, color: PINK, letterSpacing: 0.8, textTransform: 'uppercase', border: '1px solid rgba(248,151,254,0.45)', borderRadius: 99, padding: '2px 8px', cursor: 'default', outline: 'none' }}
    >
      Featured <Info size={10} />
      {open && (
        <span role="tooltip" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 20, width: 230, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: TEXT2, lineHeight: 1.45, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          {tip}
        </span>
      )}
    </span>
  )
}

function IntegrationRow({ board, it, featured, views, canEdit, onChanged }: { board: string; it: Integration; featured: boolean; views: number | null; canEdit: boolean; onChanged: () => void }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'removing' | 'verifying'>('idle')
  const [error, setError] = useState<string | null>(null)
  const { signMessageAsync } = useSignMessage()
  const { address } = useAccount()
  const toast = useToast()
  const verifiedFile = !!it.file?.verified
  const unverifiedFile = !!it.file && !it.file.verified

  const remove = async () => {
    setState('removing')
    setError(null)
    try {
      const res = it.file
        ? await (async (file) => {
            const timestamp = Math.floor(Date.now() / 1000)
            const signature = await signMessageAsync({ message: unlinkFileMessage(CANONICAL_CHAIN_ID, board, file.repoFullName, file.filePath, timestamp) })
            return fetch(`/api/github/unlink-markee-file?${new URLSearchParams({ address: board, repo: file.repoFullName, file: file.filePath })}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ owner: address, signature, timestamp }),
            })
          })(it.file)
        : await (async () => {
            const timestamp = Math.floor(Date.now() / 1000)
            const signature = await signMessageAsync({ message: metaUpdateMessage(CANONICAL_CHAIN_ID, board, { removeVerifiedUrl: it.url }, timestamp) })
            return fetch('/api/openinternet/meta', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ leaderboardAddress: board, removeVerifiedUrl: it.url, owner: address, signature, timestamp }),
            })
          })()
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
      toast('Site removed')
      onChanged()
    } catch (e) {
      if (!isUserRejection(e)) setError(e instanceof Error && e.message ? e.message : 'Could not remove this integration.')
      setState('idle')
    }
  }

  const verify = async () => {
    if (!it.file) return
    setState('verifying')
    setError(null)
    try {
      const res = await fetch('/api/github/verify-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: board, repoFullName: it.file.repoFullName, filePath: it.file.filePath }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      if (body?.verified) { toast('Site verified'); onChanged() }
      else setError('The Markee markers are not in this file yet. Add them, then verify again.')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not verify this file.')
    } finally {
      setState('idle')
    }
  }

  const textBtn = (color: string): React.CSSProperties => ({ background: 'transparent', border: 'none', color, cursor: 'pointer', fontSize: 12.5, fontFamily: SANS, padding: '2px 0 2px 4px' })

  return (
    <div style={{ borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 10px', margin: '0 -10px', borderRadius: featured ? 8 : 0, background: featured ? 'rgba(248,151,254,0.06)' : 'transparent' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span title={it.label} style={{ minWidth: 0, fontFamily: MONO, fontSize: 12.5, color: unverifiedFile ? MUTED : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <a href={it.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${it.label}`} title="Open embed location" style={{ flexShrink: 0, display: 'inline-flex', color: MUTED }}>
            <Link2 size={13} />
          </a>
        </span>
        {featured && !unverifiedFile && <FeaturedTag />}
        {unverifiedFile && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED, border: '1px solid rgba(138,143,191,0.35)', borderRadius: 99, padding: '1px 7px' }}>Not verified</span>}
        {views != null && (
          <span title="Views" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 12, color: TEXT2, whiteSpace: 'nowrap' }}>
            <Eye size={13} style={{ color: MUTED }} aria-label="views" />{fmtCount(views)}
          </span>
        )}
        {canEdit && (
          state === 'removing' ? <WalletPending label={it.file ? 'Removing…' : 'Confirm in wallet…'} />
          : state === 'verifying' ? <WalletPending label="Checking…" />
          : state === 'confirm' ? (
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setState('idle')} style={textBtn(TEXT2)}>Cancel</button>
              <button onClick={remove} style={{ background: 'transparent', border: `1px solid ${DANGER}`, borderRadius: 7, color: DANGER, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: SANS, padding: '0 10px', height: 28 }}>Remove</button>
            </span>
          ) : (
            <>
              {unverifiedFile && <button onClick={verify} style={textBtn(PINK)}>Verify</button>}
              <button
                onClick={() => verifiedFile ? setError('Remove the Markee markers from this file first, then it can be unlinked.') : setState('confirm')}
                style={textBtn(verifiedFile ? MUTED : DANGER)}
              >
                Remove
              </button>
            </>
          )
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: verifiedFile ? MUTED : DANGER, padding: '0 0 10px' }}>{error}</div>}
    </div>
  )
}

// Website integrations verify by fetching the page and finding the embed's data-markee-address.
function VerifyUrl({ board, onVerified, onCancel }: { board: string; onVerified: () => void; onCancel: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const normalized = url.trim() && !/^https?:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url.trim()

  const verify = async () => {
    if (!normalized) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/openinternet/verify-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: board, url: normalized }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.verified) throw new Error(body?.error ?? 'Could not verify this site.')
      toast('Site verified and added')
      onVerified()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify this site.')
      setBusy(false)
    }
  }

  return (
    <div style={{ paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          autoFocus
          disabled={busy}
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && normalized) verify() }}
          placeholder="site.com/page"
          style={inputStyle}
        />
        {busy ? <WalletPending label="Checking…" /> : (
          <>
            <button onClick={onCancel} style={{ ...ghostBtn, border: 'none', padding: '0 6px', height: 32 }}>Cancel</button>
            <button disabled={!normalized} onClick={verify} style={{ ...ghostBtn, height: 32, padding: '0 12px', opacity: normalized ? 1 : 0.4, cursor: normalized ? 'pointer' : 'not-allowed' }}>Verify</button>
          </>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: DANGER, marginTop: 8, lineHeight: 1.45 }}>{error}</div>}
    </div>
  )
}

export function ManageDrawer({ lb, views, ethPrice, activeAddress, onClose, onAddToSite, onSuccess }: {
  lb: AnyLeaderboard
  views: number
  ethPrice: number | null
  activeAddress: string | undefined
  onClose: () => void
  onAddToSite: () => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const me = activeAddress?.toLowerCase()
  const isAdmin = !!me && !!lb.admin && lb.admin.toLowerCase() === me
  const isOwner = isAdmin || (!!me && (lb.creator ?? '').toLowerCase() === me)
  const isStreaming = lb.strategy === 'streaming'
  // Legacy is a website-only historical concept (pre-migration TopDawg boards) -- github/superfluid/
  // streaming-platform listing routes never set it, so every board on those platforms already uses
  // the modern ABI with the setters below. Only a website-platform board can genuinely be legacy.
  const isLegacyFixed = !isStreaming && lb.platform === 'website' && (lb as WebsiteLeaderboard).isLegacy === true
  const contractAddress = lb.address as `0x${string}`
  const integrations = integrationsOf(lb)
  const urls = integrations.flatMap(i => i.url ? [i.url] : [])
  const [urlViews, setUrlViews] = useState<Record<string, number>>({})
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const urlsKey = urls.join('||')
  useEffect(() => {
    if (!urlsKey) return
    fetch(`/api/views?address=${lb.address}&urls=${urlsKey.split('||').map(encodeURIComponent).join('||')}`)
      .then(r => r.ok ? r.json() : {})
      .then(setUrlViews)
      .catch(() => {})
  }, [lb.address, urlsKey])

  const settings = isStreaming
    ? { abi: StreamingLeaderboardABI, minPrice: 'minimumMonthlyRate', setMinPrice: 'setMinimumMonthlyRate', unit: 'ethPerMonth' as const, setAdmin: 'setAdmin', limits: true }
    : (lb as BaseLeaderboard).verificationGated
      // For Sale boards are v1.3 Leaderboard clones: the partner-strategy ABI covers their setters except
      // the admin one, which is setAdmin there (setAdminAddress only exists on the old partner strategy).
      ? { abi: TopDawgPartnerStrategyABI, minPrice: 'minimumPrice', setMinPrice: 'setMinimumPrice', unit: 'eth' as const, setAdmin: 'setAdmin', adminAbi: LeaderboardV11ABI, limits: true }
      : { abi: LeaderboardV11ABI, minPrice: null, setMinPrice: null, unit: 'eth' as const, setAdmin: 'setAdmin', limits: false }
  const abi = settings.abi as unknown as Abi
  const adminAbi = ('adminAbi' in settings ? settings.adminAbi : settings.abi) as unknown as Abi
  const saved = (message: string) => () => { toast(message); onSuccess() }

  // A Rent minimum far above what the current renter streams is almost always a units mistake.
  const currentMonthly = isStreaming && lb.topRateRaw ? BigInt(lb.topRateRaw) * SECONDS_PER_MONTH : 0n
  const minPriceWarning = (minimum: bigint) => {
    if (currentMonthly === 0n || minimum <= currentMonthly * 100n) return null
    const eth = (Number(currentMonthly) / 1e18).toFixed(4).replace(/\.?0+$/, '')
    return `Far above what the current renter streams (${eth} ETH/mo). Check the value.`
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(6,10,42,0.6)', backdropFilter: 'blur(3px)', animation: 'fadeIn 160ms ease' }}>
      <aside
        role="dialog"
        aria-label={`Manage ${lb.name || 'Markee'}`}
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(580px, 100%)', background: BG2, borderLeft: `1px solid ${BORDER}`, boxShadow: '-24px 0 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', animation: 'drawerIn 220ms cubic-bezier(.2,.8,.2,1)', fontFamily: SANS }}
      >
        <div style={{ padding: '22px 28px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 18, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap' }}>Markee {fmtAddr(lb.address)}</h2>
              <a href={`https://basescan.org/address/${lb.address}`} target="_blank" rel="noopener noreferrer" aria-label="View contract on Basescan" title="View contract on Basescan" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: `1px solid ${BORDER}`, color: TEXT2 }}>
                <ExternalLink size={13} />
              </a>
              <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="xs" />
            </div>
            <a href={`/markee/${lb.address}`} style={{ ...pinkOutline, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, height: 32, padding: '0 12px', fontSize: 12.5, textDecoration: 'none' }}>
              View Markee <ArrowUpRight size={11} />
            </a>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, width: 34, height: 34, color: TEXT2, fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DrawerSection title="Integrated Sites">
            {integrations.length === 0 && <div style={{ fontSize: 13, color: MUTED, padding: '12px 0', borderTop: `1px solid ${BORDER}` }}>Not on any site yet.</div>}
            {integrations.map((it, i) => (
              <IntegrationRow
                key={it.key}
                board={lb.address}
                it={it}
                featured={i === 0}
                views={it.url ? (urlViews[it.url] ?? null) : integrations.length === 1 ? views : null}
                canEdit={isOwner}
                onChanged={onSuccess}
              />
            ))}
            {verifying && <VerifyUrl board={lb.address} onCancel={() => setVerifying(false)} onVerified={() => { setVerifying(false); onSuccess() }} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={onAddToSite} style={pinkOutline}>Add to Your Site</button>
              {isOwner && !verifying && <button onClick={() => setVerifying(true)} style={ghostBtn}>Verify New Integration</button>}
            </div>
          </DrawerSection>

          {/* Per-board moderators, managed by the board's owners (admin or creator) -- kept separate from
              lib/moderation/config.ts's global admins, whose flags only apply on markee.xyz. Legacy
              boards aren't scanned for the queue, so there is nothing for moderators to review there. */}
          {!isLegacyFixed && (
            <DrawerSection title="Moderators" sub="These addresses can hide messages on this Markee.">
              <BoardModerators board={lb.address} />
            </DrawerSection>
          )}

          <DrawerSection title="Markee Settings">
            {!isAdmin ? (
              <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Only this Markee&apos;s admin wallet can change these.</p>
            ) : isLegacyFixed ? (
              <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Admin settings aren&apos;t available for legacy boards from this dashboard.</p>
            ) : (
              <>
                {settings.minPrice && settings.setMinPrice && (
                  <AdminSettingRow
                    label="Minimum Price" contractAddress={contractAddress} abi={abi} getterName={settings.minPrice} setterName={settings.setMinPrice} inputType="uint256"
                    unit={settings.unit} ethPrice={ethPrice} warnIf={isStreaming ? minPriceWarning : undefined}
                    validate={v => Number.isFinite(Number(v)) && Number(v) > 0 ? null : settings.unit === 'ethPerMonth' ? 'Enter ETH per month' : 'Enter an amount in ETH'}
                    onSuccess={saved('Minimum price updated')}
                  />
                )}
                <AdminSettingRow label="Beneficiary" contractAddress={contractAddress} abi={abi} getterName="beneficiaryAddress" setterName="setBeneficiaryAddress" inputType="address" onSuccess={saved('Beneficiary updated')} />
                {settings.limits && (
                  <>
                    <AdminSettingRow
                      label="Max Message Characters" contractAddress={contractAddress} abi={abi} getterName="maxMessageLength" setterName="setMaxMessageLength" inputType="uint256"
                      validate={v => /^\d+$/.test(v) && +v >= 1 && +v <= 1000 ? null : 'Whole number, 1–1000'}
                      onSuccess={saved('Message limit updated')}
                    />
                    <AdminSettingRow
                      label="Max Author Characters" contractAddress={contractAddress} abi={abi} getterName="maxNameLength" setterName="setMaxNameLength" inputType="uint256"
                      validate={v => /^\d+$/.test(v) && +v <= 100 ? null : 'Whole number, 0–100'}
                      onSuccess={saved('Author limit updated')}
                    />
                  </>
                )}
              </>
            )}
          </DrawerSection>

          {isAdmin && !isLegacyFixed && (
            <section style={{ padding: '18px 28px', borderTop: `1px solid ${BORDER}` }}>
              <AdminSettingRow
                label="Transfer Admin" contractAddress={contractAddress} abi={adminAbi} getterName="admin" setterName={settings.setAdmin} inputType="address"
                dangerous="confirm" warning="Hands full control of this Markee to another wallet. Only the new admin can undo it."
                acknowledge="I understand I'll lose all admin access to this Markee"
                onSuccess={saved('Admin transferred')}
              />
            </section>
          )}
          <div style={{ height: 24 }} />
        </div>
      </aside>
    </div>
  )
}
