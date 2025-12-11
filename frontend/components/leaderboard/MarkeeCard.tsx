'use client'

import { formatEth, formatAddress } from '@/lib/utils'
import { Eye } from 'lucide-react'
import Image from 'next/image'
import type { Markee, EmojiReaction } from '@/types'
import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { MARKEE_TOKEN } from '@/lib/contracts/addresses'

interface MarkeeCardProps {
  markee: Markee
  rank: number
  size: 'hero' | 'large' | 'medium' | 'small' | 'list'
  userAddress?: string
  onEditMessage?: (markee: Markee) => void
  onAddFunds?: (markee: Markee) => void
  onReact?: (markee: Markee, emoji: string) => void
  messageViews?: number
  totalViews?: number
  reactions?: EmojiReaction[]
}

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🎉', '🚀', '🪧'] // Top 6 for quick access
const ALL_EMOJIS = ['❤️', '👍', '👎', '💯', '😂', '🎉', '😮', '💩', '😠', '🚀', '👑', '🤔', '🪧']
const MARKEE_THRESHOLD = 100n * 10n**18n // 100 MARKEE tokens

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

function getChainColor(chainId: number): string {
  switch (chainId) {
    case 10: return 'bg-red-500'
    case 8453: return 'bg-markee'
    case 42161: return 'bg-markee-400'
    case 1: return 'bg-purple-500'
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

function getMedalEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

// Discord-Style Emoji Reactions Component
function EmojiReactions({ 
  reactions, 
  markee, 
  onReact, 
  userAddress, 
  hasMinBalance,
  size
}: { 
  reactions?: EmojiReaction[]
  markee: Markee
  onReact?: (markee: Markee, emoji: string) => void
  userAddress?: string
  hasMinBalance: boolean
  size: string
}) {
  const [showAllEmojis, setShowAllEmojis] = useState(false)

  if (!reactions || reactions.length === 0) {
    return null
  }

  // Group reactions by emoji
  const reactionCounts = reactions.reduce((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Sort by count
  const sortedReactions = Object.entries(reactionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5) // Show top 5

  const buttonSize = size === 'hero' ? 'text-base' : size === 'large' ? 'text-sm' : 'text-xs'

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {sortedReactions.map(([emoji, count]) => {
          const userHasThisReaction = reactions.some(
            r => r.emoji === emoji && r.userAddress.toLowerCase() === userAddress?.toLowerCase()
          )

          return (
            <button
              key={emoji}
              onClick={() => {
                if (hasMinBalance) {
                  onReact?.(markee, emoji)
                }
              }}
              disabled={!hasMinBalance}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full ${buttonSize} transition-all ${
                userHasThisReaction 
                  ? 'bg-markee-100 border-2 border-markee-400' 
                  : 'bg-gray-100 hover:bg-gray-200 border border-gray-300'
              } ${hasMinBalance ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}`}
              title={hasMinBalance ? `${count} reaction${count > 1 ? 's' : ''}` : 'Need 100 MARKEE to react'}
            >
              <span>{emoji}</span>
              <span className="text-[10px] font-medium text-gray-700">{count}</span>
            </button>
          )
        })}
        
        {/* Add more button if user has balance */}
        {hasMinBalance && userAddress && (
          <div className="relative">
            <button
              onClick={() => setShowAllEmojis(!showAllEmojis)}
              className={`flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-300 ${buttonSize} transition-all hover:scale-105`}
              title="More reactions"
            >
              ➕
            </button>
            
            {/* All emojis picker */}
            {showAllEmojis && (
              <div className="absolute top-full left-0 mt-2 p-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex gap-1 flex-wrap max-w-[200px]">
                {ALL_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReact?.(markee, emoji)
                      setShowAllEmojis(false)
                    }}
                    className="text-xl hover:scale-125 transition-transform p-1 hover:bg-gray-100 rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Clickable overlay closer */}
      {showAllEmojis && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowAllEmojis(false)}
        />
      )}
    </div>
  )
}

// Discord-Style Hover Emoji Bar
function HoverEmojiBar({
  markee,
  onReact,
  hasMinBalance
}: {
  markee: Markee
  onReact?: (markee: Markee, emoji: string) => void
  hasMinBalance: boolean
}) {
  if (!hasMinBalance) return null

  return (
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
      <div className="flex gap-1 p-1.5 bg-white border border-gray-200 rounded-lg shadow-lg">
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={(e) => {
              e.stopPropagation()
              onReact?.(markee, emoji)
            }}
            className="text-lg hover:scale-125 transition-transform p-1 hover:bg-gray-100 rounded"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// Stats component - now at bottom with ETH, views, rank, and medal
function MarkeeStats({ 
  messageViews, 
  totalViews,
  ethAmount,
  rank,
  size,
  chainId
}: { 
  messageViews?: number
  totalViews?: number
  ethAmount: bigint
  rank: number
  size: string
  chainId: number
}) {
  const textSize = size === 'hero' ? 'text-sm' : size === 'large' ? 'text-xs' : 'text-[10px]'
  const medal = getMedalEmoji(rank)
  const chainColor = getChainColor(chainId)
  const chainName = getChainName(chainId)
  
  return (
    <div className={`flex items-center justify-between ${textSize} text-gray-600`}>
      <div className="flex items-center gap-3">
        {/* Medal and Rank */}
        {medal ? (
          <div className="flex items-center gap-1">
            <span className={size === 'hero' ? 'text-2xl' : size === 'large' ? 'text-xl' : 'text-base'}>{medal}</span>
          </div>
        ) : rank <= 26 ? (
          <span className="font-bold text-gray-400">#{rank}</span>
        ) : null}
        
        {/* ETH Amount */}
        <span className="font-bold text-markee">{formatEth(ethAmount)} ETH</span>
        
        {/* Chain indicator */}
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${chainColor}`} />
          <span className="text-gray-500">{chainName}</span>
        </div>
      </div>
      
      {/* Views */}
      {totalViews !== undefined && (
        <div className="flex items-center gap-1 group relative">
          <Eye size={size === 'hero' ? 14 : 12} className="opacity-60" />
          <span>{formatNumber(totalViews)}</span>
          <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            {totalViews.toLocaleString()} all-time views
          </div>
        </div>
      )}
    </div>
  )
}

export function MarkeeCard({ 
  markee, 
  rank, 
  size, 
  userAddress, 
  onEditMessage, 
  onAddFunds, 
  onReact,
  messageViews, 
  totalViews,
  reactions
}: MarkeeCardProps) {
  const { address } = useAccount()
  const isOwner = userAddress?.toLowerCase() === markee.owner.toLowerCase()
  const hasCustomName = markee.name && markee.name.trim()
  
  // Check user's MARKEE balance
  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && MARKEE_TOKEN !== '0x0000000000000000000000000000000000000000'
    }
  })
  
  const hasMinBalance = MARKEE_TOKEN === '0x0000000000000000000000000000000000000000' 
    ? true 
    : balance ? balance >= MARKEE_THRESHOLD : false

  // List view (compact, single line)
  if (size === 'list') {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <p className="font-mono text-sm text-gray-900 truncate flex-1">
            {markee.message}
          </p>
          <span className="text-xs text-gray-500 italic">
            — <span className={hasCustomName ? 'text-gray-900' : 'text-gray-400'}>
              {hasCustomName ? markee.name : formatAddress(markee.owner)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            ethAmount={markee.totalFundsAdded}
            rank={rank}
            size={size}
            chainId={markee.chainId}
          />
        </div>
      </div>
    )
  }

  // Hero view (rank #1)
  if (size === 'hero') {
    return (
      <div className="relative bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl shadow-lg p-8 mb-6 border-4 border-yellow-400 group">
        {/* Discord-style hover emoji bar */}
        <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />
        
        {/* Message is the star */}
        <div className="font-mono text-3xl font-bold text-gray-900 mb-6 message-text select-none">
          {markee.message}
        </div>
        
        {/* Author */}
        <div className="mb-4">
          <p className="text-base text-gray-600 italic">
            — <span className={hasCustomName ? 'text-gray-900 font-medium' : 'text-gray-400'}>
              {hasCustomName ? markee.name : formatAddress(markee.owner)}
            </span>
          </p>
        </div>
        
        {/* Reactions */}
        <div className="mb-4">
          <EmojiReactions 
            reactions={reactions}
            markee={markee}
            onReact={onReact}
            userAddress={userAddress}
            hasMinBalance={hasMinBalance}
            size={size}
          />
        </div>
        
        {/* Stats and Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-yellow-200">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            ethAmount={markee.totalFundsAdded}
            rank={rank}
            size={size}
            chainId={markee.chainId}
          />
          
          <div className="flex gap-2">
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="text-sm px-3 py-1 hover:scale-110 transition group relative"
              >
                ✏️ Edit
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  Change Message
                </div>
              </button>
            )}
            <button 
              onClick={() => onAddFunds?.(markee)}
              className="text-sm px-3 py-1 hover:scale-110 transition group relative flex items-center gap-1"
            >
              <Image src="/green-plus.png" alt="Add Funds" width={16} height={16} />
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
      <div className="relative bg-white rounded-lg shadow-md p-6 border-2 border-gray-200 h-full flex flex-col group">
        {/* Discord-style hover emoji bar */}
        <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />
        
        {/* Action buttons at top right */}
        <div className="flex justify-end gap-2 mb-3">
          {isOwner && (
            <button 
              onClick={() => onEditMessage?.(markee)}
              className="text-xs px-2 py-1 hover:scale-110 transition group relative"
            >
              ✏️
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Change Message
              </div>
            </button>
          )}
          <button 
            onClick={() => onAddFunds?.(markee)}
            className="text-xs px-2 py-1 hover:scale-110 transition group relative flex items-center justify-center"
          >
            <Image src="/green-plus.png" alt="Add Funds" width={14} height={14} />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Add Funds
            </div>
          </button>
        </div>
        
        {/* Message */}
        <div className="font-mono text-xl font-bold text-gray-900 mb-3 line-clamp-3 message-text flex-grow select-none">
          {markee.message}
        </div>
        
        {/* Author */}
        <div className="mb-3">
          <p className="text-sm text-gray-600 italic">
            — <span className={hasCustomName ? 'text-gray-900' : 'text-gray-400'}>
              {hasCustomName ? markee.name : formatAddress(markee.owner)}
            </span>
          </p>
        </div>
        
        {/* Reactions */}
        <div className="mb-3">
          <EmojiReactions 
            reactions={reactions}
            markee={markee}
            onReact={onReact}
            userAddress={userAddress}
            hasMinBalance={hasMinBalance}
            size={size}
          />
        </div>
        
        {/* Stats at bottom */}
        <div className="pt-3 border-t border-gray-100">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            ethAmount={markee.totalFundsAdded}
            rank={rank}
            size={size}
            chainId={markee.chainId}
          />
        </div>
      </div>
    )
  }

  // Medium view (ranks 4-26)
  if (size === 'medium') {
    return (
      <div className="relative bg-white rounded-lg shadow-sm p-4 border border-gray-200 h-full flex flex-col group">
        {/* Discord-style hover emoji bar */}
        <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />
        
        {/* Action buttons at top right */}
        <div className="flex justify-end gap-1 text-sm mb-2">
          {isOwner && (
            <button 
              onClick={() => onEditMessage?.(markee)}
              className="hover:scale-110 transition group relative"
            >
              ✏️
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Change Message
              </div>
            </button>
          )}
          <button 
            onClick={() => onAddFunds?.(markee)}
            className="hover:scale-110 transition group relative"
          >
            <Image src="/green-plus.png" alt="Add Funds" width={16} height={16} />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Add Funds
            </div>
          </button>
        </div>
        
        {/* Message */}
        <div className="font-mono text-sm font-semibold text-gray-900 mb-2 line-clamp-2 message-text flex-grow select-none">
          {markee.message}
        </div>
        
        {/* Author */}
        <div className="mb-2">
          <p className="text-xs text-gray-600 italic">
            — <span className={hasCustomName ? 'text-gray-900' : 'text-gray-400'}>
              {hasCustomName ? markee.name : formatAddress(markee.owner)}
            </span>
          </p>
        </div>
        
        {/* Reactions */}
        <div className="mb-2">
          <EmojiReactions 
            reactions={reactions}
            markee={markee}
            onReact={onReact}
            userAddress={userAddress}
            hasMinBalance={hasMinBalance}
            size={size}
          />
        </div>
        
        {/* Stats at bottom */}
        <div className="pt-2 border-t border-gray-100">
          <MarkeeStats 
            messageViews={messageViews}
            totalViews={totalViews}
            ethAmount={markee.totalFundsAdded}
            rank={rank}
            size={size}
            chainId={markee.chainId}
          />
        </div>
      </div>
    )
  }

  return null
}
