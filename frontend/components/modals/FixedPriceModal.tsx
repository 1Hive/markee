'use client'

import { useState, useEffect } from 'react'
import { 
  useAccount, 
  useBalance,
  useReadContract,
  useWriteContract, 
  useWaitForTransactionReceipt, 
  useConnect 
} from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

interface FixedPriceModalProps {
  isOpen: boolean
  onClose: () => void
  fixedMarkee: FixedMarkee | null
  onSuccess?: () => void
}

export function FixedPriceModal({
  isOpen,
  onClose,
  fixedMarkee,
  onSuccess
}: FixedPriceModalProps) {
  const { isConnected, chain, address } = useAccount()
  const { connectors, connect } = useConnect()

  // Get user's ETH balance
  const { data: balanceData } = useBalance({
    address: address,
    chainId: CANONICAL_CHAIN.id,
  })

  // Read maxMessageLength from contract
  const { data: maxMessageLength } = useReadContract({
    address: fixedMarkee?.strategyAddress as `0x${string}`,
    abi: FixedPriceStrategyABI,
    functionName: 'maxMessageLength',
    chainId: CANONICAL_CHAIN.id,
    query: {
      enabled: !!fixedMarkee?.strategyAddress,
    },
  })

  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const {
    writeContract,
    data: hash,
    isPending,
    isError,
    error: writeError,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen && fixedMarkee) {
      setNewMessage('')
      setError(null)
      reset()
    }
  }, [isOpen, fixedMarkee, reset])

  // Close modal & refresh after success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        if (onSuccess) onSuccess()
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose, onSuccess])

  // Check if user can afford the message change
  const canAffordMessage = () => {
    if (!fixedMarkee?.price || !balanceData) return false
    
    const priceWei = parseEther(fixedMarkee.price)
    const estimatedGas = parseEther('0.001') // Rough estimate for gas
    const totalNeeded = priceWei + estimatedGas
    
    return balanceData.value >= totalNeeded
  }

  const getInsufficientBalanceMessage = () => {
    if (!fixedMarkee?.price || !balanceData) return null
    
    const priceWei = parseEther(fixedMarkee.price)
    const estimatedGas = parseEther('0.001')
    const totalNeeded = priceWei + estimatedGas
    
    if (balanceData.value < totalNeeded) {
      const shortfall = totalNeeded - balanceData.value
      return `You don't have enough ETH to complete this transaction.`
    }
    
    return null
  }

  const handleChangeMessage = async () => {
    if (!fixedMarkee || !chain) {
      setError('Please connect your wallet')
      return
    }

    if (chain.id !== CANONICAL_CHAIN.id) {
      setError(`Please switch to ${CANONICAL_CHAIN.name}`)
      return
    }

    if (!newMessage.trim()) {
      setError('Please enter a message')
      return
    }

    if (!fixedMarkee.price) {
      setError('Unable to load price')
      return
    }

    // Check message length
    if (maxMessageLength && newMessage.length > Number(maxMessageLength)) {
      setError(`Message exceeds maximum length of ${maxMessageLength} characters`)
      return
    }

    // Check balance before attempting transaction
    if (!canAffordMessage()) {
      setError(getInsufficientBalanceMessage() || 'Insufficient balance')
      return
    }

    setError(null)

    try {
      writeContract({
        address: fixedMarkee.strategyAddress as `0x${string}`,
        abi: FixedPriceStrategyABI,
        functionName: 'changeMessage',
        args: [newMessage, ''], // Empty string for name
        value: parseEther(fixedMarkee.price),
        chainId: CANONICAL_CHAIN.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  if (!isOpen || !fixedMarkee) return null

  const isWrongNetwork = chain && chain.id !== CANONICAL_CHAIN.id
  const priceDisplay = fixedMarkee.price ? `${fixedMarkee.price} ETH` : '...'
  const markeeTokens = fixedMarkee.price ? parseFloat(fixedMarkee.price) * 62000 : 0
  const insufficientBalance = !canAffordMessage()
  const balanceWarning = getInsufficientBalanceMessage()
  
  const currentLength = newMessage.length
  const maxLength = maxMessageLength ? Number(maxMessageLength) : null
  const isOverLimit = maxLength && currentLength > maxLength

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-[#0A0F3D] to-[#060A2A] rounded-xl shadow-2xl border border-[#8A8FBF]/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#8A8FBF]/30">
          <h2 className="text-2xl font-bold text-[#EDEEFF]">
            Change Message
          </h2>
          <button
            onClick={onClose}
            className="text-[#8A8FBF] hover:text-[#EDEEFF] transition"
            disabled={isPending || isConfirming}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {/* Wallet State */}
          {!isConnected ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-yellow-500" size={48} />
              <p className="text-[#B8B6D9] mb-4">Please connect your wallet to continue</p>
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="bg-[#F897FE] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#F897FE]/90 transition mt-4"
              >
                Connect Wallet
              </button>
            </div>
          ) : isWrongNetwork ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-[#B8B6D9] mb-4">
                Please switch to {CANONICAL_CHAIN.name} to continue
              </p>
            </div>
          ) : (
            <>
              {/* Current Message */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#B8B6D9] mb-2">
                  Current Message
                </label>
                <div className="bg-[#0A0F3D]/50 rounded-lg p-4 border border-[#8A8FBF]/30">
                  <p className="text-[#EDEEFF] font-jetbrains">
                    {fixedMarkee.message || 'No message yet'}
                  </p>
                </div>
              </div>

              {/* New Message Input */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-[#B8B6D9]">
                    New Message
                  </label>
                  {maxLength && (
                    <span className={`text-xs ${isOverLimit ? 'text-red-400' : 'text-[#8A8FBF]'}`}>
                      {currentLength}/{maxLength}
                    </span>
                  )}
                </div>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Enter your new message..."
                  className={`w-full px-4 py-3 bg-[#0A0F3D]/50 border rounded-lg 
                             focus:ring-2 focus:ring-[#F897FE] focus:border-transparent 
                             text-[#EDEEFF] placeholder-[#8A8FBF]
                             ${isOverLimit ? 'border-red-500/50' : 'border-[#8A8FBF]/30'}`}
                  rows={3}
                  disabled={isPending || isConfirming}
                />
              </div>

              {/* Featured MARKEE Token Display */}
              {markeeTokens > 0 && (
                <div className="mb-6 bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 border-2 border-[#F897FE]/50 rounded-xl p-6">
                  <div className="text-center">
                    <p className="text-sm text-[#F897FE] font-medium mb-2">You'll receive</p>
                    <p className="text-4xl font-bold text-[#F897FE] mb-2">
                      {markeeTokens.toLocaleString()}
                    </p>
                    <p className="text-xl font-semibold text-[#F897FE]">MARKEE tokens</p>
                  </div>
                </div>
              )}

              {/* Price Info */}
              <div className="mb-6 bg-[#F897FE]/10 rounded-lg p-4 border border-[#F897FE]/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#B8B6D9] font-medium">Price to Change Message</p>
                  <p className="text-2xl font-bold text-[#F897FE]">
                    {priceDisplay}
                  </p>
                </div>
                {balanceData && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#F897FE]/20">
                    <p className="text-xs text-[#B8B6D9]">Your Balance</p>
                    <p className="text-sm font-medium text-[#EDEEFF]">
                      {parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH
                    </p>
                  </div>
                )}
              </div>

              {/* Insufficient Balance Warning */}
              {insufficientBalance && balanceWarning && !error && !isError && (
                <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-yellow-300 mb-1">Insufficient Balance</p>
                    <p className="text-xs text-yellow-400">{balanceWarning}</p>
                  </div>
                </div>
              )}

              <div className="bg-[#F897FE]/10 rounded-lg p-4 mb-6 border border-[#F897FE]/20">
                <p className="text-sm text-[#B8B6D9]">
                  This is PRIME digital real estate. Only change this message if you're holding some really big bags. If you do decide to change this message, please read the Markee Cooperative's Covenant first - by buying you agree to its terms.
                </p>
              </div>

              {/* Error Message */}
              {(error || isError) && (
                <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-red-300">{error || writeError?.message}</p>
                </div>
              )}

              {/* Success Message */}
              {isSuccess && (
                <div className="mb-4 p-4 bg-green-900/20 border border-green-500/50 rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-green-300">Message changed successfully!</p>
                    <p className="text-xs text-green-400 mt-1">Refreshing...</p>
                  </div>
                </div>
              )}

              {/* Action */}
              <button
                onClick={handleChangeMessage}
                disabled={isPending || isConfirming || isSuccess || !newMessage.trim() || insufficientBalance || isOverLimit}
                className="w-full bg-[#F897FE] text-white px-6 py-3 rounded-lg font-semibold
                           hover:bg-[#F897FE]/90 disabled:bg-[#8A8FBF]/30 disabled:cursor-not-allowed 
                           transition flex items-center justify-center gap-2"
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
                ) : insufficientBalance ? (
                  'Insufficient Balance'
                ) : isOverLimit ? (
                  'Message Too Long'
                ) : (
                  <>
                    Change Message ({priceDisplay})
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
