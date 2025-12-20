'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
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
  const { address, chain } = useAccount()
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Call success callback when transaction confirms
  if (isSuccess && onSuccess) {
    setTimeout(() => {
      onSuccess()
      onClose()
    }, 3000)
  }

  if (!isOpen || !fixedMarkee) return null

  // Check if user is on Base
  if (chain?.id !== CANONICAL_CHAIN.id) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <h3 className="text-xl font-bold mb-4 text-gray-900">Wrong Network</h3>
          <p className="mb-4 text-gray-700">Please switch to {CANONICAL_CHAIN.name} to use this feature.</p>
          <button onClick={onClose} className="btn-primary w-full">Close</button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!address || !fixedMarkee.price) return

    try {
      writeContract({
        address: fixedMarkee.strategyAddress as `0x${string}`,
        abi: FixedPriceStrategyABI,
        functionName: 'changeMessage',
        args: [message, name],
        value: parseEther(fixedMarkee.price),
      })
    } catch (error) {
      console.error('Transaction error:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4 text-gray-900">Change Message: {fixedMarkee.name}</h3>
        
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600 mb-1">Current Message:</p>
          <p className="text-gray-900 font-medium">{fixedMarkee.message || 'No message yet'}</p>
          <p className="text-sm text-gray-600 mt-2 mb-1">Price:</p>
          <p className="text-gray-900 font-bold">{fixedMarkee.price} ETH</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
              rows={3}
              required
            />
          </div>
          
          {isSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-green-800 text-sm">
              ✓ Transaction confirmed! Refreshing data...
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || isConfirming}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : isSuccess ? 'Success!' : `Pay ${fixedMarkee.price} ETH`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending || isConfirming}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
