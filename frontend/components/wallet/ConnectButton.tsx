'use client'

import { useAccount, useConnect, useDisconnect, useEnsName } from 'wagmi'
import { Wallet, ChevronDown, Power } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { formatAddress } from '@/lib/utils'

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: ensName } = useEnsName({ address, chainId: 1 })
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 transition-colors"
      >
        <Wallet size={20} />
        <span className="hidden sm:inline">Connect Wallet</span>
      </button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 transition-colors"
      >
        <Wallet size={20} />
        <span className="hidden sm:inline">
          {ensName || formatAddress(address)}
        </span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Connected with</p>
            <p className="font-medium text-gray-900 dark:text-white mt-1">
              {ensName || formatAddress(address)}
            </p>
            {chain && (
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-2 h-2 rounded-full ${
                  chain.id === 10 ? 'bg-red-500' :
                  chain.id === 8453 ? 'bg-blue-500' :
                  chain.id === 42161 ? 'bg-blue-400' :
                  'bg-gray-400'
                }`} />
                <p className="text-sm text-gray-600 dark:text-gray-300">{chain.name}</p>
              </div>
            )}
          </div>
          
          <div className="p-2">
            <button
              onClick={() => {
                disconnect()
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              <Power size={16} />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
