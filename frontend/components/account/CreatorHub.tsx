'use client'

// Creator Hub "Your Markees" panel: Active/Archived toggle, the Not Yet Activated / Not on a Site Yet
// attention groups, and the Shown on / Winning bid / Raised table. Row click opens the Manage drawer.

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Eye, EyeOff } from 'lucide-react'
import { StrategyBadge } from '@/components/StrategyBadge'
import { useLiveBalance } from '@/hooks/useLiveBalance'
import { MONO, PINK, GREEN, BG, TEXT, TEXT2, MUTED, BORDER, SANS, AMBER, CARD_BG } from '@/lib/design-tokens'
import type { AnyLeaderboard } from '@/components/account/types'
import { ArchiveButton, AttnGroup, PanelHead, SECONDS_PER_MONTH, SegToggle, fmtAddr, fmtCount, fmtWeiUsd } from '@/components/account/primitives'
import { PlatformGlyph, shownOn } from '@/components/account/sites'
import { useToast } from '@/components/account/Toast'
import { viewReporting, viewReportingTip, type BoardIntegrations } from '@/lib/integrations/featured'
import { useBoardIntegrations } from '@/lib/integrations/useBoardIntegrations'

export const MK_COLS = 'minmax(0,1fr) 104px 84px 196px'

export function compareByRaised<T extends { totalFundsRaw: string }>(a: T, b: T): number {
  const at = BigInt(a.totalFundsRaw || '0')
  const bt = BigInt(b.totalFundsRaw || '0')
  return at > bt ? 1 : at < bt ? -1 : 0
}

const markeeName = (lb: AnyLeaderboard) => lb.name || fmtAddr(lb.address)

