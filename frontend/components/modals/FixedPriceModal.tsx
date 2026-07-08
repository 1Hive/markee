'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { formatEther } from 'viem'
import { CreditCard } from 'lucide-react'
import { usePrivy, useFundWallet, useWallets } from '@privy-io/react-auth'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { formatUsd } from '@/lib/utils'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BG     = '#060A2A'
const BG2    = '#0A0F3D'
const PINK   = '#F897FE'
const BLUE   = '#7C9CFF'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED  = '#8A8FBF'
const TEXT   = '#EDEEFF'
const FAST_TX_GAS_RESERVE = 200000000000000n // 0.0002 ETH

// ── MARKEE phases ─────────────────────────────────────────────────────────────
const PHASES = [
  { rate: 100000, endDate: new Date('2026-03-21T00:00:00Z') },
  { rate: 50000,  endDate: new Date('2026-06-21T00:00:00Z') },
  { rate: 25000,  endDate: new Date('2026-09-21T00:00:00Z') },
  { rate: 12500,  endDate: new Date('2026-12-21T00:00:00Z') },
  { rate: 6250,   endDate: new Date('2027-03-21T00:00:00Z') },
]
function getCurrentPhaseRate() {
  const now = new Date()
  for (const p of PHASES) { if (now < p.endDate) return p.rate }
  return PHASES[PHASES.length - 1].rate
}
// 100% of FixedPrice funds go to the Revnet; buyer receives 62% of issued tokens
function calculateMarkeeTokens(eth: number) { return eth * getCurrentPhaseRate() * 0.62 }

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

