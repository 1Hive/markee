'use client'

// One generic admin-only contract-setting control, reused for every setter on both
// LeaderboardV11ABI (fixed/"For Sale" boards) and StreamingLeaderboardABI (streaming/"For Rent"
// boards) -- every setter has a matching getter with the same underlying value (admin/setAdmin,
// beneficiaryAddress/setBeneficiaryAddress, etc.), so one parameterized component covers all of them
// instead of ~11 near-identical hand-written forms. Follows the same useWriteContract +
// useWaitForTransactionReceipt + chain-switch-guard pattern EditMessageModal already uses -- this is
// the first place on the account page itself that writes to a contract directly (everywhere else on
// that page delegates to a dedicated modal), so it's a standalone component rather than inlined.

import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { formatEther, isAddress, parseEther, type Abi } from 'viem'
import { Check, Copy } from 'lucide-react'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { MONO, PINK, GREEN, BG, TEXT, TEXT2, MUTED, BORDER, SANS, DANGER, AMBER } from '@/lib/design-tokens'

export interface AdminSettingRowProps {
  label: string
  contractAddress: `0x${string}`
  abi: Abi
  getterName: string
  setterName: string
  inputType: 'address' | 'uint256' | 'bool'
  /** uint256 wei values shown and entered in ETH ('ethPerMonth' adds a /mo suffix). */
  unit?: 'eth' | 'ethPerMonth'
  ethPrice?: number | null
  /** 'confirm' (setAdmin-grade, irreversible) requires ticking an acknowledgement; 'warn' just shows a caption. */
  dangerous?: 'confirm' | 'warn'
  warning?: string
  /** Returns an error for the typed value, or null when it can be saved. */
  validate?: (value: string) => string | null
  /** Amber note under the current value, e.g. a price far above what bidders pay. */
  warnIf?: (current: bigint) => string | null
  /** Label of the acknowledgement checkbox for dangerous="confirm". */
  acknowledge?: string
  onSuccess?: () => void
}

function fmtAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function trimEth(wei: bigint): string {
  return formatEther(wei).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
}

