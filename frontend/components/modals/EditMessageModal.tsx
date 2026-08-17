'use client'

import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { useAccount } from 'wagmi'
import { TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { TxProgress } from '@/components/modals/StreamUI'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { formatTransactionError } from '@/lib/transactionErrors'
import { MONO, PINK, BG2, BG, TEXT, MUTED, BORDER } from '@/lib/design-tokens'

const MAX_LEN = 222

interface EditMessageModalProps {
  isOpen: boolean
  onClose: () => void
  strategyAddress: `0x${string}`
  markeeAddress: `0x${string}`
  currentMessage: string
  onSuccess?: () => void
}

export function EditMessageModal({
  isOpen,
  onClose,
  strategyAddress,
  markeeAddress,
  currentMessage,
  onSuccess,
}: EditMessageModalProps) {
  const { hasActiveWalletConnection } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isOpen) return
    setMessage('')
    setError(null)
    reset()
  }, [isOpen, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 1500)
    }
  }, [isSuccess, isOpen, onSuccess, onClose])

  useEffect(() => {
    if (isError && writeError) setError(formatTransactionError(writeError))
  }, [isError, writeError])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id
  const txStep = isPending ? 'signing' : isConfirming ? 'pending' : isSuccess ? 'success' : null
  const canSubmit = message.trim().length > 0 && !isPending && !isConfirming && !isSuccess && hasActiveWalletConnection && !isWrongChain

  const handleSubmit = () => {
    if (!canSubmit) return
    setError(null)
    writeContract({
      address: strategyAddress,
      abi: TopDawgPartnerStrategyABI,
      functionName: 'updateMessage',
      args: [markeeAddress, message],
      chainId: CANONICAL_CHAIN.id,
    })
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 180ms ease forwards' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 500, background: BG2, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', color: TEXT, fontFamily: 'Manrope, system-ui, sans-serif', animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            EDIT MESSAGE
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {txStep ? (
          <TxProgress
            isSuccess={txStep === 'success'}
            headline={txStep === 'signing' ? 'Waiting for wallet…' : txStep === 'pending' ? 'Confirming on Base' : 'Message updated!'}
            detail={txStep === 'signing' ? 'Sign the transaction in your wallet.' : txStep === 'pending' ? 'Usually under 2 seconds on Base.' : 'Your message has been updated on the leaderboard.'}
          />
        ) : isWrongChain ? (
          <div style={{ padding: '48px 22px', textAlign: 'center' }}>
            <p style={{ color: MUTED, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to continue.</p>
            <button
              onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              Switch to Base
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: '22px 22px 0' }}>
              {/* Current message */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Current Message</div>
                <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {currentMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message set</span>}
                </div>
              </div>

              {/* New message textarea */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Your Message</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MAX_LEN))}
                  placeholder="Enter your new message..."
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontFamily: MONO, fontSize: 13, outline: 'none', resize: 'vertical' }}
                  onFocus={e => { e.target.style.borderColor = PINK }}
                  onBlur={e => { e.target.style.borderColor = BORDER }}
                  disabled={isPending || isConfirming}
                />
                <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 4, fontFamily: MONO }}>{message.length}/{MAX_LEN}</div>
              </div>

              {error && <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>{error}</p>}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>As the message owner, only you can update.</span>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', flexShrink: 0, opacity: canSubmit ? 1 : 0.4, transition: 'opacity 140ms' }}
              >
                Update Message
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
