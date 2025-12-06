'use client'

import { formatEth, formatAddress } from '@/lib/utils'
import { Eye } from 'lucide-react'
import type { Markee } from '@/types'

interface MarkeeCardProps {
  markee: Markee
  rank: number
  size: 'hero' | 'large' | 'medium' | 'small' | 'list'
  userAddress?: string
  onEditMessage?: (markee: Markee) => void
  onAddFunds?: (markee: Markee) => void
  messageViews?: number // Views on current message
  totalViews?: number // All-time views on this Markee
}

function getChainColor(chainId: number): string {
  switch (chainId) {
    case 10: return 'bg-red-500' // Optimism
    case 8453: return 'bg-markee' // Base
    case 42161: return 'bg-markee-400' // Arbitrum
    case 1: return 'bg-purple-500' // Mainnet
    default: return 'bg-gray-400'
  }
}

function getChainName(chainId: number): string {
  switch (chainId) {
    case 10: return 'Optimism'
    case 8453: return 'Base'
    case 42161: return 'Arbitrum'
    case 1: return 'Mainnet'
    default: return 'Unknown'
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

// Get medal emoji based on rank
function getMedalEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

// Subtle stats component - now only shows views
function MarkeeStats({ 
  messageViews, 
  totalViews, 
  size 
}: { 
  messageViews?: number
  totalViews?: number
  size: string
}) {
  const textSize = size === 'hero' ? 'text-sm' : size === 'large' ? 'text-xs' : 'text-[10px]'
  
  return (
    <div className={`flex items-center gap-3 ${textSize} text-gray-500`}>
      {/* Total Views */}
      {totalViews !== undefined && (
        <div className="flex items-center gap-1 group relative">
          <Eye size={size === 'hero' ? 14 : 12} className="opacity-60" />
          <span>{formatNumber(totalViews)}</span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            {totalViews.toLocaleString()} all-time views
          </div>
        </div>
      )}
      
      {/* Message Views (optional, only if different from total views) */}
      {messageViews !== undefined && messageViews !== totalViews && (
        <div className="flex items-center gap-1 opacity-50 group relative">
          <Eye size={size === 'hero' ? 14 : 12} />
          <span>{formatNumber(messageViews)}</span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            {messageViews.toLocaleString()} views on this message
          </div>
        </div>
      )}
    </div>
  )
}

export function MarkeeCard({ markee, rank, size, userAddress, onEditMessage, onAddFunds, messageViews, totalViews }: MarkeeCardProps) {
  const chainColor = getChainColor(markee.chainId)
  const chainName = getChainName(markee.chainId)
  const isOwner = userAddress?.toLowerCase() === markee.owner.toLowerCase()
  const hasCustomName = markee.name && markee.name.trim()
  const medal = getMedalEmoji(rank)

  // List view (compact, single line)
  if (size === 'list') {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <span className="text-sm font-bold text-markee">{formatEth(markee.totalFundsAdded)} ETH</span>
          <p className="font-mono text-sm text-gray-900 truncate flex-1">{markee.message}</p>
          <span className="text-xs text-gray-500">
            Owner: <span className={hasCustomName ? 'text-gray-900' : 'text-gray-400'}>{hasCustomName ? markee.name : formatAddress(markee.owner)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            size={size}
          />
          <div className={`w-2 h-2 rounded-full ${chainColor}`} title={chainName} />
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
            <div className="flex items-center gap-3 mb-2">
              <div className="text-6xl">{medal}</div>
              <div className="text-4xl font-bold text-markee">{formatEth(markee.totalFundsAdded)} ETH</div>
            </div>
            <div className="font-mono text-3xl font-bold text-gray-900 mb-4 message-text">{markee.message}</div>
            <div className="flex items-center gap-6 text-gray-600 mb-3">
              <span className="text-xl">
                <span className="font-medium">Owner:</span>{' '}
                <span className={hasCustomName ? 'font-semibold' : 'text-gray-400'}>{hasCustomName ? markee.name : formatAddress(markee.owner)}</span>
              </span>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${chainColor}`} />
                <span className="text-sm">{chainName}</span>
              </div>
            </div>
            {/* Stats row */}
            <MarkeeStats 
              messageViews={messageViews}
              totalViews={totalViews}
              size={size}
            />
          </div>
          <div className="flex gap-2 ml-4">
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="text-sm px-3 py-1 bg-white rounded hover:bg-gray-50 transition"
              >
                ✏️ Edit
              </button>
            )}
            <button 
              onClick={() => onAddFunds?.(markee)}
              className="text-sm px-3 py-1 bg-white rounded hover:bg-gray-50 transition group relative"
            >
              ➕
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Add Funds
              </div>
            </button>
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
          <div className="flex items-center gap-2">
            {medal && <div className="text-3xl">{medal}</div>}
            <div className="text-2xl font-bold text-markee">{formatEth(markee.totalFundsAdded)} ETH</div>
          </div>
          <div className="flex gap-2">
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition"
              >
                ✏️
              </button>
            )}
            <button 
              onClick={() => onAddFunds?.(markee)}
              className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition group relative"
            >
              ➕
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Add Funds
              </div>
            </button>
          </div>
        </div>
        <div className="font-mono text-xl font-bold text-gray-900 mb-3 line-clamp-3 message-text">{markee.message}</div>
        <div className="flex items-center justify-between text-gray-600 mb-3">
          <div className="flex flex-col gap-2">
            <span className="text-sm">
              <span className="font-medium">Owner:</span>{' '}
              <span className={hasCustomName ? 'font-semibold' : 'text-gray-400'}>{hasCustomName ? markee.name : formatAddress(markee.owner)}</span>
            </span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${chainColor}`} />
              <span className="text-xs">{chainName}</span>
            </div>
          </div>
        </div>
        {/* Stats at bottom */}
        <div className="pt-3 border-t border-gray-100">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            size={size}
          />
        </div>
      </div>
    )
  }

  // Medium view (ranks 4-26)
  if (size === 'medium') {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 h-full">
        <div className="flex items-start justify-between mb-2">
          <div className="text-lg font-bold text-markee">{formatEth(markee.totalFundsAdded)} ETH</div>
          <div className="flex gap-1 text-sm">
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="hover:scale-110 transition"
              >
                ✏️
              </button>
            )}
            <button 
              onClick={() => onAddFunds?.(markee)}
              className="hover:scale-110 transition group relative"
            >
              ➕
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Add Funds
              </div>
            </button>
          </div>
        </div>
        <div className="font-mono text-sm font-semibold text-gray-900 mb-2 line-clamp-2 message-text">{markee.message}</div>
        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
          <div className="flex flex-col gap-1">
            <span>
              <span className="font-medium">Owner:</span>{' '}
              <span className={hasCustomName ? '' : 'text-gray-400'}>{hasCustomName ? markee.name : formatAddress(markee.owner)}</span>
            </span>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${chainColor}`} />
              <span>{chainName}</span>
            </div>
          </div>
        </div>
        {/* Stats at bottom */}
        <div className="pt-2 border-t border-gray-100">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            size={size}
          />
        </div>
      </div>
    )
  }

  // Small view - shouldn't reach here but just in case
  return null
}
