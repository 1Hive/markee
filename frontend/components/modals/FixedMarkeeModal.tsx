'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useConnect } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { FixedStrategyABI } from '@/lib/contracts/abis'
import { optimism } from 'wagmi/chains'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

interface FixedMarkeeModalProps {
  isOpen: boolean
  onClose: () => void
  fixedMarkee: FixedMarkee | null
  onSuccess?: () => void
}

export function FixedMarkeeModal({ isOpen, onClose, fixedMarkee, onSuccess }: FixedMarkeeModalProps) {
  const { isConnected, chain } = useAccount()
  const { connectors, connect } = useConnect()
  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Reset state when modal opens with new fixedMarkee
  useEffect(() => {
    if (isOpen && fixedMarkee) {
      setNewMessage('')
      setError(null)
      reset()
    }
  }, [isOpen, fixedMarkee, reset])

  // Close modal and trigger refresh after success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        if (onSuccess) {
          onSuccess()
        }
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose, onSuccess])

  const handleChangeMessage = async () => {
    if (!fixedMarkee || !chain) {
      setError('Please connect your wallet')
      return
    }

    if (chain.id !== optimism.id) {
      setError('Please switch to Optimism network')
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

    setError(null)

    try {
      writeContract({
        address: fixedMarkee.strategyAddress as `0x${string}`,
        abi: FixedStrategyABI,
        functionName: 'changeMessage',
        args: [newMessage],
        value: fixedMarkee.price,
        chainId: optimism.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  if (!isOpen || !fixedMarkee) return null

  const isWrongNetwork = chain && chain.id !== optimism.id

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            Change Message
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={isPending || isConfirming}
          >
            <X size={24} />
          </button>
        </div>

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
          ) : isWrongNetwork ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
              <p className="text-gray-600 mb-4">
                Please switch to Optimism network to change this message
              </p>
            </div>
          ) : (
            <>
              {/* Current Message */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Message
                </label>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-gray-900 font-mono">{fixedMarkee.message || 'Loading...'}</p>
                </div>
              </div>

              {/* Price Info */}
              <div className="mb-6 bg-markee-50 rounded-lg p-4 border border-markee-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-markee-900 font-medium">Price to Change Message</p>
                  </div>
                  <div className="text-2xl font-bold text-markee">
                    {fixedMarkee.price ? formatEther(fixedMarkee.price) : '...'} ETH
                  </div>
                </div>
              </div>

              {/* Featured MARKEE Token Display */}
              {fixedMarkee.price && (
                <div className="mb-6 bg-gradient-to-r from-markee-50 to-green-50 border-2 border-markee rounded-xl p-6">
                  <div className="text-center">
                    <p className="text-sm text-markee-700 font-medium mb-2">You'll receive</p>
                    <p className="text-4xl font-bold text-markee mb-2">
                      {(parseFloat(formatEther(fixedMarkee.price)) * 31000).toLocaleString()}
                    </p>
                    <p className="text-xl font-semibold text-markee-700">MARKEE tokens</p>
                  </div>
                </div>
              )}

              {/* New Message Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Message
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Enter your new message..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-markee-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  rows={3}
                  disabled={isPending || isConfirming}
                />
              </div>

              {/* Info Box */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-700">
                  🪧 You thought you could afford to change the hero signs on this site?? HA! Keep dreaming. If you've got the ETH to change this, you'll get MARKEE tokens and become a member of the Markee Cooperative and agree to the Covenant.
                </p>
              </div>

              {/* Error Message */}
              {(error || isError) && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-red-600">{error || writeError?.message}</p>
                </div>
              )}

              {/* Success Message */}
              {isSuccess && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-green-900">Message changed successfully!</p>
                    <p className="text-xs text-green-700 mt-1">Refreshing...</p>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleChangeMessage}
                disabled={isPending || isConfirming || isSuccess || !newMessage.trim()}
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
                    Change Message
                    {fixedMarkee.price && (
                      <span className="text-sm opacity-90">
                        ({formatEther(fixedMarkee.price)} ETH)
                      </span>
                    )}
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
