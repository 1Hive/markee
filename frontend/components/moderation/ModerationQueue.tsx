'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useModerationQueue } from '@/hooks/useModerationQueue'
import { MONO, PINK, GREEN, BG2, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import type { ModerationAction, ModerationItem, QueueBoard } from '@/lib/moderation/queue'

const SANS  = 'Manrope, system-ui, sans-serif'
const AMBER = '#FFB020'
const RED   = '#FF6B6B'

const itemId = (it: ModerationItem) => `${it.markee}:${it.blockNumber}`

function fmtAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
}

function ActionButton({ label, color, icon, busy, onClick }: { label: string; color: string; icon: React.ReactNode; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
        background: `${color}1A`, border: `1px solid ${color}66`, color,
        fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {icon}{label}
    </button>
  )
}

function QueueRow({ item, busy, onReview }: { item: ModerationItem; busy: boolean; onReview: (action: ModerationAction) => void }) {
  const edited = item.kind === 'edited'
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: '2px 8px', borderRadius: 99, color: edited ? AMBER : PINK, background: `${edited ? AMBER : PINK}1E` }}>
            {edited ? 'EDIT' : 'NEW'}
          </span>
          <span style={{ color: TEXT2, fontSize: 13, fontWeight: 600 }}>{item.name || 'Anonymous'}</span>
          <a href={`https://basescan.org/address/${item.author}`} target="_blank" rel="noreferrer" style={{ color: MUTED, fontFamily: MONO, fontSize: 12, textDecoration: 'none' }}>{fmtAddr(item.author)}</a>
          {item.at > 0 && (
            <a href={`https://basescan.org/tx/${item.txHash}`} target="_blank" rel="noreferrer" style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}>
              {formatDistanceToNow(item.at * 1000, { addSuffix: true })}
            </a>
          )}
        </div>
        <p style={{ margin: 0, color: TEXT, fontSize: 15, lineHeight: 1.45, wordBreak: 'break-word' }}>{item.message || <em style={{ color: MUTED }}>empty message</em>}</p>
        {edited && item.previousMessage !== null && (
          <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word' }}>
            was <span style={{ textDecoration: 'line-through' }}>{item.previousMessage || 'empty'}</span>
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <ActionButton label="Approve" color={GREEN} icon={<ShieldCheck size={14} />} busy={busy} onClick={() => onReview('approve')} />
        <ActionButton label="Flag" color={RED} icon={<ShieldAlert size={14} />} busy={busy} onClick={() => onReview('flag')} />
      </div>
    </div>
  )
}

function BoardGroup({ board, items, busyIds, onReview }: {
  board: QueueBoard
  items: ModerationItem[]
  busyIds: Set<string>
  onReview: (action: ModerationAction, items: ModerationItem[]) => void
}) {
  const allBusy = items.every(it => busyIds.has(it.markee))
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: BG2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        <Link href={`/markee/${board.address}`} style={{ color: TEXT, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>{board.name}</Link>
        <span style={{ fontFamily: MONO, fontSize: 12, color: AMBER, background: `${AMBER}1E`, borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>
        {items.length > 1 && (
          <div style={{ marginLeft: 'auto' }}>
            <ActionButton label={`Approve all ${items.length}`} color={GREEN} icon={<ShieldCheck size={14} />} busy={allBusy} onClick={() => onReview('approve', items)} />
          </div>
        )}
      </div>
      {items.map(it => (
        <QueueRow key={itemId(it)} item={it} busy={busyIds.has(it.markee)} onReview={action => onReview(action, [it])} />
      ))}
    </div>
  )
}

export function ModerationQueue() {
  const { unlocked, unlock, review, items, boards, isLoading, error } = useModerationQueue()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)

  const groups = useMemo(() => {
    const byBoard = new Map<string, ModerationItem[]>()
    items.forEach(it => byBoard.set(it.board, [...(byBoard.get(it.board) ?? []), it]))
    return boards
      .filter(b => byBoard.has(b.address))
      .map(b => ({ board: b, items: byBoard.get(b.address)! }))
  }, [items, boards])

  const handleReview = async (action: ModerationAction, targets: ModerationItem[]) => {
    const ids = targets.map(t => t.markee)
    setActionError(null)
    setBusyIds(prev => new Set([...prev, ...ids]))
    try {
      await review(action, ids)
    } catch (err) {
      console.error('[moderation] review error:', err)
      setActionError('That review did not go through. Try again.')
    } finally {
      setBusyIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
    }
  }

  if (!unlocked) {
    return (
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: BG2, padding: '28px 24px', maxWidth: 560 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: SANS }}>Review messages on your boards</h2>
        <p style={{ margin: '0 0 18px', color: TEXT2, fontSize: 14, lineHeight: 1.5 }}>
          New messages and edits on every board you moderate land here. Sign once with your wallet to open the queue for the next 24 hours.
        </p>
        <button
          onClick={async () => { setUnlocking(true); try { await unlock() } catch { /* user rejected */ } finally { setUnlocking(false) } }}
          disabled={unlocking}
          style={{ padding: '10px 18px', background: PINK, color: '#060A2A', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, fontFamily: MONO, cursor: unlocking ? 'wait' : 'pointer', opacity: unlocking ? 0.6 : 1 }}
        >
          {unlocking ? 'Waiting for signature…' : 'Open moderation queue'}
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => <div key={i} style={{ height: 76, background: 'rgba(138,143,191,0.08)', borderRadius: 12 }} />)}
      </div>
    )
  }

  if (error) {
    return <p style={{ color: RED, fontSize: 14 }}>Could not load the moderation queue. It retries every minute.</p>
  }

  if (groups.length === 0) {
    return (
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: BG2, padding: '28px 24px', textAlign: 'center' }}>
        <ShieldCheck size={28} color={GREEN} style={{ marginBottom: 10 }} />
        <p style={{ margin: 0, color: TEXT, fontWeight: 700, fontSize: 15 }}>All caught up</p>
        <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 13 }}>
          {boards.length === 0 ? 'You do not moderate any boards yet.' : `Nothing waiting on ${boards.length === 1 ? 'your board' : `your ${boards.length} boards`}.`}
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {actionError && <p style={{ margin: 0, color: RED, fontSize: 13 }}>{actionError}</p>}
      {groups.map(g => (
        <BoardGroup key={g.board.address} board={g.board} items={g.items} busyIds={busyIds} onReview={handleReview} />
      ))}
    </div>
  )
}

// Pops up when the poll brings in items that were not in the queue when the page loaded.
export function ModerationToast({ onReview }: { onReview: () => void }) {
  const { items, unlocked, isLoading } = useModerationQueue()
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState(0)

  useEffect(() => {
    if (!unlocked || isLoading) return
    const ids = items.map(itemId)
    if (seen.current === null) {
      seen.current = new Set(ids)
      return
    }
    const added = ids.filter(id => !seen.current!.has(id))
    ids.forEach(id => seen.current!.add(id))
    if (added.length > 0) setFresh(n => n + added.length)
  }, [items, unlocked, isLoading])

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
