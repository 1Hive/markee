'use client'

import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Eye, EyeOff, ShieldAlert, X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { MODERATION_API } from '@/lib/moderation/config'
import { useModerationQueue } from '@/hooks/useModerationQueue'
import { MONO, PINK, BG2, TEXT2, TEXT, MUTED, BORDER, SANS, AMBER, DANGER, CARD_BG } from '@/lib/design-tokens'
import { type QueueAction, type ModerationItem, type QueueBoard, type VisibleMessage } from '@/lib/moderation/queue'
import { AttnGroup, Pager, PanelHead, SegToggle, WalletPending, fmtAddr, isUserRejection } from '@/components/account/primitives'
import { useToast } from '@/components/account/Toast'

const itemId = (it: ModerationItem) => `${it.markee}:${it.blockNumber}`
const ago = (it: ModerationItem) => it.at > 0 ? formatDistanceToNow(it.at * 1000, { addSuffix: true }) : null
const ghost: React.CSSProperties = { background: 'transparent', borderRadius: 8, padding: '0 12px', height: 32, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }

// The message opens its board's page, where it shows on the Markee sign.
function SignLink({ board, style, children }: { board: string; style: React.CSSProperties; children: React.ReactNode }) {
  return <a href={`/markee/${board}`} style={{ ...style, display: 'block', textDecoration: 'none' }}>{children}</a>
}

function BoardTag({ item, board }: { item: { board: string }; board: { name?: string } | undefined }) {
  return <span style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT2 }}>{board?.name || fmtAddr(item.board)}</span>
}

