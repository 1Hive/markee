'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, Mail, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useAccount, useSignMessage } from 'wagmi'
import { useModerationQueue } from '@/hooks/useModerationQueue'
import { MONO, PINK, GREEN, BG2, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MAX_REVIEW_BATCH, notifyEmailMessage, type QueueAction, type ModerationItem, type QueueBoard } from '@/lib/moderation/queue'

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

function QueueRow({ item, busy, onReview, flaggedView = false }: { item: ModerationItem; busy: boolean; onReview: (action: QueueAction) => void; flaggedView?: boolean }) {
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
            <span style={{ color: MUTED, fontSize: 12 }}>{formatDistanceToNow(item.at * 1000, { addSuffix: true })}</span>
          )}
        </div>
        <p style={{ margin: 0, color: TEXT, fontSize: 15, lineHeight: 1.45, wordBreak: 'break-word' }}>{item.message || <em style={{ color: MUTED }}>empty message</em>}</p>
        {edited && item.previousName != null && item.previousName !== item.name && (
          <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word' }}>
            renamed from <span style={{ textDecoration: 'line-through' }}>{item.previousName || 'Anonymous'}</span>
          </p>
        )}
        {edited && item.previousMessage !== null && item.previousMessage !== item.message && (
          <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word' }}>
            was <span style={{ textDecoration: 'line-through' }}>{item.previousMessage || 'empty'}</span>
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {flaggedView ? (
          <ActionButton label="Unflag" color={GREEN} icon={<ShieldCheck size={14} />} busy={busy} onClick={() => onReview('approve')} />
        ) : (
          <>
            <ActionButton label="Approve" color={GREEN} icon={<ShieldCheck size={14} />} busy={busy} onClick={() => onReview('approve')} />
            <ActionButton label="Flag" color={RED} icon={<ShieldAlert size={14} />} busy={busy} onClick={() => onReview('flag')} />
          </>
        )}
      </div>
    </div>
  )
}

// Where this viewer's flags on a board take effect: a board moderator's hide the message on every
// site showing the board, a global admin's only on markee.xyz.
function ScopeChip({ board }: { board: QueueBoard }) {
  const everywhere = board.scopes.includes('board')
  return (
    <span
      title={everywhere ? 'You moderate this board, so a flag hides the message on every site showing it.' : 'You review this board as a markee.xyz admin, so a flag hides the message on markee.xyz only.'}
      style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 99, padding: '1px 8px', whiteSpace: 'nowrap' }}
    >
      {everywhere ? 'Flags hide everywhere' : 'Flags hide on markee.xyz only'}
    </span>
  )
}

