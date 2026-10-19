'use client'

// Activity Feed "Needs Attention": everything waiting on this wallet, in one amber card. Each source
// shows as soon as it has loaded, so a slow moderation queue never hides the Markee groups.

import { ShieldCheck } from 'lucide-react'
import { ModerationItemRow } from '@/components/moderation'
import { MONO, PINK, GREEN, BG, TEXT, TEXT2, MUTED, BORDER, SANS, AMBER, CARD_BG } from '@/lib/design-tokens'
import type { ModerationItem, QueueAction, QueueBoard } from '@/lib/moderation/queue'
import type { AnyLeaderboard } from '@/components/account/types'
import { AttnGroup, WalletPending } from '@/components/account/primitives'
import { MarkeeAttnGroups } from '@/components/account/CreatorHub'

// "3d 4h" / "14h" -- the low-balance line only needs days and hours.
function runsOutIn(seconds: bigint): string {
  const days = seconds / 86_400n
  const hours = (seconds % 86_400n) / 3600n
  return days > 0n ? `${days}d ${hours}h` : `${hours > 0n ? hours : 1n}h`
}

export function NeedsAttention({ modLoading, modItems, modBoards, liveMarkees, onReview, onOpenQueue, markeesLoading, inactive, awaiting, ethPrice, onActivate, onArchive, onAddToSite, lowRunway, onDeposit }: {
  modLoading: boolean
  modItems: ModerationItem[]
  modBoards: QueueBoard[]
  liveMarkees: Set<string>
  onReview: (action: QueueAction, ids: string[]) => Promise<void>
  onOpenQueue: () => void
  markeesLoading: boolean
  inactive: AnyLeaderboard[]
  awaiting: AnyLeaderboard[]
  ethPrice: number | null
  onActivate: (lb: AnyLeaderboard) => void
  onArchive: (lb: AnyLeaderboard) => void
  onAddToSite: (lb: AnyLeaderboard) => void
  lowRunway: bigint | null
  onDeposit: () => void
}) {
  const markees = markeesLoading ? [] : [...inactive, ...awaiting]
  const total = modItems.length + markees.length + (lowRunway != null ? 1 : 0)
  const loading = modLoading || markeesLoading

  if (total === 0) {
    if (loading) {
      return (
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
          <WalletPending label="Checking what needs your attention…" />
        </div>
      )
    }
    return (
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
        <ShieldCheck size={26} strokeWidth={1.8} style={{ color: GREEN, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>All Caught Up</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Nothing to moderate, activate or add to a site.</div>
        </div>
      </div>
    )
  }

  return (
    <section style={{ background: 'rgba(255,181,71,0.05)', border: '1px solid rgba(255,181,71,0.28)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', minHeight: 56, boxSizing: 'border-box', borderBottom: '1px solid rgba(255,181,71,0.22)', background: 'rgba(255,181,71,0.08)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: AMBER, boxShadow: `0 0 10px ${AMBER}` }} />
        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: AMBER }}>Needs Attention</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: AMBER, background: `${AMBER}24`, borderRadius: 99, padding: '1px 8px' }}>{total}</span>
        {loading && <span style={{ marginLeft: 'auto' }}><WalletPending label="Checking for more…" /></span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 18px 20px' }}>
        {modItems.length > 0 && (
          <AttnGroup
            title="Moderation Queue"
            sub="Approve or flag new messages."
            items={modItems}
            noun={['message', 'messages']}
            right={<button onClick={onOpenQueue} style={{ background: 'transparent', border: 'none', color: PINK, fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', padding: 0 }}>Open Full Queue →</button>}
            render={it => (
              <ModerationItemRow
                key={`${it.markee}:${it.blockNumber}`}
                item={it}
                board={modBoards.find(b => b.address === it.board)}
                live={liveMarkees.size ? liveMarkees.has(it.markee.toLowerCase()) : undefined}
                onReview={onReview}
              />
            )}
          />
        )}
        {!markeesLoading && (
          <MarkeeAttnGroups inactive={inactive} awaiting={awaiting} ethPrice={ethPrice} onActivate={onActivate} onArchive={onArchive} onAddToSite={onAddToSite} />
        )}
        {lowRunway != null && (
          <AttnGroup
            title="Stream Balance"
            sub="Your balance is running low."
            items={[lowRunway]}
            render={r => (
              <div key="low" style={{ background: CARD_BG, border: '1px solid rgba(138,143,191,0.18)', borderRadius: 14, boxShadow: `inset 3px 0 0 ${AMBER}`, padding: '12px 16px 12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, fontSize: 13, color: TEXT2 }}>
                  Runs out in <b style={{ color: AMBER, fontFamily: MONO }}>{runsOutIn(r)}</b>. Your Rent bids stop streaming when it does.
                </span>
                <button onClick={onDeposit} style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '0 14px', height: 32, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>Deposit</button>
              </div>
            )}
          />
        )}
      </div>
    </section>
  )
}
