'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { CreditCard } from 'lucide-react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { TopDawgStrategyABI, TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useSuperfluidPoints } from '@/lib/superfluid/useSuperfluidPoints'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import type { Markee } from '@/types'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BG   = '#060A2A'
const BG2  = '#0A0F3D'
const PINK = '#F897FE'
const BLUE = '#7C9CFF'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED  = '#8A8FBF'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'

// ── MARKEE token phases ───────────────────────────────────────────────────────
const PHASES = [
  { rate: 100000, endDate: new Date('2026-03-21T00:00:00Z') },
  { rate: 50000,  endDate: new Date('2026-06-21T00:00:00Z') },
  { rate: 25000,  endDate: new Date('2026-09-21T00:00:00Z') },
  { rate: 12500,  endDate: new Date('2026-12-21T00:00:00Z') },
  { rate: 6250,   endDate: new Date('2027-03-21T00:00:00Z') },
]

function getCurrentPhaseRate(): number {
  const now = new Date()
  for (const phase of PHASES) {
    if (now < phase.endDate) return phase.rate
  }
  return PHASES[PHASES.length - 1].rate
}

function calculateMarkeeTokens(ethAmount: number): number {
  return ethAmount * 0.38 * getCurrentPhaseRate() * 0.62
}

const REV_NET_ENABLED_ABI = [
  { inputs: [], name: 'revNetEnabled', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const

const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const SUPERFLUID_STRATEGY_ADDRESSES = new Set([
  '0xaa37d049dfbfc07f9e8526a4a9bde418df9f1b79',
])

// ── Types ─────────────────────────────────────────────────────────────────────
export type MarkeeSlot = { address: string; owner: string; message: string; name?: string; totalFundsAdded: bigint }

// ── Props ─────────────────────────────────────────────────────────────────────
interface BuyMessageModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee?: MarkeeSlot | null
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
  strategyAddress?: `0x${string}`
  partnerName?: string
  partnerSplitPercentage?: number
  topFundsAdded?: bigint
  platformId?: 'github' | 'superfluid'
}

type ModalTab = 'create' | 'addFunds' | 'updateMessage'

// ── Small helpers ─────────────────────────────────────────────────────────────
function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  )
}

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

