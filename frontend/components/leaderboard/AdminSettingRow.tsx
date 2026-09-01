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
import type { Abi } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { MONO, PINK, BG, BG2, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'

const RED = '#FF8E8E'
const AMBER = '#FFB020'

export interface AdminSettingRowProps {
  label: string
  contractAddress: `0x${string}`
  abi: Abi
  getterName: string
  setterName: string
  inputType: 'address' | 'uint256' | 'bool'
  /** 'confirm' (setAdmin-grade, irreversible) requires retyping the value; 'warn' just shows a caption. */
  dangerous?: 'confirm' | 'warn'
  warning?: string
  onSuccess?: () => void
}

function formatCurrent(inputType: AdminSettingRowProps['inputType'], value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (inputType === 'bool') return value ? 'Enabled' : 'Disabled'
  return String(value)
}

export function AdminSettingRow({ label, contractAddress, abi, getterName, setterName, inputType, dangerous, warning, onSuccess }: AdminSettingRowProps) {
  const { chain } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: current, refetch } = useReadContract({
    address: contractAddress, abi, functionName: getterName, chainId: CANONICAL_CHAIN.id,
  })

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [confirmValue, setConfirmValue] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const { writeContractAsync, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: CANONICAL_CHAIN.id })

  useEffect(() => {
    if (!isSuccess) return
    refetch()
    setEditing(false)
    setValue('')
    setConfirmValue('')
    reset()
    onSuccess?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const isWrongChain = !!chain && chain.id !== CANONICAL_CHAIN.id
  const busy = isPending || isConfirming

  function startEdit() {
    setLocalError(null)
    setValue(inputType === 'bool' ? String(!current) : current !== undefined ? String(current) : '')
    setConfirmValue('')
    setEditing(true)
  }

  async function handleSave() {
    setLocalError(null)
    if (isWrongChain) { switchChain({ chainId: CANONICAL_CHAIN.id }); return }
    if (dangerous === 'confirm' && confirmValue.trim().toLowerCase() !== value.trim().toLowerCase()) {
      setLocalError('Retyped value does not match -- confirm you have the right address before submitting.')
      return
    }
    try {
      let arg: unknown = value.trim()
      if (inputType === 'uint256') arg = BigInt(value.trim())
      if (inputType === 'bool') arg = value.trim() === 'true'
      await writeContractAsync({
        address: contractAddress, abi, functionName: setterName, args: [arg], chainId: CANONICAL_CHAIN.id,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      setLocalError(msg.length > 180 ? `${msg.slice(0, 180)}…` : msg)
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
    border: `1px solid ${BORDER}`, borderRadius: 7, padding: '8px 10px',
    fontFamily: MONO, fontSize: 13, outline: 'none',
  }
  const btnStyle = (variant: 'primary' | 'ghost') => ({
    fontFamily: MONO, fontSize: 12, fontWeight: 700, borderRadius: 7, padding: '7px 14px', cursor: 'pointer',
    border: variant === 'primary' ? 'none' : `1px solid ${BORDER}`,
    background: variant === 'primary' ? (dangerous === 'confirm' ? RED : PINK) : 'transparent',
    color: variant === 'primary' ? BG : TEXT2,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 0.3 }}>{label}</div>
          {!editing && (
            <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, marginTop: 2, wordBreak: 'break-all' }}>
              {formatCurrent(inputType, current)}
            </div>
          )}
        </div>
        {!editing && (
          <button onClick={startEdit} style={btnStyle('ghost')}>Change</button>
        )}
      </div>

      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>
          {warning && dangerous === 'warn' && (
            <p style={{ margin: 0, fontSize: 11.5, color: AMBER, lineHeight: 1.5 }}>{warning}</p>
          )}
          {inputType === 'bool' ? (
            <select value={value} onChange={e => setValue(e.target.value)} style={inputStyle}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : (
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={inputType === 'address' ? '0x…' : 'New value'}
              style={inputStyle}
              disabled={busy}
            />
          )}
          {dangerous === 'confirm' && (
            <>
              <p style={{ margin: 0, fontSize: 11.5, color: RED, lineHeight: 1.5 }}>
                {warning ?? 'This cannot be undone from here. Retype the value above to confirm.'}
              </p>
              <input
                value={confirmValue}
                onChange={e => setConfirmValue(e.target.value)}
                placeholder="Retype to confirm"
                style={inputStyle}
                disabled={busy}
              />
            </>
          )}
          {localError && <p style={{ margin: 0, fontSize: 12, color: RED }}>{localError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={busy || switching || !value.trim()} style={{ ...btnStyle('primary'), opacity: busy || switching || !value.trim() ? 0.5 : 1 }}>
              {isWrongChain ? 'Switch to Base' : busy ? 'Confirming…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setLocalError(null) }} disabled={busy} style={btnStyle('ghost')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
