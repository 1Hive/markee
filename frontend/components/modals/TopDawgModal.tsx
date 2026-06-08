'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { X, CheckCircle2, AlertCircle, ArrowRightLeft, Trophy, CreditCard } from 'lucide-react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { TopDawgStrategyABI, TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useSuperfluidPoints } from '@/lib/superfluid/useSuperfluidPoints'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import type { Markee } from '@/types'

// ─── MARKEE token phases ──────────────────────────────────────────────────────

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
  {
    inputs: [],
    name: 'revNetEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Strategies where fund events earn Superfluid campaign points.
// Any other partner strategy is ignored.
const SUPERFLUID_STRATEGY_ADDRESSES = new Set([
  '0xaa37d049dfbfc07f9e8526a4a9bde418df9f1b79', // SF v1.3 leaderboard
])

interface TopDawgModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee?: Markee | null
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
  strategyAddress?: `0x${string}`
  partnerName?: string
  partnerSplitPercentage?: number
  topFundsAdded?: bigint
  initialAmount?: string
  initialMessage?: string
}

type ModalTab = 'create' | 'addFunds' | 'updateMessage'

export function TopDawgModal({
  isOpen,
  onClose,
  userMarkee,
  initialMode,
  onSuccess,
  strategyAddress: customStrategyAddress,
  partnerName,
  topFundsAdded,
  initialAmount,
  initialMessage,
}: TopDawgModalProps) {
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

  // Get user's ETH balance
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: address,
    chainId: CANONICAL_CHAIN.id,
  })

  const { fundWallet } = useFundWallet({
    onUserExited: () => { refetchBalance() },
  })

  // Get strategy address - use custom one if provided, otherwise default TopDawg
  const strategyAddress = customStrategyAddress || '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}`

  // Use the appropriate ABI based on whether it's a partner strategy
  const strategyABI = customStrategyAddress ? TopDawgPartnerStrategyABI : TopDawgStrategyABI

  // Check if user is on the correct chain
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  // Read minimum price and max message length from strategy
  const { data: minimumPrice } = useReadContract({
    address: strategyAddress,
    abi: strategyABI,
    functionName: 'minimumPrice',
    chainId: CANONICAL_CHAIN.id,
  })

  const { data: maxMessageLength } = useReadContract({
    address: strategyAddress,
    abi: strategyABI,
    functionName: 'maxMessageLength',
    chainId: CANONICAL_CHAIN.id,
  })

  const { data: maxNameLength } = useReadContract({
    address: strategyAddress,
    abi: strategyABI,
    functionName: 'maxNameLength',
    chainId: CANONICAL_CHAIN.id,
  })

  // v1.1 Leaderboards support revNetEnabled; legacy TopDawg strategies don't.
  // wagmi returns undefined on failure — treat as false.
  const { data: revNetEnabledData } = useReadContract({
    address: strategyAddress,
    abi: REV_NET_ENABLED_ABI,
    functionName: 'revNetEnabled',
    chainId: CANONICAL_CHAIN.id,
  })
  const revNetEnabled = revNetEnabledData ?? false

  // ---------------------------------------------------------------------------
  // Preset amount calculations
  // ---------------------------------------------------------------------------
  const MIN_INCREMENT = BigInt('1000000000000000') // 0.001 ETH
  const minimumAmount = minimumPrice || parseEther('0.001')

  // Create tab: topFundsAdded + 0.001, floored at minimumAmount
  const rawTakeFirstAmount =
    topFundsAdded && topFundsAdded > 0n ? topFundsAdded + MIN_INCREMENT : null
  const takeFirstAmount = rawTakeFirstAmount
    ? rawTakeFirstAmount >= minimumAmount
      ? rawTakeFirstAmount
      : minimumAmount
    : null

  // Add Funds tab: only the *additional* ETH needed to overtake the top message.
  const addFundsRawTakeFirst =
    topFundsAdded && topFundsAdded > 0n && userMarkee
      ? topFundsAdded + MIN_INCREMENT - userMarkee.totalFundsAdded
      : null
  const addFundsTakeFirstAmount =
    addFundsRawTakeFirst && addFundsRawTakeFirst > 0n ? addFundsRawTakeFirst : null

  // Is the user's message already holding the top spot?
  const userIsTopDawg =
    activeTab === 'addFunds' &&
    userMarkee &&
    topFundsAdded !== undefined &&
    userMarkee.totalFundsAdded >= topFundsAdded

  // Active preset values depending on which tab is showing
  const activeTakeFirstAmount =
    activeTab === 'addFunds' ? addFundsTakeFirstAmount : takeFirstAmount

  // Formatted preset values
  const minimumAmountFormatted = Number(formatEther(minimumAmount)).toFixed(3)
  const takeFirstAmountFormatted = activeTakeFirstAmount
    ? Number(formatEther(activeTakeFirstAmount)).toFixed(3)
    : null

  // Show Featured Message button when there's competition to beat
  const hasCompetition =
    activeTab === 'addFunds'
      ? !!addFundsTakeFirstAmount
      : !!(takeFirstAmount && takeFirstAmount >= minimumAmount)

  // ---------------------------------------------------------------------------

  const canAffordTransaction = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return false
    try {
      const amountWei = parseEther(amount)
      const estimatedGas = parseEther('0.001')
      const totalNeeded = amountWei + estimatedGas
      return balanceData.value >= totalNeeded
    } catch {
      return false
    }
  }

  const getInsufficientBalanceMessage = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return null
    try {
      const amountWei = parseEther(amount)
      const estimatedGas = parseEther('0.001')
      const totalNeeded = amountWei + estimatedGas
      if (balanceData.value < totalNeeded) {
        return `You don't have enough ETH to complete this transaction.`
      }
    } catch {
      return 'Invalid amount entered'
    }
    return null
  }

  const insufficientBalance = !!(amount && parseFloat(amount) > 0 && !canAffordTransaction())
  const balanceWarning = getInsufficientBalanceMessage()

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Reset form state when modal opens/closes or mode changes.
  useEffect(() => {
    if (!isOpen) return
    if (initialMode) {
      setActiveTab(initialMode)
    } else if (userMarkee) {
      setActiveTab('addFunds')
    } else {
      setActiveTab('create')
    }
    setMessage(initialMessage ?? '')
    setError(null)
    reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMarkee, initialMode, isOpen, reset])

  // Set the default amount only when the modal first opens.
  useEffect(() => {
    if (!isOpen) return
    if (initialAmount !== undefined) {
      setAmount(initialAmount)
    } else if (hasCompetition && takeFirstAmountFormatted) {
      setAmount(takeFirstAmountFormatted)
    } else {
      setAmount(minimumAmountFormatted)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Close on Escape (unless a tx is in flight)
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending && !isConfirming) onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPending, isConfirming])

  // Reset state and trigger refresh when transaction succeeds
  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => {
        setMessage('')
        setAmount('')
        setError(null)
        if (onSuccess) {
          onSuccess()
        }
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose, isOpen, onSuccess])

  // Track Superfluid points after confirmed transaction.
  // Only fires for the two Superfluid strategy addresses — other partners are ignored.
  useEffect(() => {
    if (!isSuccess || !receipt || !address || !strategyAddress || activeTab === 'updateMessage') return

    const normalised = strategyAddress.toLowerCase()
    if (!SUPERFLUID_STRATEGY_ADDRESSES.has(normalised)) return

    const txHash = receipt.transactionHash
    const amountWei = parseEther(amount).toString()

    if (activeTab === 'addFunds') {
      trackAddFunds(address, amountWei, txHash, strategyAddress).catch(console.error)
    } else {
      trackBuyMessage(address, amountWei, txHash, strategyAddress).catch(console.error)
    }
  // amount is intentionally captured at confirmation time — do not add to deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt, address])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCreateMarkee = async () => {
    if (!strategyAddress || !isCorrectChain) {
      setError(`Please switch to ${CANONICAL_CHAIN.name}`)
      return
    }
    if (!message.trim()) {
      setError('Please enter a message')
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter an amount')
      return
    }

    const amountWei = parseEther(amount)
    const minPrice = minimumPrice || BigInt(0)

    if (amountWei < minPrice) {
      setError(`Minimum payment is ${formatEther(minPrice)} ETH`)
      return
    }
    if (maxMessageLength && message.length > Number(maxMessageLength)) {
      setError(`Message must be ${maxMessageLength} characters or less`)
      return
    }
    if (!canAffordTransaction()) {
      setError(getInsufficientBalanceMessage() || 'Insufficient balance')
      return
    }

    setError(null)
    try {
      writeContract({
        address: strategyAddress,
        abi: strategyABI,
        functionName: 'createMarkee',
        args: [message, name],
        value: amountWei,
        chainId: CANONICAL_CHAIN.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  const handleAddFunds = async () => {
    if (!strategyAddress || !isCorrectChain || !userMarkee) {
      setError('Please connect wallet and ensure you have a Markee')
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter an amount')
      return
    }
    if (!canAffordTransaction()) {
      setError(getInsufficientBalanceMessage() || 'Insufficient balance')
      return
    }

    setError(null)
    try {
      writeContract({
        address: strategyAddress,
        abi: strategyABI,
        functionName: 'addFunds',
        args: [userMarkee.address as `0x${string}`],
        value: parseEther(amount),
        chainId: CANONICAL_CHAIN.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  const handleUpdateMessage = async () => {
    if (!strategyAddress || !isCorrectChain || !userMarkee) {
      setError('Please connect wallet and ensure you have a Markee')
      return
    }
    if (!message.trim()) {
      setError('Please enter a message')
      return
    }
    if (maxMessageLength && message.length > Number(maxMessageLength)) {
      setError(`Message must be ${maxMessageLength} characters or less`)
      return
    }

    setError(null)
    try {
      writeContract({
        address: strategyAddress,
        abi: strategyABI,
        functionName: 'updateMessage',
        args: [userMarkee.address as `0x${string}`, message],
        chainId: CANONICAL_CHAIN.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  if (!isOpen) return null

  const canSwitchTabs = !isPending && !isConfirming
  const isOwner = userMarkee && address && userMarkee.owner.toLowerCase() === address.toLowerCase()

  // ---------------------------------------------------------------------------
  // Amount selector JSX
  // ---------------------------------------------------------------------------
  const bidNum = parseFloat(amount || '0')
  const selFeatured = takeFirstAmountFormatted !== null && amount === takeFirstAmountFormatted
  const selMin = amount === minimumAmountFormatted

  const amountSelectorJSX = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* #1 spot banner */}
      {userIsTopDawg && (
        <div style={{ borderRadius: 10, padding: '13px 15px', border: '2px solid rgba(255,215,0,0.5)', background: 'rgba(255,215,0,0.08)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Trophy size={18} style={{ color: '#FFD700', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#FFD700' }}>👑 This message holds the top spot!</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,215,0,0.8)' }}>Add more funds to make it harder for anyone to overtake you.</p>
          </div>
        </div>
      )}

      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#8A8FBF', letterSpacing: 1, textTransform: 'uppercase' }}>Amount (ETH)</div>

      {/* Preset cards */}
      {!userIsTopDawg && (
        <div style={{ display: 'grid', gridTemplateColumns: hasCompetition && activeTab !== 'addFunds' ? '1fr 1fr' : '1fr', gap: 10 }}>
          {hasCompetition && (
            <button
              type="button"
              onClick={() => setAmount(takeFirstAmountFormatted!)}
              disabled={isPending || isConfirming}
              style={{ textAlign: 'left', cursor: isPending || isConfirming ? 'not-allowed' : 'pointer', background: selFeatured ? 'rgba(248,151,254,0.08)' : '#060A2A', border: `1.5px solid ${selFeatured ? '#F897FE' : 'rgba(138,143,191,0.2)'}`, borderRadius: 12, padding: '13px 15px', opacity: isPending || isConfirming ? 0.5 : 1, transition: 'border-color 120ms' }}
            >
              <div style={{ color: selFeatured ? '#F897FE' : '#B8B6D9', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Featured Message 👑</div>
              <div style={{ color: '#EDEEFF', fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 800 }}>{takeFirstAmountFormatted} ETH</div>
              <div style={{ color: '#8A8FBF', fontSize: 12, marginTop: 4 }}>
                {activeTab === 'addFunds' ? 'Additional ETH needed to take the top spot' : 'Price to take the top spot'}
              </div>
            </button>
          )}
          {activeTab !== 'addFunds' && (
            <button
              type="button"
              onClick={() => setAmount(minimumAmountFormatted)}
              disabled={isPending || isConfirming}
              style={{ textAlign: 'left', cursor: isPending || isConfirming ? 'not-allowed' : 'pointer', background: selMin ? 'rgba(248,151,254,0.08)' : '#060A2A', border: `1.5px solid ${selMin ? '#F897FE' : 'rgba(138,143,191,0.2)'}`, borderRadius: 12, padding: '13px 15px', opacity: isPending || isConfirming ? 0.5 : 1, transition: 'border-color 120ms' }}
            >
              <div style={{ color: selMin ? '#F897FE' : '#B8B6D9', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Minimum</div>
              <div style={{ color: '#EDEEFF', fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 800 }}>0.001 ETH</div>
              <div style={{ color: '#8A8FBF', fontSize: 12, marginTop: 4 }}>Buy a message at the lowest price</div>
            </button>
          )}
        </div>
      )}

      {/* Amount input */}
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={activeTab === 'addFunds' ? '0.001' : minimumAmountFormatted}
        step="0.0001"
        min="0"
        disabled={isPending || isConfirming}
        style={{ width: '100%', boxSizing: 'border-box', background: '#060A2A', color: '#EDEEFF', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 10, padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 18, outline: 'none', fontWeight: 600 }}
      />

      {/* Balance */}
      {balanceData && (
        <div style={{ fontSize: 12, color: '#8A8FBF' }}>
          Balance: {parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH
          {ethPrice && <span style={{ color: '#7C9CFF', marginLeft: 6 }}>({formatUsd(parseFloat(formatEther(balanceData.value)) * ethPrice)})</span>}
        </div>
      )}

      {/* MARKEE token estimate box */}
      {revNetEnabled && bidNum > 0 && (
        <div style={{ borderRadius: 14, padding: '22px 20px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))', border: '1px solid rgba(248,151,254,0.35)' }}>
          <div style={{ color: '#F897FE', fontSize: 15, marginBottom: 6 }}>You&apos;ll receive</div>
          <div style={{ color: '#F897FE', fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: -1 }}>
            {Math.floor(calculateMarkeeTokens(bidNum)).toLocaleString()}
          </div>
          <div style={{ color: '#F897FE', fontSize: 15, marginTop: 8 }}>MARKEE tokens</div>
        </div>
      )}
    </div>
  )

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        style={{ background: '#0A0F3D', borderRadius: 16, border: '1px solid rgba(138,143,191,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
        className="max-w-[560px] w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[22px] py-[18px] border-b border-[#8A8FBF]/30">
          <div className="flex items-center gap-2.5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8A8FBF', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#F897FE', boxShadow: '0 0 8px #F897FE', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
            {isPending
              ? 'AWAITING SIGNATURE'
              : isConfirming
              ? 'CONFIRMING ONCHAIN'
              : isSuccess
              ? 'CONFIRMED'
              : activeTab === 'addFunds'
              ? 'ADD FUNDS'
              : activeTab === 'updateMessage'
              ? 'UPDATE MESSAGE'
              : 'BUY A NEW MESSAGE'}
          </div>
          <button
            onClick={onClose}
            disabled={isPending || isConfirming}
            className="text-[#8A8FBF] hover:text-[#EDEEFF] transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs - only show if user is owner */}
        {userMarkee && isOwner && (
          <div className="flex border-b border-[#8A8FBF]/30">
            <button
              onClick={() => canSwitchTabs && setActiveTab('addFunds')}
              disabled={!canSwitchTabs}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'addFunds'
                  ? 'text-[#F897FE] border-b-2 border-[#F897FE]'
                  : 'text-[#8A8FBF] hover:text-[#EDEEFF]'
              } ${!canSwitchTabs ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Add Funds
            </button>
            <button
              onClick={() => canSwitchTabs && setActiveTab('updateMessage')}
              disabled={!canSwitchTabs}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'updateMessage'
                  ? 'text-[#F897FE] border-b-2 border-[#F897FE]'
                  : 'text-[#8A8FBF] hover:text-[#EDEEFF]'
              } ${!canSwitchTabs ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Update Message
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {!isConnected ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-yellow-500" size={48} />
              <p className="text-[#B8B6D9] mb-4">Please connect your wallet to continue</p>
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            </div>
          ) : !isCorrectChain ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-[#B8B6D9] mb-4">
                Please switch to {CANONICAL_CHAIN.name} to use Markee
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
                  className="bg-[#FFA94D] text-[#060A2A] px-6 py-3 rounded-lg font-medium hover:bg-[#FF8E3D] flex items-center gap-2 transition-colors"
                >
                  <ArrowRightLeft size={20} />
                  Switch Network to Base
                </button>
              </div>
            </div>
          ) : !strategyAddress ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-[#B8B6D9] mb-4">
                TopDawg strategy not configured. Please contact support.
              </p>
            </div>
          ) : (
            <>
              {/* Buy a Message (Create) */}
              {activeTab === 'create' && (
                <div className="space-y-4">
                  {/* Live message preview */}
                  <div style={{ borderRadius: 10, border: '1px solid rgba(138,143,191,0.2)', background: 'rgba(15,27,107,0.35)', padding: '14px 16px', minHeight: 88 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: message ? '#EDEEFF' : '#8A8FBF', minHeight: 40, lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {message || 'Type your message below…'}
                      {message && <span style={{ color: '#F897FE', animation: 'blink 1s step-end infinite' }}>|</span>}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#8A8FBF', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontStyle: 'italic' }}>- {name || 'anon'}</span>
                      <span style={{ color: maxMessageLength && message.length > Number(maxMessageLength) - 20 ? '#F897FE' : '#8A8FBF' }}>
                        {message.length}/{maxMessageLength ? maxMessageLength.toString() : '223'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Your Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell the world how you really feel..."
                      className="w-full px-4 py-2 bg-[#0A0F3D]/50 border border-[#8A8FBF]/30 rounded-lg focus:ring-2 focus:ring-[#F897FE] focus:border-transparent text-[#EDEEFF] placeholder-[#8A8FBF]"
                      rows={3}
                      maxLength={maxMessageLength ? Number(maxMessageLength) : undefined}
                      disabled={isPending || isConfirming}
                    />
                    {maxMessageLength && (
                      <p className="text-xs text-[#8A8FBF] mt-1">
                        {message.length} / {maxMessageLength.toString()} characters
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Display Name (optional)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Take credit for your masterpiece..."
                      className="w-full px-4 py-2 bg-[#0A0F3D]/50 border border-[#8A8FBF]/30 rounded-lg focus:ring-2 focus:ring-[#F897FE] focus:border-transparent text-[#EDEEFF] placeholder-[#8A8FBF]"
                      maxLength={32}
                      disabled={isPending || isConfirming}
                    />
                    {maxNameLength && (
                      <p className="text-xs text-[#8A8FBF] mt-1">
                        {name.length} / {maxNameLength.toString()} characters
                      </p>
                    )}
                  </div>

                  {amountSelectorJSX}

                  {insufficientBalance && balanceWarning && !error && !isError && (
                    <div className="p-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg flex items-start gap-2">
                      <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-300 mb-1">Insufficient Balance</p>
                        <p className="text-xs text-yellow-400 mb-3">{balanceWarning}</p>
                        {authenticated && address && (
                          <button
                            onClick={() => fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount } })}
                            className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#F897FE]/90 transition-colors"
                          >
                            <CreditCard size={16} />
                            Fund with card
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add Funds */}
              {activeTab === 'addFunds' && userMarkee && (
                <div className="space-y-4">
                  {/* Read-only message being funded */}
                  <div style={{ borderRadius: 10, border: '1px solid rgba(138,143,191,0.2)', background: 'rgba(15,27,107,0.35)', padding: '14px 16px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#EDEEFF', lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {userMarkee.message || 'Loading…'}
                    </div>
                    {userMarkee.name && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#8A8FBF', fontStyle: 'italic' }}>- {userMarkee.name}</div>
                    )}
                  </div>

                  {amountSelectorJSX}

                  {insufficientBalance && balanceWarning && !error && !isError && (
                    <div className="p-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg flex items-start gap-2">
                      <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-300 mb-1">Insufficient Balance</p>
                        <p className="text-xs text-yellow-400 mb-3">{balanceWarning}</p>
                        {authenticated && address && (
                          <button
                            onClick={() => fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount } })}
                            className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#F897FE]/90 transition-colors"
                          >
                            <CreditCard size={16} />
                            Fund with card
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Update Message */}
              {activeTab === 'updateMessage' && userMarkee && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Current Message
                    </label>
                    <div className="bg-[#0A0F3D]/50 rounded-lg p-4 border border-[#8A8FBF]/30">
                      <p className="text-[#EDEEFF] font-jetbrains">{userMarkee.message || 'Loading...'}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      New Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Enter your new message..."
                      className="w-full px-4 py-3 bg-[#0A0F3D]/50 border border-[#8A8FBF]/30 rounded-lg focus:ring-2 focus:ring-[#F897FE] focus:border-transparent text-[#EDEEFF] placeholder-[#8A8FBF]"
                      rows={3}
                      maxLength={maxMessageLength ? Number(maxMessageLength) : undefined}
                      disabled={isPending || isConfirming}
                    />
                    {maxMessageLength && (
                      <p className="text-xs text-[#8A8FBF] mt-1">
                        {message.length} / {maxMessageLength.toString()} characters
                      </p>
                    )}
                  </div>

                  <div className="bg-[#F897FE]/10 rounded-lg p-4 border border-[#F897FE]/20">
                    <p className="text-sm text-[#B8B6D9]">
                      💡 How it works: Anyone can add funds to this message and move it up the Leaderboard. Only the owner can change this message.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {(error || isError) && !isPending && !isConfirming && !isSuccess && (
                <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-red-300">{error || writeError?.message}</p>
                </div>
              )}

              {/* Transaction state overlay */}
              {(isPending || isConfirming || isSuccess) && (
                <div className="mt-4 flex flex-col items-center gap-5 py-10 text-center">
                  {isSuccess ? (
                    <div style={{ width: 72, height: 72, borderRadius: 99, background: '#F897FE', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(248,151,254,0.3)' }}>
                      <CheckCircle2 size={32} color="#060A2A" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 99, border: '2px solid #F897FE', borderTopColor: 'transparent', boxShadow: '0 0 32px rgba(248,151,254,0.3)', animation: 'spin 1s linear infinite' }} />
                  )}
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#F897FE', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
                      {isPending && 'Waiting for wallet…'}
                      {isConfirming && 'Transaction pending on Base'}
                      {isSuccess && (activeTab === 'addFunds' ? '✓ Funds added' : '🎉 Message is live')}
                    </div>
                    <div style={{ color: '#8A8FBF', fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
                      {isPending && 'Sign the transaction in your wallet to complete this purchase.'}
                      {isConfirming && 'Usually under 2 seconds on Base. Sit tight.'}
                      {isSuccess && (activeTab === 'addFunds' ? 'Your funds were added to the message.' : `"${message}" is now on the leaderboard.`)}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer: info text + action button — hidden while tx is in flight */}
              {!isPending && !isConfirming && !isSuccess && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(138,143,191,0.2)', display: 'flex', alignItems: 'center', justifyContent: activeTab === 'updateMessage' ? 'flex-end' : 'space-between', gap: 12 }}>
                  {activeTab !== 'updateMessage' && (
                    <div style={{ fontSize: 11, color: '#8A8FBF', lineHeight: 1.5 }}>
                      {activeTab === 'addFunds' ? (
                        <span>Funds are added onchain to this message.</span>
                      ) : (
                        <span>
                          62% of funds go to <span style={{ color: '#B8B6D9' }}>{partnerName || 'this Markee'}</span><br />
                          at <span style={{ color: '#B8B6D9', fontFamily: "'JetBrains Mono', monospace" }}>{strategyAddress ? `${strategyAddress.slice(0, 6)}…${strategyAddress.slice(-4)}` : ''}</span>
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (activeTab === 'create') handleCreateMarkee()
                      else if (activeTab === 'addFunds') handleAddFunds()
                      else handleUpdateMessage()
                    }}
                    disabled={activeTab !== 'updateMessage' && insufficientBalance}
                    style={{ background: (activeTab !== 'updateMessage' && insufficientBalance) ? 'rgba(248,151,254,0.3)' : '#F897FE', color: '#060A2A', border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 700, fontSize: 14, cursor: (activeTab !== 'updateMessage' && insufficientBalance) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {activeTab === 'create' && 'Buy Message'}
                    {activeTab === 'addFunds' && 'Add Funds'}
                    {activeTab === 'updateMessage' && 'Update Message'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
