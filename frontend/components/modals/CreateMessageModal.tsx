'use client'

import { useState, useEffect } from 'react'
import { decodeEventLog, type Address } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'

// ── Theme tokens (shared with StreamModal) ─────────────────────────────────────
const BG = '#060A2A'
const BG2 = '#0A0F3D'
const PINK = '#F897FE'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED = '#8A8FBF'
const TEXT = '#EDEEFF'
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"

const MARKEE_CREATED_ABI = [
  {
    type: 'event',
    name: 'MarkeeCreated',
    inputs: [
      { name: 'markeeAddress', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'message', type: 'string', indexed: false },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
] as const

// Free createMarkee on a streaming board, then hands the new markee back so the caller can chain
// into StreamModal to back it. Shared by the board detail page and the marketplace row.
export function CreateMessageModal({
  board,
  onClose,
  onCreated,
}: {
  board: Address
  onClose: () => void
  onCreated: (address: Address, message: string, name: string) => void
}) {
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== board.toLowerCase()) continue
      try {
        const ev = decodeEventLog({ abi: MARKEE_CREATED_ABI, data: log.data, topics: log.topics })
        if (ev.eventName === 'MarkeeCreated') {
          onCreated(ev.args.markeeAddress, ev.args.message, ev.args.name)
          return
        }
      } catch {
        // not the MarkeeCreated event, keep scanning
      }
    }
    setError('Created, but could not read the new message address. Refresh the leaderboard.')
  }, [isSuccess, receipt, board, onCreated])

  const submit = () => {
    setError(null)
    if (!message.trim()) { setError('Enter a message.'); return }
    reset()
    writeContract({
      address: board,
      abi: StreamingLeaderboardABI,
      functionName: 'createMarkee',
      args: [message, name],
      chainId: CANONICAL_CHAIN.id,
    })
  }

  const busy = isPending || isConfirming || isSuccess

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: BG2, borderRadius: 16, border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)', color: TEXT, overflow: 'hidden',
          fontFamily: 'Manrope, system-ui, sans-serif',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>Add a message</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isCorrectChain ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ color: '#B8B6D9', marginBottom: 16, fontSize: 14 }}>Switch to {CANONICAL_CHAIN.name} to add a message.</p>
              <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={primaryBtn}>Switch to Base</button>
            </div>
          ) : (
            <>
              <label style={{ display: 'block' }}>
                <div style={fieldLabel}>Message</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Your message on the board"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <label style={{ display: 'block' }}>
                <div style={fieldLabel}>Name (optional)</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="who's this from" style={inputStyle} />
              </label>
              <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                {isSuccess ? 'Opening stream…' : isConfirming ? 'Creating…' : isPending ? 'Confirm in wallet' : 'Create message'}
              </button>
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Creating a message is free. You back it with a stream next, which sets its rank.
              </div>
            </>
          )}
          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}

const fieldLabel: React.CSSProperties = {
  fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: BG, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontFamily: MONO, fontSize: 13, outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
  background: PINK, color: BG, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer',
}
