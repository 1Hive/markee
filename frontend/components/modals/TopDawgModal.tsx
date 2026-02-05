'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { X, Loader2, CheckCircle2, AlertCircle, ArrowRightLeft } from 'lucide-react'
import { TopDawgStrategyABI, TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import type { Markee } from '@/types'

interface TopDawgModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee?: Markee | null
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
  strategyAddress?: `0x${string}` // Optional: for partner strategies
  partnerName?: string // Optional: partner display name
  partnerSplitPercentage?: number // Optional: percentage going to partner (e.g., 62 for 62%)
  topFundsAdded?: bigint // Optional: current top message's totalFundsAdded for competitive display
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
  partnerSplitPercentage,
  topFundsAdded
}: TopDawgModalProps) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Get user's ETH balance
  const { data: balanceData } = useBalance({
    address: address,
    chainId: CANONICAL_CHAIN.id,
  })

  // Get strategy address - use custom one if provided, otherwise default TopDawg
  const strategyAddress = customStrategyAddress || CONTRACTS[CANONICAL_CHAIN.id]?.topDawgStrategies?.[0]?.address

  // Use the appropriate ABI based on whether it's a partner strategy
  const strategyABI = customStrategyAddress ? TopDawgPartnerStrategyABI : TopDawgStrategyABI

  // Check if user is on the correct chain
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  // Get current phase rate from RevNet schedule
  const getCurrentPhaseRate = () => {
    // TODO: Import PHASES from a shared config file
    // For now, using inline schedule - should match owners/page.tsx
    const PHASES = [
      { rate: 100000, endDate: new Date('2026-03-21T00:00:00Z') },
      { rate: 50000, endDate: new Date('2026-06-21T00:00:00Z') },
      { rate: 25000, endDate: new Date('2026-09-21T00:00:00Z') },
      { rate: 12500, endDate: new Date('2026-12-21T00:00:00Z') },
      { rate: 6250, endDate: new Date('2027-03-21T00:00:00Z') },
    ]
    
    const now = new Date()
    for (const phase of PHASES) {
      if (now < phase.endDate) {
        return phase.rate
      }
    }
    return PHASES[PHASES.length - 1].rate // Return last phase rate if all dates passed
  }

  // Calculate MARKEE tokens user receives (accounting for cooperative reserve)
  const calculateMarkeeTokens = (ethAmount: number) => {
    const baseRate = getCurrentPhaseRate() // Dynamic rate based on current RevNet phase
    const COOPERATIVE_RESERVE_PERCENT = 0.38 // 38% of all issuance goes to cooperative
    const USER_PERCENT = 0.62 // 62% of all issuance goes to user
    
    if (partnerSplitPercentage) {
      // Partner model: partner gets X% directly, (100-X)% goes to RevNet
      // Example: If partner gets 62%, then 38% goes to RevNet
      const revnetPercentage = (100 - partnerSplitPercentage) / 100 // 0.38 for 62% partner
      const tokensIssued = ethAmount * baseRate * revnetPercentage // 0.38 ETH times 100k = 38k tokens
      return tokensIssued * USER_PERCENT // User gets 62% of those tokens = 23,560
    }
    
    // Markee Cooperative model: 100% goes to RevNet
    const tokensIssued = ethAmount * baseRate // 1 ETH times 100k = 100k tokens
    return tokensIssued * USER_PERCENT // User gets 62% of those tokens = 62,000
  }

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

  // Check if user can afford the transaction
  const canAffordTransaction = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return false
    
    try {
      const amountWei = parseEther(amount)
      const estimatedGas = parseEther('0.001') // Rough estimate for gas
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

  // Set default tab based on initialMode or whether user has a Markee
  useEffect(() => {
    if (initialMode) {
      setActiveTab(initialMode)
      if (initialMode === 'updateMessage' && userMarkee) {
        setMessage('') // Start with empty for new message
      } else {
        setMessage('')
      }
    } else if (userMarkee) {
      setActiveTab('addFunds')
      setMessage('')
    } else {
      setActiveTab('create')
      setMessage('')
    }
    setAmount('')
    setError(null)
    reset()
  }, [userMarkee, initialMode, isOpen, reset])

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

    // Check balance before attempting transaction
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

    // Check balance before attempting transaction
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

  // Determine modal title
  const getModalTitle = () => {
    if (!userMarkee) return 'Buy a Message'
    if (activeTab === 'addFunds') return 'Add Funds'
    if (activeTab === 'updateMessage') return 'Update Message'
    return 'Manage Your Markee'
  }

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gradient-to-br from-[#0A0F3D] to-[#060A2A] rounded-xl shadow-2xl border border-[#8A8FBF]/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#8A8FBF]/30">
          <h2 className="text-2xl font-bold text-[#EDEEFF]">
            {getModalTitle()}
          </h2>
          <button
            onClick={onClose}
            className="text-[#8A8FBF] hover:text-[#EDEEFF] transition"
            disabled={isPending || isConfirming}
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
                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Your Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us how you really feel..."
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

                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Amount to Pay (ETH)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.01"
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 bg-[#0A0F3D]/50 border border-[#8A8FBF]/30 rounded-lg focus:ring-2 focus:ring-[#F897FE] focus:border-transparent text-[#EDEEFF] placeholder-[#8A8FBF]"
                      disabled={isPending || isConfirming}
                    />
                    {minimumPrice && (
                      <p className="text-xs text-[#8A8FBF] mt-1">
                        Minimum: {formatEther(minimumPrice)} ETH
                      </p>
                    )}
                    {balanceData && (
                      <p className="text-xs text-[#8A8FBF] mt-1">
                        Your Balance: {parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH
                      </p>
                    )}
                    {topFundsAdded && topFundsAdded > 0n && (
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <p className="text-[#7C9CFF]">
                          🏆 Top spot: {parseFloat(formatEther(topFundsAdded)).toFixed(4)} ETH
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const beatAmount = (parseFloat(formatEther(topFundsAdded)) * 1.05).toFixed(4)
                            setAmount(beatAmount)
                          }}
                          className="text-[#F897FE] hover:text-[#F897FE]/80 font-semibold transition-colors"
                          disabled={isPending || isConfirming}
                        >
                          Beat by 5% →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Token/Partner Distribution Display */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className={`grid ${partnerName ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                      {/* MARKEE Tokens Box */}
                      <div className="bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 border-2 border-[#F897FE]/50 rounded-xl p-6">
                        <div className="text-center">
                          <p className="text-sm text-[#F897FE] font-medium mb-2">You'll receive</p>
                          <p className="text-4xl font-bold text-[#F897FE] mb-2">
                            {calculateMarkeeTokens(parseFloat(amount)).toLocaleString()}
                          </p>
                          <p className="text-xl font-semibold text-[#F897FE]">MARKEE tokens</p>
                        </div>
                      </div>

                      {/* Partner Distribution Box - only show for partners */}
                      {partnerName && partnerSplitPercentage && (
                        <div className="bg-gradient-to-r from-[#FFA94D]/20 to-[#FF8E3D]/20 border-2 border-[#FFA94D]/50 rounded-xl p-6">
                          <div className="text-center">
                            <p className="text-sm text-[#FFA94D] font-medium mb-2">{partnerName} receives</p>
                            <p className="text-4xl font-bold text-[#FFA94D] mb-2">
                              {(parseFloat(amount) * (partnerSplitPercentage / 100)).toFixed(4)}
                            </p>
                            <p className="text-xl font-semibold text-[#FFA94D]">ETH</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-[#F897FE]/10 rounded-lg p-4 border border-[#F897FE]/20">
                    <p className="text-sm text-[#B8B6D9]">
                      {partnerName 
                        ? `Your payment supports ${partnerName} and the Markee Cooperative. You'll receive MARKEE tokens (62% of tokens issued), with 38% allocated to the Cooperative reserve.`
                        : 'You'll receive MARKEE tokens (62% of tokens issued), with 38% allocated to the Cooperative reserve. By buying a message, you become a member of the Markee Cooperative.'
                      }
                    </p>
                  </div>

                  {/* Insufficient Balance Warning */}
                  {insufficientBalance && balanceWarning && !error && !isError && (
                    <div className="p-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg flex items-start gap-2">
                      <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-medium text-yellow-300 mb-1">Insufficient Balance</p>
                        <p className="text-xs text-yellow-400">{balanceWarning}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add Funds */}
              {activeTab === 'addFunds' && userMarkee && (
                <div className="space-y-4">
                  <div className="bg-[#0A0F3D]/50 rounded-lg p-4 border border-[#8A8FBF]/30">
                    <p className="text-sm text-[#8A8FBF] mb-1">Total Funds Added</p>
                    <p className="text-2xl font-bold text-[#F897FE]">
                      {formatEther(userMarkee.totalFundsAdded)} ETH
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Additional Amount (ETH)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.01"
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 bg-[#0A0F3D]/50 border border-[#8A8FBF]/30 rounded-lg focus:ring-2 focus:ring-[#F897FE] focus:border-transparent text-[#EDEEFF] placeholder-[#8A8FBF]"
                      disabled={isPending || isConfirming}
                    />
                    {balanceData && (
                      <p className="text-xs text-[#8A8FBF] mt-1">
                        Your Balance: {parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH
                      </p>
                    )}
                  </div>

                  {/* Token/Partner Distribution Display */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className={`grid ${partnerName ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                      {/* MARKEE Tokens Box */}
                      <div className="bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 border-2 border-[#F897FE]/50 rounded-xl p-6">
                        <div className="text-center">
                          <p className="text-sm text-[#F897FE] font-medium mb-2">You'll receive</p>
                          <p className="text-4xl font-bold text-[#F897FE] mb-2">
                            {calculateMarkeeTokens(parseFloat(amount)).toLocaleString()}
                          </p>
                          <p className="text-xl font-semibold text-[#F897FE]">MARKEE tokens</p>
                        </div>
                      </div>

                      {/* Partner Distribution Box - only show for partners */}
                      {partnerName && partnerSplitPercentage && (
                        <div className="bg-gradient-to-r from-[#FFA94D]/20 to-[#FF8E3D]/20 border-2 border-[#FFA94D]/50 rounded-xl p-6">
                          <div className="text-center">
                            <p className="text-sm text-[#FFA94D] font-medium mb-2">{partnerName} receives</p>
                            <p className="text-4xl font-bold text-[#FFA94D] mb-2">
                              {(parseFloat(amount) * (partnerSplitPercentage / 100)).toFixed(4)}
                            </p>
                            <p className="text-xl font-semibold text-[#FFA94D]">ETH</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-[#F897FE]/10 rounded-lg p-4 border border-[#F897FE]/20">
                    <p className="text-sm text-[#B8B6D9]">
                      💰 Add more funds to climb the leaderboard! You'll get the same amount of MARKEE tokens as you would for creating a new message.
                    </p>
                  </div>

                  {/* Insufficient Balance Warning */}
                  {insufficientBalance && balanceWarning && !error && !isError && (
                    <div className="p-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg flex items-start gap-2">
                      <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-medium text-yellow-300 mb-1">Insufficient Balance</p>
                        <p className="text-xs text-yellow-400">{balanceWarning}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Update Message */}
              {activeTab === 'updateMessage' && userMarkee && (
                <div className="space-y-4">
                  {/* Current Message */}
                  <div>
                    <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                      Current Message
                    </label>
                    <div className="bg-[#0A0F3D]/50 rounded-lg p-4 border border-[#8A8FBF]/30">
                      <p className="text-[#EDEEFF] font-jetbrains">{userMarkee.message || 'Loading...'}</p>
                    </div>
                  </div>

                  {/* New Message */}
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
              {(error || isError) && (
                <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-red-300">{error || writeError?.message}</p>
                </div>
              )}

              {/* Success Message */}
              {isSuccess && (
                <div className="mt-4 p-4 bg-green-900/20 border border-green-500/50 rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-green-300">Transaction successful!</p>
                    <p className="text-xs text-green-400 mt-1">Refreshing leaderboard...</p>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="mt-6">
                <button
                  onClick={() => {
                    if (activeTab === 'create') handleCreateMarkee()
                    else if (activeTab === 'addFunds') handleAddFunds()
                    else handleUpdateMessage()
                  }}
                  disabled={isPending || isConfirming || isSuccess || (activeTab !== 'updateMessage' && insufficientBalance)}
                  className="w-full bg-[#F897FE] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#F897FE]/90 disabled:bg-[#8A8FBF]/30 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      {isPending ? 'Confirm in wallet...' : 'Processing...'}
                    </>
                  ) : isSuccess ? (
                    <>
                      <CheckCircle2 size={20} />
                      Success!
                    </>
                  ) : (
                    <>
                      {activeTab === 'create' && 'Buy Message'}
                      {activeTab === 'addFunds' && 'Add Funds'}
                      {activeTab === 'updateMessage' && 'Update Message'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
