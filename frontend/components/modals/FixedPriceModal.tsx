'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { formatUsd } from '@/lib/utils'
import { estimateDirectRevnetMarkeeTokens } from '@/lib/tokenPhases'
import { TxProgress, PaymentReviewCard, PaymentReviewFooter } from '@/components/modals/StreamUI'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'
import { MONO, PINK, BLUE, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'

// ── Design tokens ─────────────────────────────────────────────────────────────
const FAST_TX_GAS_RESERVE = parseEther('0.0002')

// ── Disabled-button tooltip ───────────────────────────────────────────────────
function BtnTooltip({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => reason && setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && reason && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
          background: BG2, border: `1px solid ${BORDER}`,
          borderRadius: 8, padding: '7px 12px',
          fontFamily: MONO, fontSize: 11, color: MUTED,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 10,
        }}>
          {reason}
        </div>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface FixedPriceModalProps {
  isOpen: boolean
  onClose: () => void
  fixedMarkee: FixedMarkee | null
  onSuccess?: () => void
}

export function FixedPriceModal({ isOpen, onClose, fixedMarkee, onSuccess }: FixedPriceModalProps) {
  const { activeAddress, hasWallet, hasActiveWalletConnection, isWalletConnectionPending } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { data: balanceData } = useBalance({ address: activeAddress as `0x${string}` | undefined, chainId: CANONICAL_CHAIN.id })

  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const [newMessage, setNewMessage] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const priceWei: bigint = fixedMarkee?.priceWei ? BigInt(fixedMarkee.priceWei) : 0n
  const priceEth = formatEther(priceWei)
  const priceEthNum = parseFloat(priceEth)
  const priceUsd = ethPrice && priceWei > 0n ? priceEthNum * ethPrice : null
  const markeeEarned = Math.round(estimateDirectRevnetMarkeeTokens(priceEthNum))
  const maxLen = fixedMarkee?.maxMessageLength ?? 222
  const maxNameLen = 32

  useEffect(() => {
    if (isOpen && fixedMarkee) { setNewMessage(''); setName(''); setError(null); setHasUserEdited(false); setReviewOpen(false); reset() }
  }, [isOpen, fixedMarkee, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => { onSuccess?.(); onClose() }, 2000)
    }
  }, [isSuccess, onClose, isOpen, onSuccess])

  useEffect(() => {
    if (writeError) logTransactionError(writeError, 'FixedPriceModal')
  }, [writeError])

  const txStep = isPending ? 'signing' : isConfirming ? 'pending' : isSuccess ? 'success' : null
  const blockBackdropClose = hasUserEdited && !txStep

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (blockBackdropClose) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, blockBackdropClose, onClose])

  const canAfford = () => {
    if (!balanceData || priceWei === 0n) return false
    return balanceData.value >= priceWei + FAST_TX_GAS_RESERVE
  }
  const insufficientBalance = priceWei > 0n && !canAfford()
  const balanceWarning = insufficientBalance ? `You don't have enough ETH after reserving ${formatEther(FAST_TX_GAS_RESERVE)} ETH for gas.` : null

  const handleChangeMessage = async () => {
    if (!fixedMarkee || !hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!newMessage.trim()) { setError('Please enter a message'); return }
    if (priceWei === 0n) { setError('Unable to load price'); return }
    if (newMessage.length > maxLen) { setError(`Message must be ${maxLen} characters or less`); return }
    if (!canAfford()) { setError(balanceWarning || 'Insufficient balance'); return }
    setError(null)
    try {
      writeContract({
        address: fixedMarkee.strategyAddress as `0x${string}`,
        abi: FixedPriceStrategyABI,
        functionName: 'changeMessage',
        args: [newMessage, name.trim()],
        value: priceWei,
        chainId: CANONICAL_CHAIN.id,
      })
    } catch (err) {
      logTransactionError(err, 'FixedPriceModal.changeMessage')
      setError(formatTransactionError(err))
    }
  }

  if (!isOpen || !fixedMarkee) return null

  const isOverLimit = newMessage.length > maxLen
  const transactionError = error || (isError ? formatTransactionError(writeError) : null)

  const btnDisabled = isPending || isConfirming || isSuccess || !newMessage.trim() || insufficientBalance || isOverLimit
  const btnDisabledReason = !btnDisabled || isSuccess ? null
    : (isPending || isConfirming) ? 'Transaction in progress'
    : insufficientBalance ? 'Insufficient ETH balance'
    : isOverLimit ? 'Message exceeds character limit'
    : !newMessage.trim() ? 'Enter a message to continue'
    : null

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
    fontFamily: MONO, fontSize: 13, outline: 'none',
  }
  // The message field is the emphasized input (matches MarkeeSignModal/StreamSignModal/
  // BuyMessageModal's convention) -- attention lands on what you're saying before what you're paying.
  const messageBoxStyle = {
    ...inputStyle,
    border: `1.5px solid ${PINK}`,
    boxShadow: '0 0 24px rgba(248,151,254,0.08)',
  }

  return (
    <div
      onClick={() => {
        if (!blockBackdropClose) onClose()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeIn 180ms ease forwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: BG2, borderRadius: 16,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'Manrope, system-ui, sans-serif',
          color: TEXT, overflow: 'visible',
          animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            Change Message
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        {/* ── Tx state panel ── */}
        {txStep ? (
          <TxProgress
            isSuccess={txStep === 'success'}
            headline={
              txStep === 'signing' ? 'Waiting for wallet…' :
              txStep === 'pending' ? 'Confirming on Base' :
              'Success! Message updated'
            }
          />

        ) : isWalletConnectionPending ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Preparing your wallet connection...</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : !hasWallet || !hasActiveWalletConnection ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : isWrongChain ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to use Markee.</p>
            <button
              onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              Switch to Base
            </button>
          </div>

        ) : (
          <>
            {/* ── Body ── */}
            <div style={{ padding: '22px 22px 0', overflowY: 'auto', flex: 1 }}>

              {reviewOpen ? (
                <PaymentReviewCard
                  kind="fixed"
                  message={newMessage}
                  amountLabel={`${priceEth} ETH`}
                  amountUsd={priceUsd != null ? formatUsd(priceUsd) : null}
                  markeeEarnedLabel={`${markeeEarned.toLocaleString()} MARKEE`}
                  willWin
                />
              ) : (
                <>
                  {/* Current message (if set) */}
                  {fixedMarkee.message && (
                    <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', marginBottom: 18 }}>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Current message</div>
                      <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45 }}>{fixedMarkee.message}</div>
                    </div>
                  )}

                  {/* SET YOUR MESSAGE */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                      Set Your Message
                    </div>
                    <textarea
                      value={newMessage}
                      onChange={e => { setHasUserEdited(true); setNewMessage(e.target.value.slice(0, maxLen)) }}
                      placeholder="Your message here..."
                      rows={2}
                      style={{ ...messageBoxStyle, resize: 'vertical', borderColor: isOverLimit ? '#FF8E8E' : PINK }}
                      disabled={isPending || isConfirming}
                    />
                    <div style={{ fontSize: 11, color: newMessage.length > maxLen - 20 ? PINK : MUTED, textAlign: 'right', marginTop: 4, fontFamily: MONO }}>
                      {newMessage.length}/{maxLen}
                    </div>
                  </div>

                  {/* YOUR NAME (optional) — shown before the wallet address wherever this message appears */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                      Your Name (optional)
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={e => { setHasUserEdited(true); setName(e.target.value.slice(0, maxNameLen)) }}
                      placeholder="tell the world who wrote this..."
                      style={inputStyle}
                      disabled={isPending || isConfirming}
                    />
                  </div>

                  {/* Price card — fixed price, no MIN/MAX/WIN presets */}
                  <div style={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    background: BG,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: TEXT }}>{priceEth}</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETH</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 12, color: MUTED }}>
                      <span>
                        {priceUsd != null ? `≈ ${formatUsd(priceUsd)}` : ' '}
                      </span>
                      <span>
                        {balanceData ? `Balance ${parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH` : ''}
                      </span>
                    </div>
                  </div>

                  {/* You'll receive — horizontal */}
                  {priceEthNum > 0 && (
                    <div style={{
                      marginTop: 12, borderRadius: 14, padding: '14px 20px',
                      background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))',
                      border: `1px solid rgba(248,151,254,0.35)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ color: PINK, fontSize: 14, fontWeight: 600, fontFamily: 'Manrope, system-ui, sans-serif' }}>You&apos;ll receive</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: -0.5 }}>
                          {markeeEarned.toLocaleString()}
                        </span>
                        <span style={{ color: PINK, fontSize: 13, fontWeight: 700 }}>MARKEE</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Error */}
              {!reviewOpen && transactionError && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '14px 0 0' }}>
                  {transactionError}
                </p>
              )}

              <div style={{ height: 18 }} />
            </div>

            {/* ── Footer ── */}
            <div style={{
              padding: '14px 22px', borderTop: `1px solid ${BORDER}`,
              background: 'rgba(6,10,42,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              flexShrink: 0,
            }}>
              {reviewOpen ? (
                <div style={{ width: '100%' }}>
                  <PaymentReviewFooter
                    onBack={() => setReviewOpen(false)}
                    onConfirm={handleChangeMessage}
                    busy={isPending || isConfirming}
                    error={transactionError}
                  />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                    100% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a>
                  </div>
                  <BtnTooltip reason={btnDisabledReason}>
                    <button
                      onClick={() => setReviewOpen(true)}
                      disabled={btnDisabled}
                      style={{
                        background: PINK, color: BG, border: 'none', borderRadius: 8,
                        padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                        cursor: btnDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                        opacity: btnDisabled ? 0.4 : 1,
                        transition: 'opacity 140ms',
                      }}
                    >
                      Review Payment Info
                    </button>
                  </BtnTooltip>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