// One message awaiting review, used by both the Activity Feed and the Creator Hub Moderation panel.
export function ModerationItemRow({ item, board, onReview, selected, onSelect }: {
  item: ModerationItem
  board: QueueBoard | undefined
  onReview: (action: QueueAction, ids: string[]) => Promise<void>
  // Given together, show a checkbox for batch approval.
  selected?: boolean
  onSelect?: (selected: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const edited = item.kind === 'edited'

  const go = async (action: QueueAction) => {
    setBusy(true)
    setError(null)
    try {
      await onReview(action, [item.markee])
      toast(action === 'flag' ? 'Message flagged' : 'Message approved on Markee and SDK integrations')
    } catch (e) {
      if (!isUserRejection(e)) setError('That review did not go through. Try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{ background: CARD_BG, border: '1px solid rgba(138,143,191,0.18)', borderRadius: 14, boxShadow: `inset 3px 0 0 ${AMBER}`, padding: '12px 16px 12px 18px', display: 'grid', gridTemplateColumns: onSelect ? 'auto minmax(0,1fr) auto' : 'minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
      {onSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={e => onSelect(e.target.checked)}
          aria-label={`Select ${item.message ? `"${item.message}"` : 'empty message'} for approval`}
          style={{ width: 16, height: 16, margin: 0, accentColor: PINK, cursor: 'pointer' }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <SignLink board={item.board} style={{ fontSize: 14.5, fontWeight: 600, color: item.message ? TEXT : MUTED, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.message || 'Empty message'}
          {item.name && <span style={{ color: TEXT2 }}> - {item.name}</span>}
        </SignLink>
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
          <BoardTag item={item} board={board} />
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
      await onReview(item.automatic ? 'false-positive' : 'unflag', [item.markee])
      toast(item.automatic ? 'False positive approved on Markee and SDK integrations' : 'Message unflagged')
    } catch (e) {
      if (!isUserRejection(e)) setError('That review did not go through. Try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center', padding: '11px 18px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 0 }}>
        <SignLink board={item.board} style={{ fontSize: 14, fontWeight: 600, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', filter: peek ? 'none' : 'blur(4px)', transition: 'filter 160ms' }}>
          {item.message || 'Empty message'}{item.name ? ` - ${item.name}` : ''}
        </SignLink>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
          {item.automatic && <span>{item.automatic.siteState === 'visible' ? 'Approved on Markee only · Still hidden in SDK integrations' : `Automatic · ${item.automatic.reason || 'Matched automatic moderation rule'}`}</span>}
          {ago(item) && <span>{ago(item)}</span>}
          <BoardTag item={item} board={board} />
        </div>
        {error && <div style={{ marginTop: 6, fontSize: 12, color: DANGER }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {busy ? <WalletPending /> : (
          <>
            <button onClick={() => setPeek(p => !p)} aria-pressed={peek} style={{ ...ghost, color: TEXT2, border: `1px solid ${BORDER}` }}>
              {peek ? <EyeOff size={14} /> : <Eye size={14} />}{peek ? 'Hide Message' : 'See Message'}
            </button>
            <button onClick={unflag} style={{ ...ghost, color: TEXT, border: '1px solid rgba(237,238,255,0.45)' }}>{item.automatic ? item.automatic.siteState === 'visible' ? 'Approve for SDK too' : 'Mark as false positive' : 'Unflag'}</button>
          </>
        )}
      </div>
    </div>
  )
}

// One unflagged message on a board this wallet moderates, which it can flag.
function VisibleRow({ item, onReview }: { item: VisibleMessage; onReview: (action: QueueAction, ids: string[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const flag = async () => {
    setBusy(true)
    setError(null)
    try {
      await onReview('flag', [item.markee])
      toast('Message flagged')
    } catch (e) {
      if (!isUserRejection(e)) setError('That review did not go through. Try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center', padding: '11px 18px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ minWidth: 0 }}>
        <SignLink board={item.board} style={{ fontSize: 14, fontWeight: 600, color: item.message ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.message || 'Empty message'}{item.name && <span style={{ color: TEXT2 }}> - {item.name}</span>}
        </SignLink>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
          {item.rank === 1
            ? <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: PINK }}>Winning</span>
            : <span style={{ fontFamily: MONO, fontSize: 11 }}>#{item.rank}</span>}
          <BoardTag item={item} board={{ name: item.boardName }} />
        </div>
        {error && <div style={{ marginTop: 6, fontSize: 12, color: DANGER }}>{error}</div>}
      </div>
      {busy ? <WalletPending /> : (
        <button onClick={flag} style={{ ...ghost, color: DANGER, border: '1px solid rgba(255,138,155,0.45)' }}>Flag</button>
      )}
    </div>
  )
}

// Asks before approving several messages at once, since each one goes live on every site.
function ConfirmApproveModal({ count, busy, error, onConfirm, onCancel }: { count: number; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])
  const noun = count === 1 ? 'message' : 'messages'
  return (
    <div onClick={busy ? undefined : onCancel} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(6,10,42,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-approve-title"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(420px, 100%)', background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', padding: '22px 22px 18px', fontFamily: SANS }}
      >
        <h2 id="confirm-approve-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TEXT }}>
          {count === 1 ? 'Approve the selected message?' : `Approve all ${count} selected ${noun}?`}
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: TEXT2, lineHeight: 1.5 }}>
          They will show on Markee and every SDK integration of your boards. You can still flag them later.
        </p>
        {error && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: DANGER }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          {busy ? <WalletPending label={`Approving ${count} ${noun}…`} /> : (
            <>
              <button onClick={onCancel} style={{ ...ghost, color: TEXT2, border: `1px solid ${BORDER}` }}>Cancel</button>
              <button autoFocus onClick={onConfirm} style={{ ...ghost, color: TEXT, border: '1px solid rgba(237,238,255,0.55)' }}>Approve {count}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const LIST_PAGE = 10

// Creator Hub Moderation panel: the amber review queue, then every message on the wallet's boards,
// toggled between the ones showing (winning first, flaggable) and the ones its flags hide (unflaggable).
export function ModerationQueue() {
  const { address } = useAccount()
  const { review, items, flagged, boards, isLoading, error } = useModerationQueue()
  const [view, setView] = useState<'visible' | 'flagged'>('visible')
  const [flaggedPage, setFlaggedPage] = useState(0)
  const [visiblePage, setVisiblePage] = useState(0)
  const [visible, setVisible] = useState<{ total: number; items: VisibleMessage[] } | null>(null)
  const [visibleKey, setVisibleKey] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const toast = useToast()
  const boardOf = (it: { board: string }) => boards.find(b => b.address === it.board)
  const me = address?.toLowerCase()

  useEffect(() => {
    if (!me) return
    let cancelled = false
    fetch(`${MODERATION_API}/messages?moderator=${me}&page=${visiblePage}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<{ total: number; items: VisibleMessage[] }> : null)
      .then(d => { if (!cancelled) setVisible(d ?? { total: 0, items: [] }) })
      .catch(() => { if (!cancelled) setVisible({ total: 0, items: [] }) })
    return () => { cancelled = true }
  }, [me, visiblePage, visibleKey, flagged.length])

  // Flagging or unflagging moves a message between the two lists, so both refresh.
  const reviewAndRefresh = async (action: QueueAction, ids: string[]) => {
    await review(action, ids)
    setVisibleKey(k => k + 1)
  }

  // Drop selections for messages that left the queue (reviewed here, elsewhere, or edited).
  const queued = new Set(items.map(it => it.markee))
  const picked = [...selected].filter(id => queued.has(id))
  const toggle = (id: string, on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    if (on) next.add(id); else next.delete(id)
    return next
  })
  const allPicked = items.length > 0 && picked.length === items.length

  const approveSelected = async () => {
    setBatchBusy(true)
    setBatchError(null)
    try {
      await reviewAndRefresh('approve', picked)
      toast(picked.length === 1 ? 'Message approved on Markee and SDK integrations' : `${picked.length} messages approved on Markee and SDK integrations`)
      setSelected(new Set())
      setConfirming(false)
    } catch (e) {
      // Approvals before the failure stay approved; the queue refetch drops them from the selection.
      setBatchError(isUserRejection(e) ? null : 'Some approvals did not go through. Try again.')
      if (isUserRejection(e)) setConfirming(false)
    } finally {
      setBatchBusy(false)
    }
  }

  const flaggedShown = Math.min(flaggedPage, Math.max(0, Math.ceil(flagged.length / LIST_PAGE) - 1))

  return (
    <section style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <PanelHead label="Moderation" n={isLoading ? undefined : items.length}>
        <SegToggle
          label="Show"
          value={view}
          onChange={setView}
          options={[{ k: 'visible', l: 'Visible', n: visible?.total }, { k: 'flagged', l: 'Flagged', n: flagged.length }]}
        />
      </PanelHead>
      {isLoading ? (
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2].map(i => <div className="skeleton" key={i} style={{ height: 64, background: 'rgba(138,143,191,0.08)', borderRadius: 14 }} />)}
        </div>
      ) : error ? (
        <div style={{ padding: '18px', fontSize: 13, color: DANGER }}>Could not load the moderation queue. It retries every minute.</div>
      ) : boards.length === 0 ? (
        <div style={{ padding: '18px', fontSize: 13, color: MUTED }}>You do not moderate any boards yet.</div>
      ) : (
        <>
          {items.length > 0 && (
            <div style={{ padding: '18px 18px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <AttnGroup
                title="Moderation Queue"
                sub="Approve or flag new messages."
                items={items}
                noun={['message', 'messages']}
                pageSize={5}
                right={items.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setSelected(allPicked ? new Set() : new Set(items.map(it => it.markee)))} style={{ ...ghost, height: 28, color: TEXT2, border: `1px solid ${BORDER}` }}>
                      {allPicked ? 'Clear selection' : 'Select all'}
                    </button>
                    {picked.length > 0 && (
                      <button onClick={() => { setBatchError(null); setConfirming(true) }} style={{ ...ghost, height: 28, color: TEXT, border: '1px solid rgba(237,238,255,0.55)' }}>
                        Approve {picked.length} selected
                      </button>
                    )}
                  </div>
                )}
                render={it => (
                  <ModerationItemRow
                    key={itemId(it)}
                    item={it}
                    board={boardOf(it)}
                    onReview={reviewAndRefresh}
                    {...(items.length > 1 ? { selected: selected.has(it.markee), onSelect: (on: boolean) => toggle(it.markee, on) } : {})}
                  />
                )}
              />
            </div>
          )}
          {view === 'visible' ? (
            visible === null ? (
              <div style={{ padding: '14px 18px' }}><WalletPending label="Loading messages…" /></div>
            ) : visible.items.length === 0 ? (
              <div style={{ padding: '14px 18px', fontSize: 13, color: MUTED }}>No messages on your boards yet.</div>
            ) : (
              visible.items.map(it => <VisibleRow key={it.markee} item={it} onReview={reviewAndRefresh} />)
            )
          ) : flagged.length === 0 ? (
            <div style={{ padding: '14px 18px', fontSize: 13, color: MUTED }}>Nothing flagged. Flagged messages are hidden on every site showing your boards.</div>
          ) : (
            flagged.slice(flaggedShown * LIST_PAGE, (flaggedShown + 1) * LIST_PAGE).map(it => <FlaggedRow key={itemId(it)} item={it} board={boardOf(it)} onReview={reviewAndRefresh} />)
          )}
          <div style={{ padding: '10px 18px', borderTop: `1px solid ${BORDER}` }}>
            {view === 'visible'
              ? visible && <Pager page={visiblePage} total={visible.total} pageSize={LIST_PAGE} onPage={setVisiblePage} />
              : <Pager page={flaggedShown} total={flagged.length} pageSize={LIST_PAGE} onPage={setFlaggedPage} />}
          </div>
        </>
      )}
      {confirming && picked.length > 0 && (
        <ConfirmApproveModal count={picked.length} busy={batchBusy} error={batchError} onConfirm={approveSelected} onCancel={() => setConfirming(false)} />
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
