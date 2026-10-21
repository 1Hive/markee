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
import { Check, Copy } from 'lucide-react'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { MODERATION_API } from '@/lib/moderation/config'
import { MAX_BOARD_MODERATORS, moderatorsMessage, normalizeModerators } from '@/lib/moderation/queue'
import { moderationQueueKey } from '@/hooks/useModerationQueue'
import { MONO, PINK, GREEN, TEXT, TEXT2, MUTED, BORDER, BG, SANS, DANGER as RED } from '@/lib/design-tokens'

interface ModeratorsState {
  board: string
  owners: string[]
  moderators: Array<{ wallet: string; emailMasked: string | null; verified: boolean; frequency: string }>
  updatedAt: number | null
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
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
      <a
        href={`https://basescan.org/address/${encodeURIComponent(address)}`}
        target="_blank"
        rel="noreferrer"
        title={address}
        style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {fmtAddr(address)}
      </a>
      <button onClick={copy} title="Copy address" style={{ display: 'flex', background: 'transparent', border: 'none', color: copied ? GREEN : MUTED, cursor: 'pointer', padding: 2, flexShrink: 0 }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
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

  // The staged list of wallet addresses; null until the saved one loads.
  const [draft, setDraft] = useState<string[] | null>(null)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => { if (data && draft === null) setDraft(data.moderators.map(m => m.wallet)) }, [data, draft])
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 3000)
    return () => clearTimeout(t)
  }, [justSaved])


  const owners = data?.owners ?? []
  const isOwner = !!me && owners.includes(me)
  const savedWallets = data?.moderators.map(m => m.wallet) ?? []
  const list = draft ?? savedWallets
  const dirty = useMemo(
    () => !!data && normalizeModerators(list).map(m => m.wallet).join() !== normalizeModerators(savedWallets).map(m => m.wallet).join(),
    [data, list, savedWallets],
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
    setAdding(false)
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
      setDraft((body.moderators ?? []).map((m: { wallet: string }) => m.wallet))
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

  return (
    <div>
      {isLoading ? (
        <div style={{ height: 72, background: 'rgba(138,143,191,0.08)', borderRadius: 8 }} />
      ) : error ? (
        <p style={{ margin: 0, color: RED, fontSize: 12.5 }}>Could not load this board's moderators.</p>
      ) : (
        <div>
          {owners.map(o => (
            <Row key={o} address={o} you={o === me}>
              <span title="Owners (the admin and creator) can add or remove moderators."><Chip>Owner</Chip></span>
            </Row>
          ))}
          {list.map(m => (
            <Row key={m} address={m} you={m === me}>
              {data && !savedWallets.includes(m) && <Chip color={GREEN}>Unsaved</Chip>}
              {isOwner && (
                <button
                  onClick={() => setDraft(list.filter(x => x !== m))}
                  aria-label={`Remove ${m}`}
                  style={{ background: 'transparent', border: 'none', color: RED, cursor: 'pointer', padding: '5px 0', fontSize: 12.5, fontFamily: SANS }}
                >
                  Remove
                </button>
              )}
            </Row>
          ))}

          {isOwner ? (
            <>
              {adding ? (
                <form
                  onSubmit={e => { e.preventDefault(); add() }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: `1px solid ${BORDER}` }}
                >
                  <input
                    autoFocus
                    value={input}
                    onChange={e => { setInput(e.target.value); setInputError(null) }}
                    onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setInput(''); setInputError(null) } }}
                    placeholder="Wallet (0x…)"
                    spellCheck={false}
                    autoComplete="off"
                    style={{ width: '100%', boxSizing: 'border-box', background: BG, border: `1px solid ${inputError ? RED : BORDER}`, borderRadius: 8, padding: '8px 10px', color: TEXT, fontFamily: MONO, fontSize: 13, outline: 'none' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => { setAdding(false); setInput(''); setInputError(null) }} style={{ background: 'transparent', border: 'none', color: TEXT2, fontSize: 13, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', padding: '7px 6px' }}>Cancel</button>
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, fontFamily: SANS, cursor: input.trim() ? 'pointer' : 'not-allowed', opacity: input.trim() ? 1 : 0.4 }}
                    >
                      Add
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setAdding(true)} style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Add Moderator
                  </button>
                </div>
              )}
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
                        onClick={() => { setDraft(savedWallets); setSaveError(null) }}
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

              <p style={{ margin: '14px 0 0', color: MUTED, fontSize: 12.5, lineHeight: 1.5 }}>
                Moderators can set up email alerts in their Settings.
              </p>
            </>
          ) : (
            <p style={{ margin: '10px 0 0', color: MUTED, fontSize: 12.5 }}>Only this board's owner can change its moderators.</p>
          )}
        </div>
      )}

    </div>
  )
}
