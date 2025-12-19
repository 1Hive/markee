'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransaction } from 'wagmi'
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
  const { isLoading: isConfirming } = useWaitForTransaction({ hash })

  // Get the TopDawg strategy address from Base
  const strategyAddress = CONTRACTS[CANONICAL_CHAIN.id]?.topDawgStrategies?.[0]?.address

  if (!isOpen) return null

  // Check if user is on Base
  if (chain?.id !== CANONICAL_CHAIN.id) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <h3 className="text-xl font-bold mb-4">Wrong Network</h3>
          <p className="mb-4">Please switch to {CANONICAL_CHAIN.name} to use this feature.</p>
          <button onClick={onClose} className="btn-primary">Close</button>
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
          chainId: CANONICAL_CHAIN.id,
        })
      } else if (mode === 'addFunds' && userMarkee) {
        writeContract({
          address: strategyAddress as `0x${string}`,
          abi: TopDawgStrategyABI,
          functionName: 'addFunds',
          args: [userMarkee.address as `0x${string}`],
          value: parseEther(amount),
          chainId: CANONICAL_CHAIN.id,
        })
      } else if (mode === 'updateMessage' && userMarkee) {
        writeContract({
          address: strategyAddress as `0x${string}`,
          abi: TopDawgStrategyABI,
          functionName: 'updateMessage',
          args: [userMarkee.address as `0x${string}`, message],
          chainId: CANONICAL_CHAIN.id,
        })
      }

      // Call success callback after a delay to let subgraph index
      if (onSuccess) {
        setTimeout(onSuccess, 3000)
      }
    } catch (error) {
      console.error('Transaction error:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">
          {mode === 'create' ? 'Create Message' : mode === 'addFunds' ? 'Add Funds' : 'Update Message'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && (
            <>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="input"
                required
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message"
                className="input"
                required
              />
            </>
          )}
          
          {mode === 'updateMessage' && (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="New message"
              className="input"
              required
            />
          )}
          
          {(mode === 'create' || mode === 'addFunds') && (
            <input
              type="number"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (ETH)"
              className="input"
              required
            />
          )}
          
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || isConfirming}
              className="btn-primary flex-1"
            >
              {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
