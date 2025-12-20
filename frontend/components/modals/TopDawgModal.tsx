'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { TopDawgStrategyABI } from '@/lib/contracts/abis'
import { CONTRACTS, CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import type { Markee } from '@/types'

interface TopDawgModalProps {
  isOpen: boolean
  onClose: () => void
  userMarkee: Markee | null
  initialMode: 'create' | 'addFunds' | 'updateMessage'
  onSuccess?: () => void
}

export function TopDawgModal({ 
  isOpen, 
  onClose, 
  userMarkee, 
  initialMode,
  onSuccess 
}: TopDawgModalProps) {
  const { address, chain } = useAccount()
  const [mode, setMode] = useState(initialMode)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Get the TopDawg strategy address from Base
  const strategyAddress = CONTRACTS[CANONICAL_CHAIN.id]?.topDawgStrategies?.[0]?.address

  // Call success callback when transaction confirms
  if (isSuccess && onSuccess) {
    setTimeout(() => {
      onSuccess()
      onClose()
    }, 3000)
  }

  if (!isOpen) return null

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
    
    if (!strategyAddress || !address) return

    try {
      if (mode === 'create') {
        writeContract({
          address: strategyAddress as `0x${string}`,
          abi: TopDawgStrategyABI,
          functionName: 'createMarkee',
          args: [message, name],
          value: parseEther(amount),
        })
      } else if (mode === 'addFunds' && userMarkee) {
        writeContract({
          address: strategyAddress as `0x${string}`,
          abi: TopDawgStrategyABI,
          functionName: 'addFunds',
          args: [userMarkee.address as `0x${string}`],
          value: parseEther(amount),
        })
      } else if (mode === 'updateMessage' && userMarkee) {
        writeContract({
          address: strategyAddress as `0x${string}`,
          abi: TopDawgStrategyABI,
          functionName: 'updateMessage',
          args: [userMarkee.address as `0x${string}`, message],
        })
      }
    } catch (error) {
      console.error('Transaction error:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4 text-gray-900">
          {mode === 'create' ? 'Create Message' : mode === 'addFunds' ? 'Add Funds' : 'Update Message'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Your message"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  rows={3}
                  required
                />
              </div>
            </>
          )}
          
          {mode === 'updateMessage' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="New message"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                rows={3}
                required
              />
            </div>
          )}
          
          {(mode === 'create' || mode === 'addFunds') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ETH)</label>
              <input
                type="number"
                step="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                required
              />
            </div>
          )}
          
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
              {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : isSuccess ? 'Success!' : 'Submit'}
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
