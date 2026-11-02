'use client'

// Activity Feed "Latest Activity": per-wallet events written by the moderation scan cron
// (lib/activity/server.ts), read from /api/account/activity.

import { useState } from 'react'
import { ModeratedContent } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MONO, PINK, BLUE, GREEN, BG, TEXT, TEXT2, MUTED, BORDER, SANS, DANGER, CARD_BG } from '@/lib/design-tokens'
import type { ActivityEvent, ActivityKind } from '@/lib/activity/events'
import { PanelHead, SECONDS_PER_MONTH, SegToggle, fmtWeiUsd } from '@/components/account/primitives'

const KIND: Record<ActivityKind, { dot: string; hollow?: boolean; title: string }> = {
  winning: { dot: PINK, title: 'Your message is now winning' },
  outbid: { dot: MUTED, hollow: true, title: 'Your message was outbid' },
  stopped: { dot: MUTED, hollow: true, title: 'You stopped streaming to your message' },
  ran_out: { dot: DANGER, hollow: true, title: 'Your stream balance ran out' },
  new_top: { dot: GREEN, title: 'New winning message' },
  edited: { dot: BLUE, title: 'A message was edited' },
}

function shortAgo(at: number, now: number): string {
  const s = Math.max(0, Math.floor(now / 1000) - at)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function dayLabel(at: number, now: number): string {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const t = at * 1000
  if (t >= start.getTime()) return 'Today'
  if (t >= start.getTime() - 86_400_000) return 'Yesterday'
  if (t >= start.getTime() - 6 * 86_400_000) return 'Earlier this week'
  return 'Earlier'
}

export function LatestActivity({ events, state, onRetry, boardName, ethPrice, priceLabel, onPrice, onOpen }: {
  events: ActivityEvent[]
  state: 'loading' | 'ready' | 'failed'
  onRetry: () => void
  boardName: (board: string) => string
  ethPrice: number | null
  // The price to win back an outbid message, or null when it isn't outbid any more.
  priceLabel: (markee: string) => string | null
  onPrice: (markee: string) => void
  onOpen: (event: ActivityEvent) => void
}) {
  const [filter, setFilter] = useState<'all' | 'own' | 'buy'>('all')
  const now = Date.now()
  const list = events.filter(e => filter === 'all' || e.side === filter)
  const label: React.CSSProperties = { fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: MUTED }
  let lastDay: string | null = null

  return (
    <section style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <PanelHead label="Latest Activity">
        <SegToggle
          label="Filter activity"
          value={filter}
          onChange={setFilter}
          options={[
            { k: 'all', l: 'All' },
            { k: 'own', l: 'My Markees', n: events.filter(e => e.side === 'own').length },
            { k: 'buy', l: 'My Messages', n: events.filter(e => e.side === 'buy').length },
          ]}
        />
      </PanelHead>
      {state === 'loading' ? (
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 36, background: 'rgba(138,143,191,0.08)', borderRadius: 8 }} />)}
        </div>
      ) : state === 'failed' ? (
        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: DANGER }}>
          Could not load your activity.
          <button onClick={onRetry} style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 12px', height: 32, fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : list.length === 0 ? (
        <div style={{ padding: '22px 20px', fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          No activity yet. New winners, outbids and edits on your Markees and messages show up here.
        </div>
      ) : list.map((e, i) => {
        const day = dayLabel(e.at, now)
        const head = day !== lastDay ? (lastDay = day) : null
        const k = KIND[e.kind]
        const own = e.side === 'own'
        const price = e.kind === 'outbid' ? priceLabel(e.markee) : null
        const amount = e.kind === 'new_top' && e.amount && e.amount !== '0'
          ? `+${fmtWeiUsd(e.streaming ? BigInt(e.amount) * SECONDS_PER_MONTH : BigInt(e.amount), ethPrice)}`
          : null
        return (
          <div key={e.id}>
            {head && <div style={{ ...label, padding: '12px 20px 6px', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>{head}</div>}
            <div
              role="button"
              tabIndex={0}
              className="acct-row acct-row-click"
              onClick={() => onOpen(e)}
              onKeyDown={ev => { if (ev.key === 'Enter') onOpen(e) }}
              style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '10px 20px' }}
            >
              <span
                title={own ? 'Your Markee' : 'Your message'}
                style={{ width: 30, height: 30, borderRadius: own ? 8 : 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: own ? BG : 'rgba(248,151,254,0.1)', border: `1px solid ${own ? BORDER : 'rgba(248,151,254,0.4)'}` }}
              >
                {own
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEXT2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v5M8 21h8" /></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PINK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, boxSizing: 'border-box', ...(k.hollow ? { border: `1.5px solid ${k.dot}` } : { background: k.dot }) }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: e.kind === 'outbid' || e.kind === 'stopped' || e.kind === 'ran_out' ? TEXT2 : TEXT, whiteSpace: 'nowrap' }}>{k.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>on {boardName(e.board)}</span>
                </span>
                {e.message && (
                  <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={e.markee} className="min-w-0">
                    <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 3, paddingLeft: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>&ldquo;{e.message}&rdquo;</span>
                  </ModeratedContent>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {price ? (
                  <button
                    onClick={ev => { ev.stopPropagation(); onPrice(e.markee) }}
                    aria-label={`Bid ${price} to win`}
                    style={{ background: 'transparent', border: `1px solid ${PINK}`, color: PINK, borderRadius: 8, width: 104, height: 32, padding: '0 8px', fontSize: 12, fontWeight: 800, fontFamily: MONO, cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box' }}
                  >
                    {price}
                  </button>
                ) : amount ? (
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>
                    {amount}{e.streaming && <span style={{ fontWeight: 500, color: MUTED, fontSize: 11.5 }}>/mo</span>}
                  </span>
                ) : null}
                <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap', minWidth: 52, textAlign: 'right' }}>{shortAgo(e.at, now)}</span>
              </span>
            </div>
          </div>
        )
      })}
    </section>
  )
}