// ── TxRing ────────────────────────────────────────────────────────────────────
function TxRing({ step }: { step: 'signing' | 'pending' | 'success' }) {
  const done = step === 'success'
  return (
    <div style={{
      width: 72, height: 72, borderRadius: 99, flexShrink: 0,
      background: done ? PINK : 'transparent',
      border: done ? 'none' : `2px solid ${PINK}`,
      borderTopColor: done ? undefined : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: done ? 'none' : 'spin 1s linear infinite',
      boxShadow: '0 0 32px rgba(248,151,254,0.3)',
    }}>
      {done && (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke={BG} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
  const { authenticated } = usePrivy()
  const { isConnected, chain, address } = useAccount()
  const { wallets } = useWallets()
  const activeAddress = address ?? wallets[0]?.address
  const hasWallet = !!activeAddress || isConnected
  const hasActiveWalletConnection = isConnected && !!address
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address: activeAddress as `0x${string}` | undefined, chainId: CANONICAL_CHAIN.id })
  const { fundWallet } = useFundWallet({ onUserExited: () => { refetchBalance() } })

  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const priceWei: bigint = fixedMarkee?.priceWei ? BigInt(fixedMarkee.priceWei) : 0n
  const priceEth = formatEther(priceWei)
  const priceEthNum = parseFloat(priceEth)
  const priceUsd = ethPrice && priceWei > 0n ? priceEthNum * ethPrice : null
  const markeeEarned = Math.round(calculateMarkeeTokens(priceEthNum))
  const maxLen = fixedMarkee?.maxMessageLength ?? 222

  useEffect(() => {
    if (isOpen && fixedMarkee) { setNewMessage(''); setError(null); setHasUserEdited(false); reset() }
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
        args: [newMessage, ''],
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
  const stepLabel =
    txStep === 'signing' ? 'AWAITING SIGNATURE' :
    txStep === 'pending' ? 'CONFIRMING ONCHAIN' :
    txStep === 'success' ? 'CONFIRMED' :
    'CHANGE MESSAGE'

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
    fontFamily: MONO, fontSize: 13, outline: 'none',
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
          color: TEXT, overflow: 'hidden',
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
            {stepLabel}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        {/* ── Tx state ── */}
        {txStep ? (
          <div style={{ padding: '60px 22px 52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center', flex: 1 }}>
            <TxRing step={txStep} />
            <div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                {txStep === 'signing' && 'Waiting for wallet...'}
                {txStep === 'pending' && 'Transaction pending on Base'}
                {txStep === 'success' && '✓ Message updated'}
              </div>
              <div style={{ color: MUTED, fontSize: 13, maxWidth: 340, lineHeight: 1.5 }}>
                {txStep === 'signing' && 'Sign the transaction in your wallet to complete this purchase.'}
                {txStep === 'pending' && 'Usually under 2 seconds on Base. Sit tight.'}
                {txStep === 'success' && `"${newMessage}" is now the featured message.`}
              </div>
            </div>
          </div>

        ) : !hasWallet || !hasActiveWalletConnection ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: MUTED, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : isWrongChain ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: MUTED, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to use Markee.</p>
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
                  placeholder="the name's mark. agent mark 🕵️"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', borderColor: isOverLimit ? '#FF8E8E' : BORDER }}
                  onFocus={e => { if (!isOverLimit) e.target.style.borderColor = PINK }}
                  onBlur={e => { e.target.style.borderColor = isOverLimit ? '#FF8E8E' : BORDER }}
                  disabled={isPending || isConfirming}
                />
              </div>

              {/* Preview */}
              <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', minHeight: 80, marginBottom: 18 }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color: newMessage ? TEXT : MUTED, minHeight: 40, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {newMessage || 'Your message will appear here...'}
                  {newMessage && <span style={{ color: PINK, animation: 'blink 1s step-end infinite' }}>|</span>}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: MUTED, display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ color: newMessage.length > maxLen - 20 ? PINK : MUTED }}>{newMessage.length}/{maxLen}</span>
                </div>
              </div>

              {/* Price card */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Price</div>
                <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '13px 15px' }}>
                  <div style={{ color: TEXT, fontFamily: MONO, fontSize: 17, fontWeight: 800 }}>{priceEth} ETH</div>
                  {priceUsd && <div style={{ color: BLUE, fontFamily: MONO, fontSize: 12, marginTop: 2 }}>{formatUsd(priceUsd)}</div>}
                  <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>Fixed price to set the featured message</div>
                  {balanceData && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontSize: 12, color: MUTED, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>
                        Balance: {parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH
                        <span style={{ opacity: 0.72 }}> ({formatEther(FAST_TX_GAS_RESERVE)} ETH kept for gas)</span>
                      </span>
                      {ethPrice && <span style={{ color: BLUE }}>{formatUsd(parseFloat(formatEther(balanceData.value)) * ethPrice)}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* MARKEE token estimate */}
              {priceEthNum > 0 && (
                <div style={{ marginBottom: 18, borderRadius: 14, padding: '22px 20px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))', border: `1px solid rgba(248,151,254,0.35)` }}>
                  <div style={{ color: PINK, fontSize: 15, marginBottom: 6 }}>You&apos;ll receive</div>
                  <div style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: -1 }}>{markeeEarned.toLocaleString()}</div>
                  <div style={{ color: PINK, fontSize: 15, marginTop: 8 }}>MARKEE tokens</div>
                </div>
              )}

              {/* Insufficient balance + fund card */}
              {insufficientBalance && balanceWarning && (
                <div style={{ borderRadius: 10, border: '1px solid rgba(255,165,0,0.3)', background: 'rgba(255,165,0,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 13, color: '#FFA94D', fontWeight: 600 }}>Insufficient balance</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,169,77,0.8)' }}>{balanceWarning}</p>
                  </div>
                  {authenticated && activeAddress && (
                    <button
                      onClick={() => fundWallet({ address: activeAddress, options: { chain: CANONICAL_CHAIN, amount: priceEth } })}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      <CreditCard size={13} />
                      Fund with card
                    </button>
                  )}
                </div>
              )}

              {/* Error */}
              {transactionError && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>
                  {transactionError}
                </p>
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{
              padding: '14px 22px', borderTop: `1px solid ${BORDER}`,
              background: 'rgba(6,10,42,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                100% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a>
              </div>
              <BtnTooltip reason={btnDisabledReason}>
                <button
                  onClick={handleChangeMessage}
                  disabled={btnDisabled}
                  style={{
                    background: PINK, color: BG, border: 'none', borderRadius: 8,
                    padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                    cursor: btnDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: btnDisabled ? 0.4 : 1,
                    transition: 'opacity 140ms',
                  }}
                >
                  Change Message
                </button>
              </BtnTooltip>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