function AttnMarkeeItem({ lb, meta, cta, onCta, onArchive }: { lb: AnyLeaderboard; meta: string; cta: string; onCta: () => void; onArchive: () => void }) {
  return (
    <div style={{ background: CARD_BG, border: '1px solid rgba(138,143,191,0.18)', borderRadius: 14, boxShadow: `inset 3px 0 0 ${AMBER}`, padding: '12px 16px 12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{markeeName(lb)}</span>
      <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="xs" />
      <span style={{ fontSize: 12, color: MUTED }}>{meta}</span>
      <span style={{ flex: 1 }} />
      <ArchiveButton onClick={onArchive} label={`Archive ${markeeName(lb)}`} />
      <button
        onClick={onCta}
        style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '0 14px', height: 32, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}
      >
        {cta}
      </button>
    </div>
  )
}

export function MarkeeAttnGroups({ inactive, awaiting, ethPrice, onActivate, onArchive, onAddToSite }: {
  inactive: AnyLeaderboard[]
  awaiting: AnyLeaderboard[]
  ethPrice: number | null
  onActivate: (lb: AnyLeaderboard) => void
  onArchive: (lb: AnyLeaderboard) => void
  onAddToSite: (lb: AnyLeaderboard) => void
}) {
  const toast = useToast()
  const archive = (lb: AnyLeaderboard) => { onArchive(lb); toast(`${markeeName(lb)} archived`) }
  return (
    <>
      {inactive.length > 0 && (
        <AttnGroup
          title="Not Yet Activated"
          sub="Activate to set the first message."
          items={inactive}
          render={lb => (
            <AttnMarkeeItem key={lb.address} lb={lb} meta={`Pays out to ${fmtAddr(lb.admin)}`} cta="Activate" onCta={() => onActivate(lb)} onArchive={() => archive(lb)} />
          )}
        />
      )}
      {awaiting.length > 0 && (
        <AttnGroup
          title="Not on a Site Yet"
          sub="Add the embed to your site to go live."
          items={awaiting}
          render={lb => (
            <AttnMarkeeItem key={lb.address} lb={lb} meta={`${fmtWeiUsd(BigInt(lb.totalFundsRaw), ethPrice)} raised`} cta="Add to Your Site" onCta={() => onAddToSite(lb)} onArchive={() => archive(lb)} />
          )}
        />
      )}
    </>
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

export function PulseDot() {
  return <span className="acct-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: GREEN, flexShrink: 0, display: 'inline-block' }} />
}

function MarkeeRow({ lb, archived, selected, views, integrations, ethPrice, onRestore, onManage }: {
  lb: AnyLeaderboard
  integrations?: BoardIntegrations
  archived?: boolean
  selected: boolean
  views: number
  ethPrice: number | null
  onRestore: () => void
  onManage: () => void
}) {
  const isStreaming = lb.strategy === 'streaming'
  const ratePerSec = isStreaming && lb.topRateRaw ? BigInt(lb.topRateRaw) : 0n
  const raised = useLiveBalance(BigInt(lb.totalFundsRaw), ratePerSec)
  const topBid = BigInt(lb.topFundsAddedRaw ?? '0')
  const site = archived ? null : shownOn(lb, integrations)
  // Sites whose embed isn't reporting views; the Manage drawer says which and what to check.
  const notReportingKeys = archived || !integrations ? [] : Object.keys(integrations.views).filter(k => viewReporting(integrations, k) !== 'ok')
  const notReporting = notReportingKeys.length
  const notReportingTip = notReporting === 1 && Object.keys(integrations?.views ?? {}).length === 1
    ? viewReportingTip(viewReporting(integrations, notReportingKeys[0]), integrations?.lastView[notReportingKeys[0]])
    : `${notReporting} of these embeds ${notReporting === 1 ? "isn't" : "aren't"} logging views. Open Manage to see which.`
  const amount = (color: string = TEXT): React.CSSProperties => ({ textAlign: 'right', fontSize: 14, fontWeight: 700, color, whiteSpace: 'nowrap' })
  const dash = <span style={{ textAlign: 'right', color: MUTED, fontSize: 12.5 }}>-</span>
  const ghostBtn: React.CSSProperties = { background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 10px', height: 32, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }

  return (
    <div
      onClick={archived ? undefined : onManage}
      className={archived ? 'acct-row' : 'acct-row acct-row-click'}
      style={{
        display: 'grid', gridTemplateColumns: MK_COLS, gap: 12, padding: '12px 18px', alignItems: 'center',
        borderTop: `1px solid ${BORDER}`, opacity: archived ? 0.7 : 1,
        background: selected ? 'rgba(248,151,254,0.06)' : undefined, boxShadow: selected ? `inset 2px 0 0 ${PINK}` : undefined,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <PlatformGlyph platform={lb.platform} color={TEXT2} />
          {site ? (
            <>
              <span title={site.label} style={{ fontFamily: MONO, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{site.label}</span>
              {site.more > 0 && <span style={{ fontSize: 12, color: MUTED }}>+{site.more}</span>}
              {notReporting > 0 && (
                <span
                  title={notReportingTip ?? undefined}
                  style={{ display: 'inline-flex', color: AMBER, flexShrink: 0 }}
                >
                  <EyeOff size={13} aria-label="Not logging views" />
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{markeeName(lb)}</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
          <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="xs" />
          {archived
            ? <span>Archived</span>
            : <span title="Views" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Eye size={12} style={{ color: MUTED }} aria-label="views" />
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: views ? TEXT2 : MUTED }}>{fmtCount(views)}</span>
              </span>}
        </span>
      </span>

      {topBid === 0n ? dash
        : isStreaming ? (ratePerSec > 0n
          ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <PulseDot />
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
            <a href={`/markee/${lb.address}`} onClick={e => e.stopPropagation()} style={{ ...ghostBtn, textDecoration: 'none', gap: 5 }}>
              View Markee <ArrowUpRight size={11} />
            </a>
            <button
              onClick={e => { e.stopPropagation(); onManage() }}
              aria-haspopup="dialog"
              style={{ ...ghostBtn, color: PINK, border: `1px solid ${PINK}`, fontWeight: 700, background: selected ? `${PINK}14` : 'transparent' }}
            >
              Manage
            </button>
          </>
        )}
      </span>
    </div>
  )
}

export function YourMarkees({ active, archived, inactive, awaiting, loading, boardViews, ethPrice, selected, onManage, onActivate, onArchive, onRestore, onAddToSite }: {
  active: AnyLeaderboard[]
  archived: AnyLeaderboard[]
  inactive: AnyLeaderboard[]
  awaiting: AnyLeaderboard[]
  loading: boolean
  boardViews: Record<string, number>
  ethPrice: number | null
  selected: string | null
  onManage: (lb: AnyLeaderboard) => void
  onActivate: (lb: AnyLeaderboard) => void
  onArchive: (lb: AnyLeaderboard) => void
  onRestore: (lb: AnyLeaderboard) => void
  onAddToSite: (lb: AnyLeaderboard) => void
}) {
  const [view, setView] = useState<'active' | 'archived'>('active')
  const toast = useToast()
  const activeCount = inactive.length + awaiting.length + active.length
  const rows = view === 'active' ? active : archived
  const { data: integrationData } = useBoardIntegrations(active.map(lb => lb.address))

  return (
    <section style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <PanelHead label="Your Markees" n={activeCount}>
        <SegToggle
          label="Show"
          value={view}
          onChange={setView}
          options={[{ k: 'active', l: 'Active', n: activeCount }, { k: 'archived', l: 'Archived', n: archived.length }]}
        />
        <Link href="/create-a-markee" style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 8, padding: '0 14px', height: 32, display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 700, fontFamily: SANS, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Create New Markee
        </Link>
      </PanelHead>

      {!loading && view === 'active' && (inactive.length > 0 || awaiting.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 18px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <MarkeeAttnGroups inactive={inactive} awaiting={awaiting} ethPrice={ethPrice} onActivate={onActivate} onArchive={onArchive} onAddToSite={onAddToSite} />
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620 }}>
          <MarkeeTableHead />
          {loading ? (
            [1, 2, 3].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: MK_COLS, gap: 12, padding: '16px 18px', borderTop: `1px solid ${BORDER}` }}>
                {[1, 2, 3, 4].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
              </div>
            ))
          ) : rows.length === 0 ? (
            <div style={{ padding: '22px 18px', borderTop: `1px solid ${BORDER}`, fontSize: 13, color: MUTED }}>
              {view === 'active' ? 'No live Markees yet.' : 'No archived Markees.'}
            </div>
          ) : (
            rows.map(lb => (
              <MarkeeRow
                key={lb.address}
                lb={lb}
                archived={view === 'archived'}
                selected={selected === lb.address}
                views={boardViews[lb.address.toLowerCase()] ?? 0}
                integrations={integrationData?.[lb.address.toLowerCase()]}
                ethPrice={ethPrice}
                onRestore={() => { onRestore(lb); toast(`${markeeName(lb)} restored`) }}
                onManage={() => onManage(lb)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  )
}