// ── Main modal ────────────────────────────────────────────────────────────────
export function BuyMessageModal({
  isOpen,
  onClose,
  userMarkee,
  initialMode,
  onSuccess,
  strategyAddress: customStrategyAddress,
  partnerName,
  topFundsAdded,
  platformId,
}: BuyMessageModalProps) {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const { trackBuyMessage, trackAddFunds } = useSuperfluidPoints()

  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address,
    chainId: CANONICAL_CHAIN.id,
  })

  const { fundWallet } = useFundWallet({
    onUserExited: () => { refetchBalance() },
  })

  const strategyAddress = customStrategyAddress || '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}`
  const strategyABI = customStrategyAddress ? TopDawgPartnerStrategyABI : TopDawgStrategyABI
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const { data: minimumPrice } = useReadContract({
    address: strategyAddress, abi: strategyABI, functionName: 'minimumPrice', chainId: CANONICAL_CHAIN.id,
  })
  const { data: maxMessageLength } = useReadContract({
    address: strategyAddress, abi: strategyABI, functionName: 'maxMessageLength', chainId: CANONICAL_CHAIN.id,
  })
  const { data: maxNameLength } = useReadContract({
    address: strategyAddress, abi: strategyABI, functionName: 'maxNameLength', chainId: CANONICAL_CHAIN.id,
  })
  const { data: revNetEnabledData } = useReadContract({
    address: strategyAddress, abi: REV_NET_ENABLED_ABI, functionName: 'revNetEnabled', chainId: CANONICAL_CHAIN.id,
  })
  const revNetEnabled = revNetEnabledData ?? false
  const { data: adminAddress } = useReadContract({
    address: strategyAddress, abi: ADMIN_ABI, functionName: 'admin', chainId: CANONICAL_CHAIN.id,
  })

  // ── Preset amount calculations ──────────────────────────────────────────────
  const MIN_INCREMENT = BigInt('1000000000000000') // 0.001 ETH
  const minimumAmount = minimumPrice || parseEther('0.001')

  const rawTakeFirstAmount = topFundsAdded && topFundsAdded > 0n ? topFundsAdded + MIN_INCREMENT : null
  const takeFirstAmount = rawTakeFirstAmount
    ? rawTakeFirstAmount >= minimumAmount ? rawTakeFirstAmount : minimumAmount
    : null

  const addFundsRawTakeFirst = topFundsAdded && topFundsAdded > 0n && userMarkee
    ? topFundsAdded + MIN_INCREMENT - userMarkee.totalFundsAdded
    : null
  const addFundsTakeFirstAmount = addFundsRawTakeFirst && addFundsRawTakeFirst > 0n ? addFundsRawTakeFirst : null

  const userIsTopDawg = activeTab === 'addFunds' && userMarkee && topFundsAdded !== undefined && userMarkee.totalFundsAdded >= topFundsAdded
  const activeTakeFirstAmount = activeTab === 'addFunds' ? addFundsTakeFirstAmount : takeFirstAmount

  const minimumAmountFormatted = Number(formatEther(minimumAmount)).toFixed(3)
  const takeFirstAmountFormatted = activeTakeFirstAmount
    ? Number(formatEther(activeTakeFirstAmount)).toFixed(3)
    : null

  const hasCompetition = activeTab === 'addFunds'
    ? !!addFundsTakeFirstAmount
    : !!(takeFirstAmount && takeFirstAmount >= minimumAmount)

  // ── Balance / affordability ─────────────────────────────────────────────────
  const canAffordTransaction = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return false
    try {
      return balanceData.value >= parseEther(amount) + parseEther('0.001')
    } catch { return false }
  }

  const getInsufficientBalanceMessage = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return null
    try {
      if (balanceData.value < parseEther(amount) + parseEther('0.001')) {
        return "You don't have enough ETH to complete this transaction."
      }
    } catch { return 'Invalid amount entered' }
    return null
  }

  const insufficientBalance = !!(amount && parseFloat(amount) > 0 && !canAffordTransaction())
  const balanceWarning = getInsufficientBalanceMessage()

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    if (initialMode) setActiveTab(initialMode)
    else if (userMarkee) setActiveTab('addFunds')
    else setActiveTab('create')
    setMessage('')
    setError(null)
    reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMarkee, initialMode, isOpen, reset])

  useEffect(() => {
    if (!isOpen) return
    if (hasCompetition && takeFirstAmountFormatted) setAmount(takeFirstAmountFormatted)
    else setAmount(minimumAmountFormatted)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => {
        setMessage('')
        setAmount('')
        setError(null)
        onSuccess?.()
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose, isOpen, onSuccess])

  useEffect(() => {
    if (!isSuccess || !receipt || !address || !strategyAddress || activeTab === 'updateMessage') return
    const normalised = strategyAddress.toLowerCase()
    if (!SUPERFLUID_STRATEGY_ADDRESSES.has(normalised)) return
    const txHash = receipt.transactionHash
    const amountWei = parseEther(amount).toString()
    if (activeTab === 'addFunds') trackAddFunds(address, amountWei, txHash, strategyAddress).catch(console.error)
    else trackBuyMessage(address, amountWei, txHash, strategyAddress).catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt, address])

  useEffect(() => {
    if (!isSuccess || !strategyAddress || activeTab === 'updateMessage' || platformId !== 'github') return
    fetch('/api/github/update-markee-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaderboardAddress: strategyAddress }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCreateMarkee = async () => {
    if (!strategyAddress || !isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!message.trim()) { setError('Please enter a message'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter an amount'); return }
    const amountWei = parseEther(amount)
    const minPrice = minimumPrice || BigInt(0)
    if (amountWei < minPrice) { setError(`Minimum payment is ${formatEther(minPrice)} ETH`); return }
    if (maxMessageLength && message.length > Number(maxMessageLength)) { setError(`Message must be ${maxMessageLength} characters or less`); return }
    if (!canAffordTransaction()) { setError(getInsufficientBalanceMessage() || 'Insufficient balance'); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: strategyABI, functionName: 'createMarkee', args: [message, name], value: amountWei, chainId: CANONICAL_CHAIN.id })
    } catch (err: any) { setError(err.message || 'Transaction failed') }
  }

  const handleAddFunds = async () => {
    if (!strategyAddress || !isCorrectChain || !userMarkee) { setError('Please connect wallet and ensure you have a Markee'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter an amount'); return }
    if (!canAffordTransaction()) { setError(getInsufficientBalanceMessage() || 'Insufficient balance'); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: strategyABI, functionName: 'addFunds', args: [userMarkee.address as `0x${string}`], value: parseEther(amount), chainId: CANONICAL_CHAIN.id })
    } catch (err: any) { setError(err.message || 'Transaction failed') }
  }

  const handleUpdateMessage = async () => {
    if (!strategyAddress || !isCorrectChain || !userMarkee) { setError('Please connect wallet and ensure you have a Markee'); return }
    if (!message.trim()) { setError('Please enter a message'); return }
    if (maxMessageLength && message.length > Number(maxMessageLength)) { setError(`Message must be ${maxMessageLength} characters or less`); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: strategyABI, functionName: 'updateMessage', args: [userMarkee.address as `0x${string}`, message], chainId: CANONICAL_CHAIN.id })
    } catch (err: any) { setError(err.message || 'Transaction failed') }
  }

  if (!isOpen) return null

  const canSwitchTabs = !isPending && !isConfirming
  const isOwner = userMarkee && address && userMarkee.owner.toLowerCase() === address.toLowerCase()
  const txStep = isPending ? 'signing' : isConfirming ? 'pending' : isSuccess ? 'success' : null
  const maxLen = Number(maxMessageLength || 223)

  const stepLabel =
    txStep === 'signing' ? 'AWAITING SIGNATURE' :
    txStep === 'pending' ? 'CONFIRMING ONCHAIN' :
    txStep === 'success' ? 'CONFIRMED' :
    activeTab === 'addFunds' ? 'ADD FUNDS' :
    activeTab === 'updateMessage' ? 'UPDATE MESSAGE' :
    'BUY A NEW MESSAGE'

  // Amount section (create + addFunds)
  const bidNum = parseFloat(amount || '0')
  const markeeEarned = Math.round(calculateMarkeeTokens(bidNum))
  const selFeatured = takeFirstAmountFormatted !== null && amount === takeFirstAmountFormatted
  const selMin = amount === minimumAmountFormatted

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

        {/* ── Tx state panel ── */}
        {txStep ? (
          <div style={{ padding: '60px 22px 52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center', flex: 1 }}>
            <TxRing step={txStep} />
            <div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                {txStep === 'signing' && 'Waiting for wallet...'}
                {txStep === 'pending' && 'Transaction pending on Base'}
                {txStep === 'success' && (activeTab === 'addFunds' ? '✓ Funds added' : '🎉 You just took #1')}
              </div>
              <div style={{ color: MUTED, fontSize: 13, maxWidth: 340, lineHeight: 1.5 }}>
                {txStep === 'signing' && 'Sign the transaction in your wallet to complete this purchase.'}
                {txStep === 'pending' && 'Usually under 2 seconds on Base. Sit tight.'}
                {txStep === 'success' && (activeTab === 'addFunds' ? 'Your funds were added to the message.' : `"${message}" is now the #1 Markee. The board is reordering.`)}
              </div>
            </div>
          </div>

        ) : !isConnected ? (
          /* ── Connect wallet ── */
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : !isCorrectChain ? (
          /* ── Wrong chain ── */
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
            {/* ── Compose body ── */}
            <div style={{ padding: '22px 22px 0', overflowY: 'auto', flex: 1 }}>
              {/* Tabs - only when user owns this markee */}
              {userMarkee && isOwner && (
                <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 18 }}>
                  {(['addFunds', 'updateMessage'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => canSwitchTabs && setActiveTab(tab)}
                      style={{
                        background: 'transparent', border: 'none', cursor: canSwitchTabs ? 'pointer' : 'default',
                        padding: '8px 16px 10px', fontFamily: 'inherit', fontSize: 13,
                        color: activeTab === tab ? PINK : MUTED,
                        borderBottom: `2px solid ${activeTab === tab ? PINK : 'transparent'}`,
                        marginBottom: -1, transition: 'color 140ms',
                        opacity: canSwitchTabs ? 1 : 0.5,
                      }}
                    >
                      {tab === 'addFunds' ? 'Add Funds' : 'Update Message'}
                    </button>
                  ))}
                </div>
              )}

              {/* Create: message + name inputs */}
              {activeTab === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                  <ModalField label="Set Your Message">
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value.slice(0, maxLen))}
                      placeholder="the name's mark. agent mark 🕵️"
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={e => { e.target.style.borderColor = PINK }}
                      onBlur={e => { e.target.style.borderColor = BORDER }}
                      disabled={isPending || isConfirming}
                    />
                  </ModalField>
                  <ModalField label="Name (optional)">
                    <input
                      value={name}
                      onChange={e => setName(e.target.value.slice(0, Number(maxNameLength || 32)))}
                      placeholder="anon"
                      style={{ ...inputStyle }}
                      onFocus={e => { e.target.style.borderColor = PINK }}
                      onBlur={e => { e.target.style.borderColor = BORDER }}
                      disabled={isPending || isConfirming}
                    />
                  </ModalField>
                </div>
              )}

              {/* Message preview (create) or funded message read-only (addFunds) */}
              {activeTab !== 'updateMessage' && (
                <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', minHeight: activeTab === 'create' ? 80 : undefined, marginBottom: 18 }}>
                  {activeTab === 'addFunds' ? (
                    <>
                      <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {userMarkee?.message || '—'}
                      </div>
                      {userMarkee?.name && (
                        <div style={{ marginTop: 8, fontSize: 11, color: MUTED, fontStyle: 'italic' }}>- {userMarkee.name}</div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontFamily: MONO, fontSize: 14, color: message ? TEXT : MUTED, minHeight: 40, lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {message || 'Your message will appear here...'}
                        {message && <span style={{ color: PINK, animation: 'blink 1s step-end infinite' }}>|</span>}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: MUTED, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontStyle: 'italic' }}>- {name || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '0x...')}</span>
                        <span style={{ color: message.length > maxLen - 20 ? PINK : MUTED }}>{message.length}/{maxLen}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Update Message: current + new textarea */}
              {activeTab === 'updateMessage' && userMarkee && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
                  <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Current message</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45 }}>{userMarkee.message}</div>
                  </div>
                  <ModalField label="New Message">
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value.slice(0, maxLen))}
                      placeholder="Enter your new message..."
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={e => { e.target.style.borderColor = PINK }}
                      onBlur={e => { e.target.style.borderColor = BORDER }}
                      disabled={isPending || isConfirming}
                    />
                  </ModalField>
                </div>
              )}

              {/* Amount section (create + addFunds) */}
              {activeTab !== 'updateMessage' && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 }}>Amount (ETH)</div>

                  {/* Preset cards */}
                  {!userIsTopDawg && (
                    <div style={{ display: 'grid', gridTemplateColumns: hasCompetition ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
                      {hasCompetition && takeFirstAmountFormatted && (
                        <button
                          onClick={() => setAmount(takeFirstAmountFormatted)}
                          disabled={isPending || isConfirming}
                          style={{
                            textAlign: 'left', cursor: 'pointer',
                            background: selFeatured ? 'rgba(248,151,254,0.08)' : BG,
                            border: `1.5px solid ${selFeatured ? PINK : BORDER}`,
                            borderRadius: 12, padding: '13px 15px',
                            transition: 'border-color 140ms',
                          }}
                        >
                          <div style={{ color: selFeatured ? PINK : TEXT2, fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Featured Message 👑</div>
                          <div style={{ color: TEXT, fontFamily: MONO, fontSize: 17, fontWeight: 800 }}>{takeFirstAmountFormatted} ETH</div>
                          {ethPrice && <div style={{ color: BLUE, fontFamily: MONO, fontSize: 12, marginTop: 2 }}>{formatUsd(parseFloat(takeFirstAmountFormatted) * ethPrice)}</div>}
                          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                            {activeTab === 'addFunds' ? 'Additional ETH to take the top spot' : 'Price to take the top spot'}
                          </div>
                        </button>
                      )}
                      {activeTab !== 'addFunds' && (
                        <button
                          onClick={() => setAmount(minimumAmountFormatted)}
                          disabled={isPending || isConfirming}
                          style={{
                            textAlign: 'left', cursor: 'pointer',
                            background: selMin ? 'rgba(248,151,254,0.08)' : BG,
                            border: `1.5px solid ${selMin ? PINK : BORDER}`,
                            borderRadius: 12, padding: '13px 15px',
                            transition: 'border-color 140ms',
                          }}
                        >
                          <div style={{ color: selMin ? PINK : TEXT2, fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Minimum</div>
                          <div style={{ color: TEXT, fontFamily: MONO, fontSize: 17, fontWeight: 800 }}>0.001 ETH</div>
                          {ethPrice && <div style={{ color: BLUE, fontFamily: MONO, fontSize: 12, marginTop: 2 }}>{formatUsd(0.001 * ethPrice)}</div>}
                          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>Buy a message at the lowest price</div>
                        </button>
                      )}
                    </div>
                  )}

                  {/* #1 spot banner */}
                  {userIsTopDawg && (
                    <div style={{ borderRadius: 10, border: '1.5px solid rgba(255,215,0,0.4)', background: 'rgba(255,215,0,0.08)', padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>👑</span>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#FFD700' }}>This message holds the top spot!</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,215,0,0.7)' }}>Add more funds to make it harder for anyone to overtake you.</p>
                      </div>
                    </div>
                  )}

                  {/* ETH input */}
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={minimumAmountFormatted}
                    step="0.0001"
                    style={{ ...inputStyle, fontSize: 18, fontWeight: 600, padding: '14px 16px' }}
                    disabled={isPending || isConfirming}
                    onFocus={e => { e.target.style.borderColor = PINK }}
                    onBlur={e => { e.target.style.borderColor = BORDER }}
                  />

                  {/* Balance */}
                  {balanceData && (
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>Balance: {parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH</span>
                      {ethPrice && <span style={{ color: BLUE }}>{formatUsd(parseFloat(formatEther(balanceData.value)) * ethPrice)}</span>}
                    </div>
                  )}

                  {/* MARKEE token estimate */}
                  {revNetEnabled && bidNum > 0 && (
                    <div style={{ marginTop: 14, borderRadius: 14, padding: '22px 20px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))', border: `1px solid rgba(248,151,254,0.35)` }}>
                      <div style={{ color: PINK, fontSize: 15, marginBottom: 6 }}>You&apos;ll receive</div>
                      <div style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: -1 }}>{markeeEarned.toLocaleString()}</div>
                      <div style={{ color: PINK, fontSize: 15, marginTop: 8 }}>MARKEE tokens</div>
                    </div>
                  )}
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
                      onClick={() => fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount } })}
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
                {activeTab === 'addFunds'
                  ? 'Funds are added onchain to this message.'
                  : activeTab === 'updateMessage'
                  ? 'Only the message owner can update their message.'
                  : partnerName
                  ? <>62% to <span style={{ color: TEXT2 }}>{partnerName}</span> · 38% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a></>
                  : adminAddress
                  ? <>62% to <a href={`https://basescan.org/address/${adminAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>{adminAddress.slice(0, 6)}…{adminAddress.slice(-4)}</a> · 38% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a></>
                  : <>62% to the integration owner · 38% to the <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a></>}
              </div>
              <button
                onClick={() => {
                  if (activeTab === 'create') handleCreateMarkee()
                  else if (activeTab === 'addFunds') handleAddFunds()
                  else handleUpdateMessage()
                }}
                disabled={
                  isPending || isConfirming || isSuccess ||
                  (activeTab !== 'updateMessage' && insufficientBalance) ||
                  ((activeTab === 'create' || activeTab === 'updateMessage') && !message.trim())
                }
                style={{
                  background: PINK, color: BG, border: 'none', borderRadius: 8,
                  padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  opacity: (isPending || isConfirming || isSuccess || (activeTab !== 'updateMessage' && insufficientBalance) || ((activeTab === 'create' || activeTab === 'updateMessage') && !message.trim())) ? 0.4 : 1,
                  transition: 'opacity 140ms',
                }}
              >
                {activeTab === 'create' ? 'Buy Message' : activeTab === 'addFunds' ? 'Add Funds' : 'Update Message'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