function CopyAddr({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(addr).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span title={addr} style={{ fontFamily: MONO, fontSize: 13, color: TEXT }}>{fmtAddr(addr)}</span>
      <button onClick={copy} title="Copy address" style={{ display: 'flex', background: 'transparent', border: 'none', color: copied ? GREEN : MUTED, cursor: 'pointer', padding: 2 }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  )
}

export function AdminSettingRow({ label, contractAddress, abi, getterName, setterName, inputType, unit, ethPrice, dangerous, warning, validate, warnIf, acknowledge, onSuccess }: AdminSettingRowProps) {
  const { chain } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: current, refetch } = useReadContract({
    address: contractAddress, abi, functionName: getterName, chainId: CANONICAL_CHAIN.id,
  })

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const { writeContractAsync, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: CANONICAL_CHAIN.id })

  useEffect(() => {
    if (!isSuccess) return
    refetch()
    setEditing(false)
    setValue('')
    setAcknowledged(false)
    reset()
    onSuccess?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const isWrongChain = !!chain && chain.id !== CANONICAL_CHAIN.id
  const typed = value.trim()
  const inputError = !typed ? null
    : inputType === 'address' && !isAddress(typed) ? 'Enter a full wallet address (0x + 40 characters).'
    : validate?.(typed) ?? null
  const busy = isPending || isConfirming
  const suffix = unit === 'ethPerMonth' ? 'ETH / mo' : unit === 'eth' ? 'ETH' : inputType === 'uint256' ? 'chars' : null

  function startEdit() {
    setLocalError(null)
    setValue(
      inputType === 'bool' ? String(!current)
        : current === undefined ? ''
        : unit && typeof current === 'bigint' ? trimEth(current)
        : String(current),
    )
    setAcknowledged(false)
    setEditing(true)
  }

  async function handleSave() {
    setLocalError(null)
    if (isWrongChain) { switchChain({ chainId: CANONICAL_CHAIN.id }); return }
    const invalid = inputError
    if (invalid) { setLocalError(invalid); return }
    let arg: unknown = value.trim()
    try {
      if (inputType === 'uint256') arg = unit ? parseEther(value.trim()) : BigInt(value.trim())
      if (inputType === 'bool') arg = value.trim() === 'true'
    } catch {
      setLocalError(unit ? 'Enter an amount in ETH.' : 'Enter a whole number.')
      return
    }
    try {
      await writeContractAsync({
        address: contractAddress, abi, functionName: setterName, args: [arg], chainId: CANONICAL_CHAIN.id,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      if (/reject|denied/i.test(msg)) return
      setLocalError(msg.length > 180 ? `${msg.slice(0, 180)}…` : msg)
    }
  }

  const ghostBtn: React.CSSProperties = { background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: BG, color: TEXT,
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 10px',
    fontFamily: MONO, fontSize: 13, outline: 'none',
  }
  const pending = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: TEXT2, whiteSpace: 'nowrap' }}>
      <span style={{ width: 12, height: 12, borderRadius: 99, border: `2px solid ${BORDER}`, borderTopColor: PINK, animation: 'spin 0.8s linear infinite' }} />
      Confirm in wallet…
    </span>
  )

  const viewWarning = warnIf && typeof current === 'bigint' ? warnIf(current) : null
  let view: React.ReactNode = <span style={{ color: MUTED }}>-</span>
  if (current !== undefined && current !== null) {
    if (inputType === 'address') view = <CopyAddr addr={String(current)} />
    else if (inputType === 'bool') view = <b style={{ color: TEXT }}>{current ? 'Enabled' : 'Disabled'}</b>
    else if (unit && typeof current === 'bigint') {
      const eth = Number(current) / 1e18
      view = (
        <span>
          <b style={{ color: viewWarning ? AMBER : TEXT }}>{trimEth(current)} ETH{unit === 'ethPerMonth' ? '/mo' : ''}</b>
          {ethPrice ? <span style={{ color: MUTED }}> · ≈ ${(eth * ethPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : null}
        </span>
      )
    } else view = <b style={{ color: TEXT }}>{String(current)}</b>
  }

  if (dangerous === 'confirm') {
    if (!editing) {
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={startEdit} style={{ background: 'transparent', border: `1px solid ${DANGER}`, borderRadius: 8, padding: '9px 16px', color: DANGER, fontSize: 13, fontWeight: 700, fontFamily: SANS, cursor: 'pointer' }}>{label}</button>
        </div>
      )
    }
    const ready = !!typed && !inputError && acknowledged
    return (
      <div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: DANGER }}>{label}</div>
        {warning && <p style={{ margin: '8px 0 12px', fontSize: 13, color: TEXT2, lineHeight: 1.55, maxWidth: '52ch' }}>{warning}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="New admin wallet (0x…)" disabled={busy} style={{ ...inputStyle, borderColor: inputError ? 'rgba(255,138,155,0.5)' : BORDER }} />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 4, fontSize: 13, color: TEXT2, cursor: 'pointer', lineHeight: 1.45, fontFamily: SANS }}>
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} disabled={busy} style={{ marginTop: 2, accentColor: DANGER }} />
            {acknowledge ?? 'I understand this cannot be undone from here'}
          </label>
        </div>
        {localError && <p style={{ margin: '8px 0 0', fontSize: 12, color: DANGER }}>{localError}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14 }}>
          {busy ? pending : (
            <>
              <button onClick={() => { setEditing(false); setLocalError(null) }} style={{ ...ghostBtn, border: 'none' }}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={!ready || switching}
                style={{ background: 'transparent', color: DANGER, border: `1px solid ${DANGER}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: SANS, cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.4 }}
              >
                {isWrongChain ? 'Switch to Base' : label}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '11px 0', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: TEXT2 }}>{label}</span>
        {!editing ? (
          <span style={{ fontSize: 13.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view}</span>
        ) : inputType === 'bool' ? (
          <select value={value} onChange={e => setValue(e.target.value)} disabled={busy} style={inputStyle}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        ) : (
          <span style={{ position: 'relative', minWidth: 0 }}>
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && typed && !inputError) handleSave(); if (e.key === 'Escape') setEditing(false) }}
              placeholder={inputType === 'address' ? '0x…' : undefined}
              disabled={busy}
              style={{ ...inputStyle, paddingRight: suffix ? 70 : 10 }}
            />
            {suffix && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: MONO, fontSize: 11, color: MUTED }}>{suffix}</span>}
          </span>
        )}
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
          {!editing ? (
            <button onClick={startEdit} style={ghostBtn}>Edit</button>
          ) : busy ? pending : (
            <>
              <button onClick={() => { setEditing(false); setLocalError(null) }} style={{ ...ghostBtn, border: 'none', padding: '5px 6px' }}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={!typed || !!inputError || switching}
                style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: typed && !inputError ? 'pointer' : 'not-allowed', fontFamily: SANS, opacity: typed && !inputError ? 1 : 0.4 }}
              >
                {isWrongChain ? 'Switch to Base' : 'Save'}
              </button>
            </>
          )}
        </span>
      </div>
      {editing && warning && dangerous === 'warn' && <div style={{ fontSize: 12, color: AMBER, marginTop: 6, paddingLeft: 182, lineHeight: 1.45 }}>{warning}</div>}
      {editing && inputError && <div style={{ fontSize: 12, color: DANGER, marginTop: 6, paddingLeft: 182 }}>{inputError}</div>}
      {!editing && viewWarning && <div style={{ fontSize: 12, color: AMBER, marginTop: 6, paddingLeft: 182, lineHeight: 1.45 }}>{viewWarning}</div>}
      {localError && <div style={{ fontSize: 12, color: DANGER, marginTop: 6, paddingLeft: 182 }}>{localError}</div>}
    </div>
  )
}
