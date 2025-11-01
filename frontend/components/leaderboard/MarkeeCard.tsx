'use client'

import { formatEth, formatAddress } from '@/lib/utils'
import type { Markee } from '@/types'

interface MarkeeCardProps {
  markee: Markee
  rank: number
  size: 'hero' | 'large' | 'medium' | 'small' | 'list'
}

function getChainColor(chainId: number): string {
  switch (chainId) {
    case 10: return 'bg-red-500' // Optimism
    case 8453: return 'bg-blue-500' // Base
    case 42161: return 'bg-blue-400' // Arbitrum
    default: return 'bg-gray-400'
  }
}

function getChainName(chainId: number): string {
  switch (chainId) {
    case 10: return 'Optimism'
    case 8453: return 'Base'
    case 42161: return 'Arbitrum'
    default: return 'Unknown'
  }
}

export function MarkeeCard({ markee, rank, size }: MarkeeCardProps) {
  const chainColor = getChainColor(markee.chainId)
  const chainName = getChainName(markee.chainId)

  // List view (compact, single line)
  if (size === 'list') {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <span className="text-sm font-bold text-gray-400 w-8">#{rank}</span>
          <p className="text-sm text-gray-900 truncate flex-1">{markee.message}</p>
          <span className="text-sm text-gray-600 flex-shrink-0">{formatAddress(markee.owner)}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <div className={`w-2 h-2 rounded-full ${chainColor}`} title={chainName} />
          <span className="text-sm font-bold text-blue-600">{formatEth(markee.totalFundsAdded)} ETH</span>
        </div>
      </div>
    )
  }

  // Hero view (rank #1)
  if (size === 'hero') {
    return (
      <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl shadow-lg p-8 mb-6 border-4 border-yellow-400">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-6xl font-bold text-yellow-600 mb-2">🏆 #{rank}</div>
            <div className="text-3xl font-bold text-gray-900 mb-4">{markee.message}</div>
            <div className="flex items-center gap-6 text-gray-600">
              <span className="text-xl font-semibold">{formatAddress(markee.owner)}</span>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${chainColor}`} />
                <span className="text-sm">{chainName}</span>
              </div>
              <span className="text-2xl font-bold text-blue-600">{formatEth(markee.totalFundsAdded)} ETH</span>
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <button className="text-2xl hover:scale-110 transition">👍</button>
            <button className="text-2xl hover:scale-110 transition">❤️</button>
            <button className="text-2xl hover:scale-110 transition">🔥</button>
          </div>
        </div>
      </div>
    )
  }

  // Large view (ranks 2-3)
  if (size === 'large') {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border-2 border-gray-200 h-full">
        <div className="flex items-start justify-between mb-3">
          <div className="text-3xl font-bold text-gray-400">#{rank}</div>
          <div className="flex gap-2">
            <button className="text-lg hover:scale-110 transition">👍</button>
            <button className="text-lg hover:scale-110 transition">❤️</button>
            <button className="text-lg hover:scale-110 transition">🔥</button>
          </div>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-3 line-clamp-3">{markee.message}</div>
        <div className="flex items-center justify-between text-gray-600">
          <div className="flex flex-col gap-2">
            <span className="font-medium">{formatAddress(markee.owner)}</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${chainColor}`} />
              <span className="text-xs">{chainName}</span>
            </div>
          </div>
          <span className="text-lg font-bold text-blue-600">{formatEth(markee.totalFundsAdded)} ETH</span>
        </div>
      </div>
    )
  }

  // Medium view (ranks 4-26)
  if (size === 'medium') {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 h-full">
        <div className="flex items-start justify-between mb-2">
          <div className="text-lg font-bold text-gray-400">#{rank}</div>
          <div className="flex gap-1 text-sm">
            <button className="hover:scale-110 transition">👍</button>
            <button className="hover:scale-110 transition">❤️</button>
          </div>
        </div>
        <div className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">{markee.message}</div>
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex flex-col gap-1">
            <span>{formatAddress(markee.owner)}</span>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${chainColor}`} />
              <span>{chainName}</span>
            </div>
          </div>
          <span className="font-bold text-blue-600">{formatEth(markee.totalFundsAdded, 2)} ETH</span>
        </div>
      </div>
    )
  }

  // Small view - shouldn't reach here but just in case
  return null
}
