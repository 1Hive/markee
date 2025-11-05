'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { InvestorStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS } from '@/lib/contracts/addresses'
import type { Markee } from '@/types'

interface InvestmentModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee?: Markee | null
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
}

type ModalTab = 'create' | 'addFunds' | 'updateMessage'

export function InvestmentModal({ isOpen, onClose, userMarkee, initialMode, onSuccess }: InvestmentModalProps) {
  const { address, isConnected, chain } = useAccount()
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const [message, setMessage] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Get strategy address for current chain
  const strategyAddress = chain?.id ? CONTRACTS[chain.id as keyof typeof CONTRACTS]?.investorStrategy : undefined

  // Read minimum price and max message length
  const { data: minimumPrice } = useReadContract({
    address: strategyAddress,
    abi: InvestorStrategyABI,
    functionName: 'minimumPrice',
    chainId: chain?.id,
  })

  const { data: maxMessageLength } = useReadContract({
    address: strategyAddress,
    abi: InvestorStrategyABI,
    functionName: 'maxMessageLength',
    chainId: chain?.id,
  })

  // Set default tab based on initialMode or whether user has a Markee
  useEffect(() => {
    if (initialMode) {
      setActiveTab(initialMode)
      if (userMarkee) {
        setMessage(userMarkee.message)
      } else {
        setMessage('')
      }
    } else if (userMarkee) {
      setActiveTab('addFunds')
      setMessage(userMarkee.message)
    } else {
      setActiveTab('create')
      setMessage('')
    }
    setAmount('')
    setError(null)
  }, [userMarkee, initialMode, isOpen])

  // Reset state and trigger refresh when transaction succeeds
  useEffect(() => {
    if (isSuccess) {
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
  }, [isSuccess, onClose, onSuccess])

  const handleCreateMarkee = async () => {
    if (!strategyAddress || !chain) {
      setError('Please connect to a supported network')
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
      setError(`Minimum investment is ${formatEther(minPrice)} ETH`)
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
        abi: InvestorStrategyABI,
        functionName: 'createMarkee',
        args: [message, ''],  // Empty string for name (optional)
        value: amountWei,
        chainId: chain.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  const handleAddFunds = async () => {
    if (!strategyAddress || !chain || !userMarkee) {
      setError('Please connect wallet and ensure you have a Markee')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter an amount')
      return
    }

    setError(null)

    try {
      writeContract({
        address: strategyAddress,
        abi: InvestorStrategyABI,
        functionName: 'addFunds',
        args: [userMarkee.address as `0x${string}`],
        value: parseEther(amount),
        chainId: chain.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  const handleUpdateMessage = async () => {
    if (!strategyAddress || !chain || !userMarkee) {
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
        abi: InvestorStrategyABI,
        functionName: 'updateMessage',
        args: [userMarkee.address as `0x${string}`, message],
        chainId: chain.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  if (!isOpen) return null

  const canSwitchTabs = !isPending && !isConfirming

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {userMarkee ? 'Manage Your Markee' : 'Create Your Markee'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={isPending || isConfirming}
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        {userMarkee && (
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => canSwitchTabs && setActiveTab('addFunds')}
              disabled={!canSwitchTabs}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'addFunds'
                  ? 'text-markee border-b-2 border-markee'
                  : 'text-gray-600 hover:text-gray-900'
              } ${!canSwitchTabs ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Add Funds
            </button>
            <button
              onClick={() => canSwitchTabs && setActiveTab('updateMessage')}
              disabled={!canSwitchTabs}
              className={`flex-1 px-6 py-3 font-medium transition ${
                activeTab === 'updateMessage'
                  ? 'text-markee border-b-2 border-markee'
                  : 'text-gray-600 hover:text-gray-900'
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
              <p className="text-gray-600 mb-4">Please connect your wallet to continue</p>
            </div>
          ) : !strategyAddress ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-gray-600 mb-4">
                Markee is not yet deployed on {chain?.name}. Please switch to Optimism.
              </p>
            </div>
          ) : (
            <>
              {/* Create Markee */}
              {activeTab === 'create' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Your Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Enter your message..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                      rows={3}
                      maxLength={maxMessageLength ? Number(maxMessageLength) : undefined}
                      disabled={isPending || isConfirming}
                    />
                    {maxMessageLength && (
                      <p className="text-xs text-gray-500 mt-1">
                        {message.length} / {maxMessageLength.toString()} characters
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Investment Amount (ETH)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.01"
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                      disabled={isPending || isConfirming}
                    />
                    {minimumPrice && (
                      <p className="text-xs text-gray-500 mt-1">
                        Minimum: {formatEther(minimumPrice)} ETH
                      </p>
                    )}
                  </div>

                  <div className="bg-markee-50 rounded-lg p-4">
                    <p className="text-sm text-markee-900">
                      🎯 Your investment creates your Markee and ranks you on the leaderboard. The
                      more you invest, the higher you rank!
                    </p>
                  </div>
                </div>
              )}

              {/* Add Funds */}
              {activeTab === 'addFunds' && userMarkee && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Current Investment</p>
                    <p className="text-2xl font-bold text-markee">
                      {formatEther(userMarkee.totalFundsAdded)} ETH
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Amount (ETH)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.01"
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                      disabled={isPending || isConfirming}
                    />
                  </div>

                  <div className="bg-markee-50 rounded-lg p-4">
                    <p className="text-sm text-markee-900">
                      💰 Add more funds to climb the leaderboard and increase your prominence!
                    </p>
                  </div>
                </div>
              )}

              {/* Update Message */}
              {activeTab === 'updateMessage' && userMarkee && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Enter your new message..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                      rows={3}
                      maxLength={maxMessageLength ? Number(maxMessageLength) : undefined}
                      disabled={isPending || isConfirming}
                    />
                    {maxMessageLength && (
                      <p className="text-xs text-gray-500 mt-1">
                        {message.length} / {maxMessageLength.toString()} characters
                      </p>
                    )}
                  </div>

                  <div className="bg-markee-50 rounded-lg p-4">
                    <p className="text-sm text-markee-900">
                      ✏️ Update your message for free anytime! Your investment amount stays the same.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {(error || isError) && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-red-600">{error || writeError?.message}</p>
                </div>
              )}

              {/* Success Message */}
              {isSuccess && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-green-900">Transaction successful!</p>
                    <p className="text-xs text-green-700 mt-1">Refreshing leaderboard...</p>
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
                  disabled={isPending || isConfirming || isSuccess}
                  className="w-full bg-markee text-white px-6 py-3 rounded-lg font-semibold hover:bg-markee-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
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
                      {activeTab === 'create' && 'Create Markee'}
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