function BoardGroup({ board, items, busyIds, onReview, flaggedView = false }: {
  board: QueueBoard
  items: ModerationItem[]
  busyIds: Set<string>
  onReview: (action: QueueAction, items: ModerationItem[]) => void
  flaggedView?: boolean
}) {
  const allBusy = items.every(it => busyIds.has(it.markee))
  const signatures = Math.ceil(items.length / MAX_REVIEW_BATCH)
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: BG2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        <Link href={`/markee/${board.address}`} style={{ color: TEXT, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>{board.name}</Link>
        <span style={{ fontFamily: MONO, fontSize: 12, color: flaggedView ? RED : AMBER, background: `${flaggedView ? RED : AMBER}1E`, borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>
        <ScopeChip board={board} />
        {items.length > 1 && !flaggedView && (
          <div style={{ marginLeft: 'auto' }}>
            <ActionButton label={`Approve all ${items.length}${signatures > 1 ? ` (${signatures} signatures)` : ''}`} color={GREEN} icon={<ShieldCheck size={14} />} busy={allBusy} onClick={() => onReview('approve', items)} />
          </div>
        )}
      </div>
      {items.map(it => (
        <QueueRow key={itemId(it)} item={it} busy={busyIds.has(it.markee)} onReview={action => onReview(action, [it])} flaggedView={flaggedView} />
      ))}
    </div>
  )
}

function groupByBoard(items: ModerationItem[], boards: QueueBoard[]) {
  const byBoard = new Map<string, ModerationItem[]>()
  items.forEach(it => byBoard.set(it.board, [...(byBoard.get(it.board) ?? []), it]))
  return boards.filter(b => byBoard.has(b.address)).map(b => ({ board: b, items: byBoard.get(b.address)! }))
}

function NotificationEmailRow() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const me = address?.toLowerCase()

  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [input, setInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!me) { setEmail(null); return }
    fetch(`/api/moderation/notify?wallet=${me}`)
      .then(r => r.json())
      .then(d => setEmail(d.email ?? null))
      .catch(() => setEmail(null))
  }, [me])

  const save = async () => {
    if (!me) return
    const val = input.trim().toLowerCase()
    setSaving(true); setErr(null)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = await signMessageAsync({ message: notifyEmailMessage(CANONICAL_CHAIN_ID, me, val, timestamp) })
      const res = await fetch('/api/moderation/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: me, email: val, signature: sig, timestamp }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      setEmail(body.email); setEditing(false); setInput('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!/reject|denied/i.test(msg)) setErr(msg || 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!me) return
    setSaving(true); setErr(null)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const sig = await signMessageAsync({ message: notifyEmailMessage(CANONICAL_CHAIN_ID, me, '', timestamp) })
      const res = await fetch('/api/moderation/notify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: me, signature: sig, timestamp }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEmail(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!/reject|denied/i.test(msg)) setErr(msg || 'Could not remove. Try again.')
    } finally { setSaving(false) }
  }

  if (!me) return null

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: BG2, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Mail size={13} color={MUTED} />
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }}>Notification email</span>
      </div>
      {email === undefined ? (
        <div style={{ height: 20, background: 'rgba(138,143,191,0.08)', borderRadius: 5, width: 220 }} />
      ) : !editing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {email ? (
            <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT }}>{email}</span>
          ) : (
            <span style={{ fontSize: 13, color: MUTED }}>No email set — you won't receive notifications.</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => { setInput(email ?? ''); setEditing(true); setErr(null) }}
              style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 12px', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              {email ? 'Change' : 'Add email'}
            </button>
            {email && (
              <button onClick={remove} disabled={saving} title="Remove email" style={{ display: 'flex', background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 2 }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <form onSubmit={e => { e.preventDefault(); save() }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="email"
              value={input}
              onChange={e => { setInput(e.target.value); setErr(null) }}
              placeholder="you@example.com"
              autoComplete="email"
              style={{ flex: 1, minWidth: 0, background: 'rgba(6,10,42,0.6)', border: `1px solid ${err ? '#FF6B6B' : BORDER}`, borderRadius: 7, padding: '8px 10px', color: TEXT, fontFamily: MONO, fontSize: 13, outline: 'none' }}
            />
            {err && <p style={{ margin: 0, fontSize: 12, color: '#FF6B6B' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <span style={{ color: MUTED, fontSize: 12, marginRight: 4 }}>Free signature, not a transaction.</span>
              <button type="button" onClick={() => { setEditing(false); setInput(''); setErr(null) }} disabled={saving} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 13, fontFamily: 'Manrope, system-ui, sans-serif', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !input.trim() || input.trim().toLowerCase() === email}
                style={{ background: PINK, color: '#060A2A', border: 'none', borderRadius: 7, padding: '8px 14px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: (saving || !input.trim() || input.trim().toLowerCase() === email) ? 0.5 : 1 }}
              >
                {saving ? 'Confirm in wallet…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
      {err && !editing && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#FF6B6B' }}>{err}</p>}
    </div>
  )
}

export function ModerationQueue() {
  const { review, items, flagged, boards, isLoading, error } = useModerationQueue()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [showFlagged, setShowFlagged] = useState(false)

  const groups = useMemo(() => groupByBoard(items, boards), [items, boards])
  const flaggedGroups = useMemo(() => groupByBoard(flagged, boards), [flagged, boards])

  const handleReview = async (action: QueueAction, targets: ModerationItem[]) => {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {actionError && <p style={{ margin: 0, color: RED, fontSize: 13 }}>{actionError}</p>}
      {groups.length === 0 ? (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: BG2, padding: '72px 24px', textAlign: 'center' }}>
          <ShieldCheck size={48} color={GREEN} style={{ marginBottom: 16 }} />
          <p style={{ margin: 0, color: TEXT, fontWeight: 700, fontSize: 20 }}>All caught up</p>
          <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 14 }}>
            {boards.length === 0 ? 'You do not moderate any boards yet.' : `Nothing waiting on ${boards.length === 1 ? 'your board' : `your ${boards.length} boards`}.`}
          </p>
        </div>
      ) : groups.map(g => (
        <BoardGroup key={g.board.address} board={g.board} items={g.items} busyIds={busyIds} onReview={handleReview} />
      ))}

      {flaggedGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => setShowFlagged(v => !v)}
            aria-expanded={showFlagged}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: 0, color: TEXT2, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <ShieldAlert size={15} color={RED} />
            Flagged ({flagged.length})
            <ChevronDown size={14} style={{ transform: showFlagged ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
          </button>
          {showFlagged && flaggedGroups.map(g => (
            <BoardGroup key={g.board.address} board={g.board} items={g.items} busyIds={busyIds} onReview={handleReview} flaggedView />
          ))}
        </div>
      )}

      <NotificationEmailRow />
    </div>
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
