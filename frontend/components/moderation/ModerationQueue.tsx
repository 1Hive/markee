'use client'

import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Eye, EyeOff, ShieldAlert, X } from 'lucide-react'
import { useModerationQueue } from '@/hooks/useModerationQueue'
import { MONO, PINK, BG2, TEXT2, TEXT, MUTED, BORDER, SANS, AMBER, DANGER, CARD_BG, LAVENDER } from '@/lib/design-tokens'
import { MAX_REVIEW_BATCH, type QueueAction, type ModerationItem, type QueueBoard } from '@/lib/moderation/queue'
import { AttnGroup, PanelHead, WalletPending, fmtAddr, isUserRejection } from '@/components/account/primitives'
import { useToast } from '@/components/account/Toast'

const itemId = (it: ModerationItem) => `${it.markee}:${it.blockNumber}`
const ago = (it: ModerationItem) => it.at > 0 ? formatDistanceToNow(it.at * 1000, { addSuffix: true }) : null
const ghost: React.CSSProperties = { background: 'transparent', borderRadius: 8, padding: '0 12px', height: 32, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }

// Where this viewer's flags on a board take effect: a board moderator's hide the message on every
// site showing the board, a global admin's only on markee.xyz.
function scopeText(board: QueueBoard | undefined): { text: string; title: string } | null {
  if (!board) return null
  return board.scopes.includes('board')
    ? { text: 'Flags hide everywhere', title: 'You moderate this board, so a flag hides the message on every site showing it.' }
    : { text: 'Flags hide on markee.xyz only', title: 'You review this board as a markee.xyz admin, so a flag hides the message on markee.xyz only.' }
}

function LiveTag({ live }: { live: boolean }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: live ? LAVENDER : MUTED, border: `1px solid ${live ? 'rgba(180,172,247,0.45)' : 'rgba(138,143,191,0.35)'}`, borderRadius: 99, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {live ? 'Live on sign' : 'Not live'}
    </span>
  )
}

