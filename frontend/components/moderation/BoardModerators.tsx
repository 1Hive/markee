'use client'

/**
 * BoardModerators
 *
 * The Moderators section of a board's admin panel on /account. A board's owners (its on-chain admin
 * and its creator) always moderate it; here they add and remove other wallets. Edits are staged
 * locally and saved with one signature. Anyone can read the list from
 * GET /api/moderation/moderators?board=0x..., so other sites can show the same moderators.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSignMessage } from 'wagmi'
import { isAddress } from 'viem'
import { Check, Plus, X } from 'lucide-react'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MODERATION_API } from '@/lib/moderation/config'
import { EMAIL_FREQUENCIES, MAX_BOARD_MODERATORS, emailFreqMessage, moderatorsMessage, normalizeModerators, type EmailFrequency } from '@/lib/moderation/queue'
import { moderationQueueKey } from '@/hooks/useModerationQueue'
import { MONO, PINK, GREEN, TEXT, TEXT2, MUTED, BORDER, BG } from '@/lib/design-tokens'

const SANS = 'Manrope, system-ui, sans-serif'
const RED = '#FF6B6B'

interface ModeratorsState {
  board: string
  owners: string[]
  moderators: string[]
  updatedAt: number | null
  emailFrequency: EmailFrequency
}

function fmtAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function Chip({ children, color = MUTED }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color, border: `1px solid ${color}55`, borderRadius: 99, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function Row({ address, you, children }: { address: string; you: boolean; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${BORDER}`, minWidth: 0 }}>
      <a
        href={`https://basescan.org/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={address}
        style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {fmtAddr(address)}
      </a>
      {you && <Chip color={PINK}>You</Chip>}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
    </div>
  )
}

export function BoardModerators({ board }: { board: string }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const me = address?.toLowerCase()
  const queryKey = ['board-moderators', board.toLowerCase()]

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<ModeratorsState> => {
      const res = await fetch(`${MODERATION_API}/moderators?board=${board.toLowerCase()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })

  // The staged list; null until the saved one loads.
  const [draft, setDraft] = useState<string[] | null>(null)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Email frequency
  const [editingFreq, setEditingFreq] = useState(false)
  const [freqDraft, setFreqDraft] = useState<EmailFrequency | null>(null)
  const [savingFreq, setSavingFreq] = useState(false)
  const [freqError, setFreqError] = useState<string | null>(null)

  useEffect(() => { if (data && draft === null) setDraft(data.moderators) }, [data, draft])
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 3000)
    return () => clearTimeout(t)
  }, [justSaved])

  const owners = data?.owners ?? []
  const isOwner = !!me && owners.includes(me)
  const list = draft ?? data?.moderators ?? []
  const dirty = useMemo(
    () => !!data && normalizeModerators(list).join() !== normalizeModerators(data.moderators).join(),
    [data, list],
  )

  const add = () => {
    const value = input.trim().toLowerCase()
    if (!value) return
    if (!isAddress(value, { strict: false })) return setInputError('Enter a wallet address (0x…).')
    if (owners.includes(value)) return setInputError('That wallet owns this board, so it already moderates it.')
    if (list.includes(value)) return setInputError('Already a moderator.')
    if (list.length >= MAX_BOARD_MODERATORS) return setInputError(`A board can have up to ${MAX_BOARD_MODERATORS} moderators.`)
    setDraft([...list, value])
    setInput('')
    setInputError(null)
  }

  const save = async () => {
    if (!me) return
    setSaving(true)
    setSaveError(null)
    try {
      const moderators = normalizeModerators(list)
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = await signMessageAsync({ message: moderatorsMessage(CANONICAL_CHAIN_ID, board, moderators, timestamp) })
      const res = await fetch(`${MODERATION_API}/moderators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board, moderators, owner: me, signature, timestamp }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      queryClient.setQueryData(queryKey, body)
      setDraft(body.moderators)
      setJustSaved(true)
      queryClient.invalidateQueries({ queryKey: moderationQueueKey(me) })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      // A rejected wallet prompt isn't an error worth showing.
      if (!/reject|denied/i.test(message)) setSaveError(message || 'Could not save moderators. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const saveFrequency = async () => {
    if (!me || !freqDraft) return
    setSavingFreq(true)
    setFreqError(null)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = await signMessageAsync({ message: emailFreqMessage(CANONICAL_CHAIN_ID, board, freqDraft, timestamp) })
      const res = await fetch(`${MODERATION_API}/moderators`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board, frequency: freqDraft, owner: me, signature, timestamp }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      queryClient.setQueryData(queryKey, body)
      setEditingFreq(false)
      setFreqDraft(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (!/reject|denied/i.test(message)) setFreqError(message || 'Could not save. Try again.')
    } finally {
      setSavingFreq(false)
    }
  }

  const EMAIL_FREQ_LABELS: Record<EmailFrequency, string> = {
    every: 'Every new message',
    daily: 'Daily round-up',
    off: 'Off',
  }

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>Moderators</div>
      <p style={{ margin: '0 0 10px', color: TEXT2, fontSize: 12.5, lineHeight: 1.5, maxWidth: 620 }}>
        Moderators review new messages and edits on this board in the Moderation tab. A flag hides the message and its author on markee.xyz and on every site showing this board.
      </p>

      {isLoading ? (
        <div style={{ height: 72, background: 'rgba(138,143,191,0.08)', borderRadius: 8, maxWidth: 520 }} />
      ) : error ? (
        <p style={{ margin: 0, color: RED, fontSize: 12.5 }}>Could not load this board's moderators.</p>
      ) : (
        <div style={{ maxWidth: 520 }}>
          {owners.map(o => (
            <Row key={o} address={o} you={o === me}>
              <Chip>Owner</Chip>
            </Row>
          ))}
          {list.map(m => (
            <Row key={m} address={m} you={m === me}>
              {data && !data.moderators.includes(m) && <Chip color={GREEN}>Unsaved</Chip>}
              {isOwner && (
                <button
                  onClick={() => setDraft(list.filter(x => x !== m))}
                  aria-label={`Remove ${m}`}
                  title="Remove moderator"
                  style={{ display: 'flex', background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 2 }}
                >
                  <X size={14} />
                </button>
              )}
            </Row>
          ))}

          {isOwner ? (
            <>
              <form
                onSubmit={e => { e.preventDefault(); add() }}
                style={{ display: 'flex', gap: 8, marginTop: 12 }}
              >
                <input
                  value={input}
                  onChange={e => { setInput(e.target.value); setInputError(null) }}
                  placeholder="Add a moderator's wallet address (0x…)"
                  spellCheck={false}
                  autoComplete="off"
                  style={{ flex: 1, minWidth: 0, background: 'rgba(6,10,42,0.6)', border: `1px solid ${inputError ? RED : BORDER}`, borderRadius: 7, padding: '8px 10px', color: TEXT, fontFamily: MONO, fontSize: 12.5, outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: input.trim() ? TEXT : MUTED, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: input.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                >
                  <Plus size={13} /> Add
                </button>
              </form>
              {inputError && <p style={{ margin: '6px 0 0', color: RED, fontSize: 12 }}>{inputError}</p>}

              {(dirty || justSaved || saveError) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  {dirty && (
                    <>
                      <button
                        onClick={save}
                        disabled={saving}
                        style={{ background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '8px 14px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
                      >
                        {saving ? 'Confirm in wallet…' : 'Save moderators'}
                      </button>
                      <button
                        onClick={() => { setDraft(data?.moderators ?? []); setSaveError(null) }}
                        disabled={saving}
                        style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 12.5, fontFamily: SANS, cursor: 'pointer' }}
                      >
                        Discard
                      </button>
                      <span style={{ color: MUTED, fontSize: 12 }}>Saving asks for a free signature, not a transaction.</span>
                    </>
                  )}
                  {justSaved && !dirty && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: GREEN, fontSize: 12.5 }}><Check size={13} /> Moderators saved</span>
                  )}
                  {saveError && <span style={{ color: RED, fontSize: 12.5 }}>{saveError}</span>}
                </div>
              )}
            </>
          ) : (
            <p style={{ margin: '10px 0 0', color: MUTED, fontSize: 12.5 }}>Only this board's owner can change its moderators.</p>
          )}
        </div>
      )}

      {/* Email frequency */}
      {!isLoading && !error && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}`, maxWidth: 520 }}>
          {!editingFreq ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: TEXT2, fontSize: 12.5 }}>How often should moderators get emails?</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, fontWeight: 600 }}>
                  {EMAIL_FREQ_LABELS[data?.emailFrequency ?? 'off']}
                </span>
                {isOwner && (
                  <button
                    onClick={() => { setFreqDraft(data?.emailFrequency ?? 'off'); setEditingFreq(true); setFreqError(null) }}
                    style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 12px', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ color: TEXT2, fontSize: 12.5 }}>How often should moderators get emails?</span>
              <div style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden', alignSelf: 'flex-end' }}>
                {EMAIL_FREQUENCIES.map(freq => (
                  <button
                    key={freq}
                    onClick={() => setFreqDraft(freq)}
                    style={{
                      padding: '8px 16px', border: 'none', fontFamily: MONO, fontSize: 12.5, fontWeight: freqDraft === freq ? 700 : 500, cursor: 'pointer',
                      background: freqDraft === freq ? PINK : 'transparent',
                      color: freqDraft === freq ? BG : TEXT2,
                      transition: 'background 120ms, color 120ms',
                    }}
                  >
                    {EMAIL_FREQ_LABELS[freq]}
                  </button>
                ))}
              </div>
              {freqDraft === 'daily' && (
                <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>Sent only on days with at least 1 new message.</p>
              )}
              {freqError && <p style={{ margin: 0, fontSize: 12, color: '#FF6B6B' }}>{freqError}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setEditingFreq(false); setFreqDraft(null); setFreqError(null) }}
                  disabled={savingFreq}
                  style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 12.5, fontFamily: 'Manrope, system-ui, sans-serif', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveFrequency}
                  disabled={savingFreq || !freqDraft}
                  style={{ background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '8px 14px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5, cursor: savingFreq ? 'wait' : 'pointer', opacity: savingFreq ? 0.6 : 1 }}
                >
                  {savingFreq ? 'Confirm in wallet…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
