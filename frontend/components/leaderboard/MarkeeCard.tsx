'use client'

import { formatEth, formatAddress } from '@/lib/utils'
import { Eye } from 'lucide-react'
import Image from 'next/image'
import type { Markee, EmojiReaction } from '@/types'
import { useState, useRef, useEffect } from 'react'
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

const AVAILABLE_EMOJIS = ['❤️', '👍', '👎', '💯', '😂', '🎉', '😮', '💩', '😠', '🚀', '👑', '🤔', '🪧']
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

// Emoji Reactions Component - Messaging App Style
function EmojiReactions({ 
  reactions, 
  markee, 
  onReact, 
  userAddress, 
  hasMinBalance,
  messageRef
}: { 
  reactions?: EmojiReaction[]
  markee: Markee
  onReact?: (markee: Markee, emoji: string) => void
  userAddress?: string
  hasMinBalance: boolean
  messageRef: React.RefObject<HTMLDivElement>
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 })
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false)
      }
    }

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPicker])

  // Handle right-click / context menu on message
  useEffect(() => {
    const messageElement = messageRef.current
    if (!messageElement || !hasMinBalance || !userAddress) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setPickerPosition({ x: e.clientX, y: e.clientY })
      setShowPicker(true)
    }

    // Touch and hold for mobile
    let touchTimer: NodeJS.Timeout
    const handleTouchStart = (e: TouchEvent) => {
      touchTimer = setTimeout(() => {
        const touch = e.touches[0]
        setPickerPosition({ x: touch.clientX, y: touch.clientY })
        setShowPicker(true)
      }, 500) // 500ms hold
    }

    const handleTouchEnd = () => {
      clearTimeout(touchTimer)
    }

    messageElement.addEventListener('contextmenu', handleContextMenu)
    messageElement.addEventListener('touchstart', handleTouchStart)
    messageElement.addEventListener('touchend', handleTouchEnd)

    return () => {
      messageElement.removeEventListener('contextmenu', handleContextMenu)
      messageElement.removeEventListener('touchstart', handleTouchStart)
      messageElement.removeEventListener('touchend', handleTouchEnd)
      clearTimeout(touchTimer)
    }
  }, [messageRef, hasMinBalance, userAddress])

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

  return (
    <>
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
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all ${
                userHasThisReaction 
                  ? 'bg-markee-100 border border-markee-400' 
                  : 'bg-gray-100 hover:bg-gray-200 border border-transparent'
              } ${hasMinBalance ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              title={hasMinBalance ? 'Click to react' : 'Need 100 MARKEE to react'}
            >
              <span>{emoji}</span>
              <span className="text-[10px] font-medium text-gray-700">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Emoji Picker - Appears on right-click/long-press */}
      {showPicker && (
        <div
          ref={pickerRef}
          className="fixed z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-lg flex gap-1"
          style={{
            left: `${pickerPosition.x}px`,
            top: `${pickerPosition.y}px`,
            transform: 'translate(-50%, -100%) translateY(-8px)'
          }}
        >
          {AVAILABLE_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                onReact?.(markee, emoji)
                setShowPicker(false)
              }}
              className="text-xl hover:scale-125 transition-transform p-1 hover:bg-gray-100 rounded"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
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
  const messageRef = useRef<HTMLDivElement>(null)
  
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
          <p 
            ref={messageRef}
            className="font-mono text-sm text-gray-900 truncate flex-1 cursor-context-menu"
            title={hasMinBalance && address ? 'Right-click to react' : ''}
          >
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
      <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl shadow-lg p-8 mb-6 border-4 border-yellow-400">
        {/* Message is the star */}
        <div 
          ref={messageRef}
          className="font-mono text-3xl font-bold text-gray-900 mb-6 message-text cursor-context-menu select-none"
          title={hasMinBalance && address ? 'Right-click to react' : ''}
        >
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
            messageRef={messageRef}
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
      <div className="bg-white rounded-lg shadow-md p-6 border-2 border-gray-200 h-full flex flex-col">
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
        <div 
          ref={messageRef}
          className="font-mono text-xl font-bold text-gray-900 mb-3 line-clamp-3 message-text flex-grow cursor-context-menu select-none"
          title={hasMinBalance && address ? 'Right-click to react' : ''}
        >
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
            messageRef={messageRef}
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
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 h-full flex flex-col">
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
        <div 
          ref={messageRef}
          className="font-mono text-sm font-semibold text-gray-900 mb-2 line-clamp-2 message-text flex-grow cursor-context-menu select-none"
          title={hasMinBalance && address ? 'Right-click to react' : ''}
        >
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
            messageRef={messageRef}
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
