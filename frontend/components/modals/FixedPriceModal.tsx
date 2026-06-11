'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { CreditCard } from 'lucide-react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { useEthPrice } from '@/hooks/useEthPrice'
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

// ── ABIs ──────────────────────────────────────────────────────────────────────
const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

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
function calculateMarkeeTokens(eth: number) { return eth * 0.38 * getCurrentPhaseRate() * 0.62 }

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
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address, chainId: CANONICAL_CHAIN.id })
  const { fundWallet } = useFundWallet({ onUserExited: () => { refetchBalance() } })

  const { data: adminAddress } = useReadContract({
    address: fixedMarkee?.strategyAddress as `0x${string}`,
    abi: ADMIN_ABI,
    functionName: 'admin',
    chainId: CANONICAL_CHAIN.id,
    query: { enabled: !!fixedMarkee?.strategyAddress },
  })

  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const priceWei: bigint = fixedMarkee?.priceWei ? BigInt(fixedMarkee.priceWei) : 0n
  const priceEth = formatEther(priceWei)
  const priceEthNum = parseFloat(priceEth)
  const priceUsd = ethPrice && priceWei > 0n ? priceEthNum * ethPrice : null
  const revNetEnabled = fixedMarkee?.revNetEnabled ?? false
  const markeeEarned = Math.round(calculateMarkeeTokens(priceEthNum))
  const maxLen = fixedMarkee?.maxMessageLength ?? 222

  useEffect(() => {
    if (isOpen && fixedMarkee) { setNewMessage(''); setError(null); reset() }
  }, [isOpen, fixedMarkee, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => { onSuccess?.(); onClose() }, 2000)
    }
  }, [isSuccess, onClose, isOpen, onSuccess])

  const canAfford = () => {
    if (!balanceData || priceWei === 0n) return false
    return balanceData.value >= priceWei + 1000000000000000n
  }
  const insufficientBalance = priceWei > 0n && !canAfford()
  const balanceWarning = insufficientBalance ? "You don't have enough ETH to complete this transaction." : null

  const handleChangeMessage = async () => {
    if (!fixedMarkee || !chain) { setError('Please connect your wallet'); return }
    if (chain.id !== CANONICAL_CHAIN.id) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
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
    } catch (err: any) { setError(err.message || 'Transaction failed') }
  }

  if (!isOpen || !fixedMarkee) return null

  const isOverLimit = newMessage.length > maxLen
  const txStep = isPending ? 'signing' : isConfirming ? 'pending' : isSuccess ? 'success' : null
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
      onClick={onClose}
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

        ) : !isConnected ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: MUTED, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : !isCorrectChain ? (
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
                  onChange={e => setNewMessage(e.target.value.slice(0, maxLen))}
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
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontSize: 12, color: MUTED, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>Balance: {parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH</span>
                      {ethPrice && <span style={{ color: BLUE }}>{formatUsd(parseFloat(formatEther(balanceData.value)) * ethPrice)}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* MARKEE token estimate */}
              {revNetEnabled && priceEthNum > 0 && (
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
                  {authenticated && address && (
                    <button
                      onClick={() => fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount: priceEth } })}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      <CreditCard size={13} />
                      Fund with card
                    </button>
                  )}
                </div>
              )}

              {/* Error */}
              {(error || isError) && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>
                  {error || writeError?.message}
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
                {adminAddress
                  ? <>62% to <a href={`https://basescan.org/address/${adminAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>{adminAddress.slice(0, 6)}…{adminAddress.slice(-4)}</a> · 38% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a></>
                  : <>62% to the integration owner · 38% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a></>}
              </div>
              <button
                onClick={handleChangeMessage}
                disabled={isPending || isConfirming || isSuccess || !newMessage.trim() || insufficientBalance || isOverLimit}
                style={{
                  background: PINK, color: BG, border: 'none', borderRadius: 8,
                  padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  opacity: (isPending || isConfirming || isSuccess || !newMessage.trim() || insufficientBalance || isOverLimit) ? 0.4 : 1,
                  transition: 'opacity 140ms',
                }}
              >
                Change Message
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
