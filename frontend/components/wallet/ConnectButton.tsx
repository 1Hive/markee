'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Wallet } from 'lucide-react'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 flex items-center gap-2"
      >
        <Wallet size={20} />
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
    >
      <Wallet size={20} />
      Connect Wallet
    </button>
  )
}
