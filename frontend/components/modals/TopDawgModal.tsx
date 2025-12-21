'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useConnect, useSwitchChain } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { TopDawgStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import type { Markee } from '@/types'

interface TopDawgModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee?: Markee | null
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
}

type ModalTab = 'create' | 'addFunds' | 'updateMessage'

export function TopDawgModal({ isOpen, onClose, userMarkee, initialMode, onSuccess }: TopDawgModalProps) {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect } = useConnect()
  const { switchChain } = useSwitchChain()
  const [activeTab, setActiveTab] = useState<ModalTab>('create')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Get TopDawg strategy address from Base (canonical chain)
  const strategyAddress = CONTRACTS[CANONICAL_CHAIN.id]?.topDawgStrategies?.[0]?.address

  // Check if user is on the correct chain
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  // Read minimum price and max message length from TopDawg strategy
  const { data: minimumPrice } = useReadContract({
    address: strategyAddress,
    abi: TopDawgStrategyABI,
    functionName: 'minimumPrice',
    chainId: CANONICAL_CHAIN.id,
  })

  const { data: maxMessageLength } = useReadContract({
    address: strategyAddress,
    abi: TopDawgStrategyABI,
    functionName: 'maxMessageLength',
    chainId: CANONICAL_CHAIN.id,
  })

  const { data: maxNameLength } = useReadContract({
    address: strategyAddress,
    abi: TopDawgStrategyABI,
    functionName: 'maxNameLength',
    chainId: CANONICAL_CHAIN.id,
  })

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

    setError(null)

    try {
      writeContract({
        address: strategyAddress,
        abi: TopDawgStrategyABI,
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

    setError(null)

    try {
      writeContract({
        address: strategyAddress,
        abi: TopDawgStrategyABI,
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
        abi: TopDawgStrategyABI,
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {getModalTitle()}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={isPending || isConfirming}
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs - only show if user is owner */}
        {userMarkee && isOwner && (
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
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="bg-markee text-white px-6 py-3 rounded-lg font-semibold hover:bg-markee-600 transition mt-4"
              >
                Connect Wallet
              </button>
            </div>
          ) : !isCorrectChain ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-gray-600 mb-4">
                Please switch to {CANONICAL_CHAIN.name} to use Markee
              </p>
              <button
                onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
                className="bg-markee text-white px-6 py-3 rounded-lg font-semibold hover:bg-markee-600 transition mt-4"
              >
                Switch to {CANONICAL_CHAIN.name}
              </button>
            </div>
          ) : !strategyAddress ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-gray-600 mb-4">
                TopDawg strategy not configured. Please contact support.
              </p>
            </div>
          ) : (
            <>
              {/* Buy a Message (Create) */}
              {activeTab === 'create' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Set Your First Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us how you really feel..."
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
                      Display Name (optional)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Take credit for your masterpiece..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                      maxLength={32}
                      disabled={isPending || isConfirming}
                    />
                    {maxNameLength && (
                      <p className="text-xs text-gray-500 mt-1">
                        {name.length} / {maxNameLength.toString()} characters
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount to Pay (ETH)
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

                  {/* Featured MARKEE Token Display */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className="bg-gradient-to-r from-markee-50 to-green-50 border-2 border-markee rounded-xl p-6">
                      <div className="text-center">
                        <p className="text-sm text-markee-700 font-medium mb-2">You'll receive</p>
                        <p className="text-4xl font-bold text-markee mb-2">
                          {(parseFloat(amount) * 62000).toLocaleString()}
                        </p>
                        <p className="text-xl font-semibold text-markee-700">MARKEE tokens</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-markee-50 rounded-lg p-4">
                    <p className="text-sm text-markee-900">
                      By buying a message and getting MARKEE tokens, you agree to the Covenant and become a member of the Markee Cooperative.
                    </p>
                  </div>
                </div>
              )}

              {/* Add Funds */}
              {activeTab === 'addFunds' && userMarkee && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Total Funds Added</p>
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

                  {/* Featured MARKEE Token Display */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className="bg-gradient-to-r from-markee-50 to-green-50 border-2 border-markee rounded-xl p-6">
                      <div className="text-center">
                        <p className="text-sm text-markee-700 font-medium mb-2">You'll receive</p>
                        <p className="text-4xl font-bold text-markee mb-2">
                          {(parseFloat(amount) * 31000).toLocaleString()}
                        </p>
                        <p className="text-xl font-semibold text-markee-700">MARKEE tokens</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-markee-50 rounded-lg p-4">
                    <p className="text-sm text-markee-900">
                      💰 Add more funds to climb the leaderboard! You'll get the same amount of MARKEE tokens as you would for creating a new message.
                    </p>
                  </div>
                </div>
              )}

              {/* Update Message */}
              {activeTab === 'updateMessage' && userMarkee && (
                <div className="space-y-4">
                  {/* Current Message */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Message
                    </label>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-gray-900 font-mono">{userMarkee.message || 'Loading...'}</p>
                    </div>
                  </div>

                  {/* New Message */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Enter your new message..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
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
                      💡 How it works: Anyone can add funds to this message and move it up the Leaderboard. Only the owner can change this message.
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
