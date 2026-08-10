'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { CreditCard } from 'lucide-react'
import { useFundWallet } from '@privy-io/react-auth'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { TopDawgStrategyABI, TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useSuperfluidPoints } from '@/lib/superfluid/useSuperfluidPoints'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { formatUsd } from '@/lib/utils'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { TxProgress, InfoTip } from '@/components/modals/StreamUI'
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
const GOLD = '#FFD700'
const FAST_TX_GAS_RESERVE = parseEther('0.0002')

const REV_NET_ENABLED_ABI = [
  { inputs: [], name: 'revNetEnabled', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const

const BENEFICIARY_ABI = [
  { inputs: [], name: 'beneficiaryAddress', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

// ── Types ─────────────────────────────────────────────────────────────────────
export type MarkeeSlot = { address: string; owner: string; message: string; name?: string; totalFundsAdded: bigint }

// ── Props ─────────────────────────────────────────────────────────────────────
interface BuyMessageModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee?: MarkeeSlot | null
  allMarkees?: MarkeeSlot[]
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
  strategyAddress?: `0x${string}`
  partnerName?: string
  partnerSplitPercentage?: number
  topFundsAdded?: bigint
  platformId?: 'github' | 'superfluid'
  ctaLabel?: string
  subtitle?: string
  title?: string
  messageLabel?: string
  messagePlaceholder?: string
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

type SuccessSnap = {
  tookTop: boolean
  rank: number | null
  additionalWei: bigint | null
  isUpdate: boolean
  tab: 'create' | 'addFunds' | 'updateMessage'
  isFirstOnBoard: boolean
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

// ── Main modal ────────────────────────────────────────────────────────────────
export function BuyMessageModal({
  isOpen,
  onClose,
  userMarkee,
  allMarkees,
  initialMode,
  onSuccess,
  strategyAddress: customStrategyAddress,
  partnerName,
  topFundsAdded,
  platformId,
  ctaLabel,
  subtitle,
  title,
  messageLabel = 'Set Your Message',
  messagePlaceholder = 'Your message here...',
}: BuyMessageModalProps) {
  const { activeAddress, authenticated, hasWallet, hasActiveWalletConnection, isWalletConnectionPending } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const [message, setMessage] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [lastPreset, setLastPreset] = useState<'min' | 'max' | 'win' | '2x' | null>('min')
  const [successSnap, setSuccessSnap] = useState<SuccessSnap | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const { trackBuyMessage, trackAddFunds } = useSuperfluidPoints()

  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: activeAddress as `0x${string}` | undefined,
    chainId: CANONICAL_CHAIN.id,
  })

  const { fundWallet } = useFundWallet({
    onUserExited: () => { refetchBalance() },
  })

  const strategyAddress = customStrategyAddress || '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}`
  const strategyABI = customStrategyAddress ? TopDawgPartnerStrategyABI : TopDawgStrategyABI
  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

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
  const { data: beneficiaryAddress } = useReadContract({
    address: strategyAddress, abi: BENEFICIARY_ABI, functionName: 'beneficiaryAddress', chainId: CANONICAL_CHAIN.id,
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
      return balanceData.value >= parseEther(amount) + FAST_TX_GAS_RESERVE
    } catch { return false }
  }

  const getInsufficientBalanceMessage = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return null
    try {
      if (balanceData.value < parseEther(amount) + FAST_TX_GAS_RESERVE) {
        return `You don't have enough ETH after reserving ${formatEther(FAST_TX_GAS_RESERVE)} ETH for gas.`
      }
    } catch { return 'Invalid amount entered' }
    return null
  }

  const insufficientBalance = !!(amount && parseFloat(amount) > 0 && !canAffordTransaction())
  const balanceWarning = getInsufficientBalanceMessage()
  const spendableBalance = balanceData && balanceData.value > FAST_TX_GAS_RESERVE
    ? balanceData.value - FAST_TX_GAS_RESERVE
    : 0n
  const maxSpendableEth = Number(formatEther(spendableBalance))
  const maxSpendableFormatted = maxSpendableEth > 0 && maxSpendableEth < 0.001
    ? maxSpendableEth.toFixed(6)
    : maxSpendableEth.toFixed(3)

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    if (initialMode) setActiveTab(initialMode)
    else if (userMarkee) setActiveTab('addFunds')
    else setActiveTab('create')
    setMessage('')
    setAmount('')
    setError(null)
    setHasUserEdited(false)
    setLastPreset(null)
    setSuccessSnap(null)
    reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMarkee, initialMode, isOpen, reset])

  useEffect(() => {
    if (!isOpen) return
    setAmount(minimumAmountFormatted)
    setLastPreset('min')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (isSuccess && isOpen) {
      const snap: SuccessSnap = {
        tookTop: false, rank: null, additionalWei: null,
        isUpdate: activeTab === 'updateMessage',
        tab: activeTab,
        isFirstOnBoard: activeTab === 'create' && (!topFundsAdded || topFundsAdded === 0n),
      }
      try {
        const amountWei = parseEther(amount || '0')
        const top = topFundsAdded ?? 0n
        if (activeTab === 'create') {
          snap.tookTop = top === 0n || amountWei > top
          if (!snap.tookTop) {
            snap.rank = allMarkees ? allMarkees.filter(m => m.totalFundsAdded > amountWei).length + 1 : null
            if (top > 0n) snap.additionalWei = top + MIN_INCREMENT - amountWei
          }
        } else if (activeTab === 'addFunds' && userMarkee) {
          const newTotal = userMarkee.totalFundsAdded + amountWei
          snap.tookTop = top === 0n || newTotal >= top
          if (!snap.tookTop) {
            snap.rank = allMarkees
              ? allMarkees.filter(m => m.address.toLowerCase() !== userMarkee.address.toLowerCase() && m.totalFundsAdded > newTotal).length + 1
              : null
            if (top > 0n) snap.additionalWei = top + MIN_INCREMENT - newTotal
          }
        } else if (activeTab === 'updateMessage') {
          snap.tookTop = !!userIsTopDawg
        }
      } catch { /* invalid amount */ }
      setSuccessSnap(snap)
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
    if (!isSuccess || !receipt || !activeAddress || !strategyAddress || activeTab === 'updateMessage') return
    if (platformId !== 'superfluid') return
    const txHash = receipt.transactionHash
    const amountWei = parseEther(amount).toString()
    if (activeTab === 'addFunds') trackAddFunds(activeAddress, amountWei, txHash, strategyAddress).catch(console.error)
    else trackBuyMessage(activeAddress, amountWei, txHash, strategyAddress).catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt, activeAddress])

  useEffect(() => {
    if (!isSuccess || !strategyAddress || activeTab === 'updateMessage' || platformId !== 'github') return
    fetch('/api/github/update-markee-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaderboardAddress: strategyAddress }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (writeError) logTransactionError(writeError, 'BuyMessageModal')
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

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCreateMarkee = async () => {
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
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
      writeContract({ address: strategyAddress, abi: strategyABI, functionName: 'createMarkee', args: [message, ''], value: amountWei, chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'BuyMessageModal.createMarkee')
      setError(formatTransactionError(err))
    }
  }

  const handleAddFunds = async () => {
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!strategyAddress || !isCorrectChain || !userMarkee) { setError('Please switch to Base and ensure you have a Markee'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter an amount'); return }
    if (!canAffordTransaction()) { setError(getInsufficientBalanceMessage() || 'Insufficient balance'); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: strategyABI, functionName: 'addFunds', args: [userMarkee.address as `0x${string}`], value: parseEther(amount), chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'BuyMessageModal.addFunds')
      setError(formatTransactionError(err))
    }
  }

  const handleUpdateMessage = async () => {
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!strategyAddress || !isCorrectChain || !userMarkee) { setError('Please switch to Base and ensure you have a Markee'); return }
    if (!message.trim()) { setError('Please enter a message'); return }
    if (maxMessageLength && message.length > Number(maxMessageLength)) { setError(`Message must be ${maxMessageLength} characters or less`); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: strategyABI, functionName: 'updateMessage', args: [userMarkee.address as `0x${string}`, message], chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'BuyMessageModal.updateMessage')
      setError(formatTransactionError(err))
    }
  }

  if (!isOpen) return null

  const canSwitchTabs = !isPending && !isConfirming
  const isOwner = userMarkee && activeAddress && userMarkee.owner.toLowerCase() === activeAddress.toLowerCase()

  const btnDisabled =
    isPending || isConfirming || isSuccess ||
    (activeTab !== 'updateMessage' && insufficientBalance) ||
    ((activeTab === 'create' || activeTab === 'updateMessage') && !message.trim())
  const btnDisabledReason = !btnDisabled || isSuccess ? null
    : (isPending || isConfirming) ? 'Transaction in progress'
    : (activeTab !== 'updateMessage' && insufficientBalance) ? 'Insufficient ETH balance'
    : ((activeTab === 'create' || activeTab === 'updateMessage') && !message.trim()) ? 'Enter a message to continue'
    : null
  const maxLen = Number(maxMessageLength || 223)
  const transactionError = error || (isError ? formatTransactionError(writeError) : null)

  const stepLabel =
    activeTab === 'addFunds' ? 'ADD FUNDS' :
    activeTab === 'updateMessage' ? 'UPDATE MESSAGE' :
    (title ?? 'BUY A NEW MESSAGE')

  // Amount section (create + addFunds)
  const bidNum = parseFloat(amount || '0')
  const markeeEarned = estimateLeaderboardPurchaseMarkeeTokens(bidNum)
  const selFeatured = takeFirstAmountFormatted !== null && amount === takeFirstAmountFormatted
  const selMin = amount === minimumAmountFormatted

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
              {stepLabel}
            </div>
            {subtitle && !txStep && (
              <div style={{ fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 13, color: MUTED, paddingLeft: 18 }}>{subtitle}</div>
            )}
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
              successSnap?.isUpdate ? 'Success! Your message is updated' :
              successSnap?.isFirstOnBoard ? 'Success! Your Markee is Activated' :
              successSnap?.tookTop ? 'Success! Your message is now featured' :
              successSnap?.tab === 'create' ? 'Success! Your message is created' :
              'Success! Your funds are added'
            }
            detail={
              txStep === 'signing' ? 'Sign the transaction in your wallet.' :
              txStep === 'pending' ? 'Usually under 2 seconds on Base.' :
              successSnap?.isUpdate ? 'Your message has been updated on the leaderboard.' :
              successSnap?.isFirstOnBoard ? 'You\'re the first on this leaderboard!' :
              successSnap?.tookTop ? 'Your message is now featured at #1.' :
              successSnap?.additionalWei
                ? `Add ${parseFloat(formatEther(successSnap.additionalWei)).toFixed(3)} ETH to take the #1 spot.`
                : 'Your message has been added to the leaderboard.'
            }
          />

        ) : isWalletConnectionPending ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Preparing your wallet connection...</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : !hasWallet || !hasActiveWalletConnection ? (
          /* ── Connect wallet ── */
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : isWrongChain ? (
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

              {/* Create: message input */}
              {activeTab === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                  <ModalField label={messageLabel}>
                    <textarea
                      value={message}
                      onChange={e => { setHasUserEdited(true); setMessage(e.target.value.slice(0, maxLen)) }}
                      placeholder={messagePlaceholder}
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={e => { e.target.style.borderColor = PINK }}
                      onBlur={e => { e.target.style.borderColor = BORDER }}
                      disabled={isPending || isConfirming}
                    />
                    <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 4, fontFamily: MONO }}>
                      {message.length}/{maxLen}
                    </div>
                  </ModalField>
                </div>
              )}

              {/* Funded message read-only (addFunds) */}
              {activeTab === 'addFunds' && (
                <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', marginBottom: 18 }}>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>
                    {userMarkee?.message || '—'}
                  </div>
                  {userMarkee?.name && (
                    <div style={{ marginTop: 8, fontSize: 11, color: MUTED, fontStyle: 'italic' }}>- {userMarkee.name}</div>
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
                      onChange={e => { setHasUserEdited(true); setMessage(e.target.value.slice(0, maxLen)) }}
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

                  {/* Price card */}
                  <div style={{
                    border: `1.5px solid ${PINK}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    background: BG,
                    boxShadow: '0 0 24px rgba(248,151,254,0.08)',
                  }}>
                    {/* Number + unit inline on left, MIN/MAX on right */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <input
                          inputMode="decimal"
                          value={amount}
                          onChange={e => { setHasUserEdited(true); setAmount(e.target.value); setLastPreset(null) }}
                          placeholder={minimumAmountFormatted}
                          disabled={isPending || isConfirming}
                          style={{
                            background: 'transparent', border: 'none', outline: 'none',
                            color: TEXT, fontFamily: MONO, fontSize: 26, fontWeight: 800,
                            padding: 0,
                            width: `${Math.max(5, (amount || minimumAmountFormatted).length + 0.5)}ch`,
                          }}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETH</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {activeTab !== 'addFunds' && (
                          <button
                            type="button"
                            onClick={() => { setHasUserEdited(true); setAmount(minimumAmountFormatted); setLastPreset('min') }}
                            disabled={isPending || isConfirming}
                            style={{
                              border: `1px solid ${lastPreset === 'min' ? PINK : BORDER}`,
                              background: 'transparent',
                              color: lastPreset === 'min' ? PINK : TEXT2,
                              borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                              fontWeight: 700, cursor: isPending || isConfirming ? 'default' : 'pointer',
                              opacity: isPending || isConfirming ? 0.4 : 1,
                              transition: 'border-color 120ms, color 120ms',
                            }}
                          >
                            MIN
                          </button>
                        )}
                        {hasCompetition && takeFirstAmountFormatted && !userIsTopDawg && (
                          <button
                            type="button"
                            onClick={() => { setHasUserEdited(true); setAmount(takeFirstAmountFormatted); setLastPreset('win') }}
                            disabled={isPending || isConfirming}
                            style={{
                              border: `1px solid ${lastPreset === 'win' ? GOLD : BORDER}`,
                              background: 'transparent',
                              color: lastPreset === 'win' ? GOLD : TEXT2,
                              borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                              fontWeight: 700, cursor: isPending || isConfirming ? 'default' : 'pointer',
                              opacity: isPending || isConfirming ? 0.4 : 1,
                              transition: 'border-color 120ms, color 120ms',
                            }}
                          >
                            WIN
                          </button>
                        )}
                        {userIsTopDawg && userMarkee && (
                          <button
                            type="button"
                            onClick={() => {
                              const twoX = parseFloat(formatEther(userMarkee.totalFundsAdded)).toFixed(3)
                              setHasUserEdited(true); setAmount(twoX); setLastPreset('2x')
                            }}
                            disabled={isPending || isConfirming}
                            style={{
                              border: `1px solid ${lastPreset === '2x' ? GOLD : BORDER}`,
                              background: 'transparent',
                              color: lastPreset === '2x' ? GOLD : TEXT2,
                              borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                              fontWeight: 700, cursor: isPending || isConfirming ? 'default' : 'pointer',
                              opacity: isPending || isConfirming ? 0.4 : 1,
                              transition: 'border-color 120ms, color 120ms',
                            }}
                          >
                            2X
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setHasUserEdited(true); setAmount(maxSpendableFormatted); setLastPreset('max') }}
                          disabled={spendableBalance <= 0n || isPending || isConfirming}
                          style={{
                            border: `1px solid ${lastPreset === 'max' ? PINK : BORDER}`,
                            background: 'transparent',
                            color: lastPreset === 'max' ? PINK : TEXT2,
                            borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                            fontWeight: 700, cursor: spendableBalance > 0n ? 'pointer' : 'default',
                            opacity: spendableBalance > 0n && !isPending && !isConfirming ? 1 : 0.4,
                            transition: 'border-color 120ms, color 120ms',
                          }}
                        >
                          MAX
                        </button>
                      </div>
                    </div>

                    {/* USD equiv + balance */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 12, color: MUTED }}>
                      <span>
                        {ethPrice && bidNum > 0 ? `≈ ${formatUsd(bidNum * ethPrice)}` : ' '}
                      </span>
                      <span>
                        {balanceData ? `Balance ${parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH` : ''}
                      </span>
                    </div>
                  </div>

                  {/* You'll receive — horizontal */}
                  {bidNum > 0 && (
                    <div style={{
                      marginTop: 12, borderRadius: 14, padding: '14px 20px',
                      background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))',
                      border: `1px solid rgba(248,151,254,0.35)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ color: PINK, fontSize: 14, fontWeight: 600, fontFamily: 'Manrope, system-ui, sans-serif' }}>You&apos;ll receive</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: -0.5 }}>
                          {markeeEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ color: PINK, fontSize: 13, fontWeight: 700 }}>MARKEE</span>
                      </div>
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
                  {authenticated && activeAddress && (
                    <button
                      onClick={() => fundWallet({ address: activeAddress, options: { chain: CANONICAL_CHAIN, amount } })}
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
                {activeTab === 'addFunds'
                  ? 'Funds are added onchain to this message.'
                  : activeTab === 'updateMessage'
                  ? 'Only the message owner can update their message.'
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      62/38 split
                      <InfoTip>
                        62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
                      </InfoTip>
                    </span>}
              </div>
              <BtnTooltip reason={btnDisabledReason}>
                <button
                  onClick={() => {
                    if (activeTab === 'create') handleCreateMarkee()
                    else if (activeTab === 'addFunds') handleAddFunds()
                    else handleUpdateMessage()
                  }}
                  disabled={btnDisabled}
                  style={{
                    background: PINK, color: BG, border: 'none', borderRadius: 8,
                    padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                    cursor: btnDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: btnDisabled ? 0.4 : 1,
                    transition: 'opacity 140ms',
                  }}
                >
                  {activeTab === 'create' ? (ctaLabel ?? 'Buy Message') : activeTab === 'addFunds' ? 'Add Funds' : 'Update Message'}
                </button>
              </BtnTooltip>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