// One message awaiting review, used by both the Activity Feed and the Creator Hub Moderation panel.
// `live` is whether it's the board's current #1; undefined when the board's top isn't known here.
export function ModerationItemRow({ item, board, live, onReview }: {
  item: ModerationItem
  board: QueueBoard | undefined
  live?: boolean
  onReview: (action: QueueAction, ids: string[]) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const edited = item.kind === 'edited'
  const scope = scopeText(board)

  const go = async (action: QueueAction) => {
    setBusy(true)
    setError(null)
    try {
      await onReview(action, [item.markee])
      toast(action === 'flag' ? 'Message flagged' : 'Message approved')
    } catch (e) {
      if (!isUserRejection(e)) setError('That review did not go through. Try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{ background: CARD_BG, border: '1px solid rgba(138,143,191,0.18)', borderRadius: 14, boxShadow: `inset 3px 0 0 ${AMBER}`, padding: '12px 16px 12px 18px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: item.message ? TEXT : MUTED, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.message || 'Empty message'}
          {item.name && <span style={{ color: TEXT2 }}> - {item.name}</span>}
        </div>
        {edited && item.previousMessage !== null && item.previousMessage !== item.message && (
          <div style={{ marginTop: 3, color: MUTED, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            was <span style={{ textDecoration: 'line-through' }}>{item.previousMessage || 'empty'}</span>
          </div>
        )}
        {edited && item.previousName != null && item.previousName !== item.name && (
          <div style={{ marginTop: 3, color: MUTED, fontSize: 12.5 }}>
            renamed from <span style={{ textDecoration: 'line-through' }}>{item.previousName || 'Anonymous'}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 5, fontSize: 12, color: MUTED }}>
          {ago(item) && <span>{ago(item)}</span>}
          {live !== undefined && <LiveTag live={live} />}
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT2 }}>{board?.name || fmtAddr(item.board)}</span>
          <span>by <a href={`https://basescan.org/address/${item.author}`} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT2, textDecoration: 'none' }}>{fmtAddr(item.author)}</a></span>
          {scope && <span title={scope.title}>{scope.text}</span>}
        </div>
        {error && <div style={{ marginTop: 6, fontSize: 12, color: DANGER }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {busy ? <WalletPending /> : (
          <>
            <button onClick={() => go('flag')} style={{ ...ghost, color: DANGER, border: '1px solid rgba(255,138,155,0.45)' }}>Flag</button>
            <button onClick={() => go('approve')} style={{ ...ghost, color: TEXT, border: '1px solid rgba(237,238,255,0.55)' }}>Approve</button>
          </>
        )}
      </div>
    </div>
  )
}

function FlaggedRow({ item, board, onReview }: { item: ModerationItem; board: QueueBoard | undefined; onReview: (action: QueueAction, ids: string[]) => Promise<void> }) {
  const [peek, setPeek] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const unflag = async () => {
    setBusy(true)
    setError(null)
    try {
      await onReview('approve', [item.markee])
      toast('Message unflagged')
    } catch (e) {
      if (!isUserRejection(e)) setError('That review did not go through. Try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center', padding: '11px 18px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', filter: peek ? 'none' : 'blur(4px)', transition: 'filter 160ms' }}>
          {item.message || 'Empty message'}{item.name ? ` - ${item.name}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
          {ago(item) && <span>{ago(item)}</span>}
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT2 }}>{board?.name || fmtAddr(item.board)}</span>
          <span>by {fmtAddr(item.author)}</span>
        </div>
        {error && <div style={{ marginTop: 6, fontSize: 12, color: DANGER }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {busy ? <WalletPending /> : (
          <>
            <button onClick={() => setPeek(p => !p)} aria-pressed={peek} style={{ ...ghost, color: TEXT2, border: `1px solid ${BORDER}` }}>
              {peek ? <EyeOff size={14} /> : <Eye size={14} />}{peek ? 'Hide Message' : 'See Message'}
            </button>
            <button onClick={unflag} style={{ ...ghost, color: TEXT, border: '1px solid rgba(237,238,255,0.45)' }}>Unflag</button>
          </>
        )}
      </div>
    </div>
  )
}

// Creator Hub Moderation panel: the review queue (same rows as the Activity Feed) and the messages
// this wallet's flags are hiding, which can be revealed and unflagged.
export function ModerationQueue({ liveMarkees }: { liveMarkees?: Set<string> }) {
  const { review, items, flagged, boards, isLoading, error } = useModerationQueue()
  const [approvingAll, setApprovingAll] = useState(false)
  const toast = useToast()
  const boardOf = (it: ModerationItem) => boards.find(b => b.address === it.board)
  const liveOf = (it: ModerationItem) => liveMarkees && liveMarkees.size ? liveMarkees.has(it.markee.toLowerCase()) : undefined
  const signatures = Math.ceil(items.length / MAX_REVIEW_BATCH)

  const approveAll = async () => {
    setApprovingAll(true)
    try {
      await review('approve', items.map(i => i.markee))
      toast(`Approved ${items.length} messages`)
    } catch { /* the queue refetches and shows what landed */ } finally {
      setApprovingAll(false)
    }
  }

  return (
    <section style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <PanelHead label="Moderation" n={isLoading ? undefined : items.length + flagged.length} />
      {isLoading ? (
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2].map(i => <div key={i} style={{ height: 64, background: 'rgba(138,143,191,0.08)', borderRadius: 14 }} />)}
        </div>
      ) : error ? (
        <div style={{ padding: '18px', fontSize: 13, color: DANGER }}>Could not load the moderation queue. It retries every minute.</div>
      ) : (
        <>
          <div style={{ padding: '18px 18px 20px', borderBottom: `1px solid ${BORDER}` }}>
            {items.length > 0 ? (
              <AttnGroup
                title="Moderation Queue"
                sub="Approve or flag new messages."
                items={items}
                noun={['message', 'messages']}
                right={items.length > 1 && (approvingAll ? <WalletPending /> : (
                  <button onClick={approveAll} style={{ ...ghost, color: TEXT2, border: `1px solid ${BORDER}` }}>
                    Approve All{signatures > 1 ? ` (${signatures} signatures)` : ''}
                  </button>
                ))}
                render={it => <ModerationItemRow key={itemId(it)} item={it} board={boardOf(it)} live={liveOf(it)} onReview={review} />}
              />
            ) : (
              <div style={{ fontSize: 13, color: MUTED }}>
                {boards.length === 0 ? 'You do not moderate any boards yet.' : 'Nothing waiting for review.'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Flagged Messages</span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, background: 'rgba(138,143,191,0.12)', borderRadius: 99, padding: '1px 8px' }}>{flagged.length}</span>
            <span style={{ fontSize: 12.5, color: MUTED }}>Hidden on your sites until you unflag.</span>
          </div>
          {flagged.map(it => <FlaggedRow key={itemId(it)} item={it} board={boardOf(it)} onReview={review} />)}
        </>
      )}
    </section>
  )
}

// Pops up when the poll brings in items that were not in the queue when the page loaded.
export function ModerationToast({ onReview }: { onReview: () => void }) {
  const { items, isLoading } = useModerationQueue()
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState(0)

  useEffect(() => {
    if (isLoading) return
    const ids = items.map(itemId)
    if (seen.current === null) {
      seen.current = new Set(ids)
      return
    }
    const added = ids.filter(id => !seen.current!.has(id))
    ids.forEach(id => seen.current!.add(id))
    if (added.length > 0) setFresh(n => n + added.length)
  }, [items, isLoading])

  useEffect(() => {
    if (fresh === 0) return
    const t = setTimeout(() => setFresh(0), 10_000)
    return () => clearTimeout(t)
  }, [fresh])

  if (fresh === 0) return null
  return (
    <div role="status" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 16px', background: BG2, border: `1px solid ${AMBER}66`, borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', maxWidth: 'calc(100vw - 40px)' }}>
      <ShieldAlert size={18} color={AMBER} style={{ flexShrink: 0 }} />
      <span style={{ color: TEXT, fontSize: 14, fontFamily: SANS }}>{fresh === 1 ? '1 new message to review' : `${fresh} new messages to review`}</span>
      <button onClick={() => { setFresh(0); onReview() }} style={{ background: 'transparent', border: 'none', color: PINK, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Review</button>
      <button aria-label="Dismiss" onClick={() => setFresh(0)} style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
    </div>
  )
}
