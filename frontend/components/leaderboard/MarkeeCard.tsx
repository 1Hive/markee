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
  onRemoveReaction?: (markee: Markee) => void
  messageViews?: number
  totalViews?: number
  reactions?: EmojiReaction[]
}

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

// Emoji Reactions Display - shows in bottom right
function EmojiDisplay({ 
  reactions, 
  markee, 
  onReact, 
  userAddress, 
  hasMinBalance,
  size,
  isCardHovering
}: { 
  reactions?: EmojiReaction[]
  markee: Markee
  onReact?: (markee: Markee, emoji: string) => void
  userAddress?: string
  hasMinBalance: boolean
  size: string
  isCardHovering: boolean
}) {
  const [showMenu, setShowMenu] = useState(false)

  const hasReactions = reactions && reactions.length > 0

  // Group reactions by emoji
  const reactionCounts = reactions?.reduce((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  // Sort by count
  const sortedReactions = Object.entries(reactionCounts)
    .sort(([, a], [, b]) => b - a)

  // Get user's current reaction
  const userReaction = reactions?.find(
    r => r.userAddress.toLowerCase() === userAddress?.toLowerCase()
  )

  const textSize = size === 'hero' ? 'text-base' : size === 'large' ? 'text-sm' : 'text-xs'

  // Users can see reactions even without balance, but can't interact
  if (!hasReactions && !hasMinBalance) return null

  return (
    <div className="relative flex items-center gap-1 min-w-[30px]">
      {hasReactions ? (
        // Show existing reactions
        <>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`flex items-center gap-1 ${textSize}`}
          >
            {sortedReactions.map(([emoji, count]) => (
              <span key={emoji} className="flex items-center gap-0.5 text-[#EDEEFF]">
                {emoji} <span className="text-[#8A8FBF]">{count}</span>
              </span>
            ))}
          </button>

          {/* Emoji menu */}
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute bottom-full right-0 mb-2 p-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl z-50">
                {!hasMinBalance ? (
                  <div className="px-3 py-2 text-xs text-[#8A8FBF] whitespace-nowrap">
                    100 MARKEE needed in your wallet to react
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1">
                    {ALL_EMOJIS.map(emoji => {
                      const isUserEmoji = userReaction?.emoji === emoji
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            onReact?.(markee, emoji)
                            setShowMenu(false)
                          }}
                          className={`text-xl p-1 rounded transition-all ${
                            isUserEmoji 
                              ? 'bg-[#F897FE]/30 scale-110' 
                              : 'hover:scale-125 hover:bg-[#8A8FBF]/20'
                          }`}
                          title={isUserEmoji ? 'Click to remove' : ''}
                        >
                          {emoji}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        // Show hover heart when no reactions (only if has balance)
        <>
          <button
            onClick={() => setShowMenu(true)}
            className={`${textSize} transition-all ${
              isCardHovering && userAddress 
                ? 'text-[#EDEEFF] opacity-100 scale-110' 
                : 'opacity-0'
            }`}
          >
            ❤️
          </button>

          {/* Emoji menu for hover heart */}
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute bottom-full right-0 mb-2 p-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl z-50">
                <div className="grid grid-cols-4 gap-1">
                  {ALL_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onReact?.(markee, emoji)
                        setShowMenu(false)
                      }}
                      className="text-xl p-1 rounded transition-all hover:scale-125 hover:bg-[#8A8FBF]/20"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Stats component - ETH, views, rank, and medal (no chain indicator)
function MarkeeStats({ 
  messageViews, 
  totalViews,
  ethAmount,
  rank,
  size
}: { 
  messageViews?: number
  totalViews?: number
  ethAmount: bigint
  rank: number
  size: string
}) {
  const textSize = size === 'hero' ? 'text-sm' : size === 'large' ? 'text-xs' : 'text-[10px]'
  const medal = getMedalEmoji(rank)

  return (
    <div className={`flex items-center gap-3 ${textSize} text-[#8A8FBF]`}>
      {/* Medal and Rank */}
      {medal ? (
        <div className="flex items-center gap-1">
          <span className={size === 'hero' ? 'text-2xl' : size === 'large' ? 'text-xl' : 'text-base'}>{medal}</span>
        </div>
      ) : rank <= 26 ? (
        <span className="font-bold text-[#8A8FBF]">#{rank}</span>
      ) : null}

      {/* ETH Amount */}
      <span className="font-bold text-[#7C9CFF]">{formatEth(ethAmount)} ETH</span>

      {/* Views */}
      {totalViews !== undefined && (
        <div className="flex items-center gap-1 group relative">
          <Eye size={size === 'hero' ? 14 : 12} className="opacity-60" />
          <span>{formatNumber(totalViews)}</span>
          <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-[#0A0F3D] text-[#B8B6D9] text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-[#8A8FBF]/30">
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
  onRemoveReaction,
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
      enabled: !!address
    }
  })

  const hasMinBalance = balance ? balance >= MARKEE_THRESHOLD : false

  // List view (compact, single line)
  if (size === 'list') {
    return (
      <div className="flex items-center justify-between py-2 border-b border-[#8A8FBF]/20 last:border-0 hover:bg-[#0A0F3D]">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <p className="font-jetbrains text-sm text-[#B8B6D9] truncate flex-1">
            {markee.message}
          </p>
          <span className="text-xs text-[#8A8FBF] italic">
            — <span className={hasCustomName ? 'text-[#B8B6D9]' : 'text-[#8A8FBF]'}>
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
          />
        </div>
      </div>
    )
  }

  // Hero view (rank #1)
  if (size === 'hero') {
    const [isCardHovering, setIsCardHovering] = useState(false)

    return (
      <div 
        className="relative bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 rounded-xl shadow-lg p-8 mb-6"
        onMouseEnter={() => setIsCardHovering(true)}
        onMouseLeave={() => setIsCardHovering(false)}
      >
        {/* Message and Author - Bordered Section */}
        <div className="border-4 border-[#F897FE] rounded-lg p-6 mb-4">
          {/* Message */}
          <div className="font-jetbrains text-3xl font-bold text-[#EDEEFF] mb-4 message-text select-none">
            {markee.message}
          </div>

          {/* Author at bottom right */}
          <div className="flex justify-end">
            <p className="text-base text-[#8A8FBF] italic">
              — <span className={hasCustomName ? 'text-[#B8B6D9] font-medium' : 'text-[#8A8FBF]'}>
                {hasCustomName ? markee.name : formatAddress(markee.owner)}
              </span>
            </p>
          </div>
        </div>

        {/* Stats and Actions at bottom */}
        <div className="flex items-center justify-between pt-4 border-t border-[#8A8FBF]/30">
          <div className="flex items-center gap-3">
            <MarkeeStats 
              messageViews={messageViews}
              totalViews={totalViews}
              ethAmount={markee.totalFundsAdded}
              rank={rank}
              size={size}
            />

            <button 
              onClick={() => onAddFunds?.(markee)}
              className="text-xs px-3 py-1.5 bg-[#F897FE] hover:bg-[#F897FE]/80 text-[#060A2A] font-semibold rounded transition"
            >
              Add Funds
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="text-xs px-3 py-1.5 bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Edit Message
              </button>
            )}

            <EmojiDisplay
              reactions={reactions}
              markee={markee}
              onReact={onReact}
              userAddress={userAddress}
              hasMinBalance={hasMinBalance}
              size={size}
              isCardHovering={isCardHovering}
            />
          </div>
        </div>
      </div>
    )
  }

  // Large view (ranks 2-3)
  if (size === 'large') {
    const [isCardHovering, setIsCardHovering] = useState(false)

    return (
      <div 
        className="relative bg-[#0A0F3D] rounded-lg shadow-md p-6 h-full flex flex-col"
        onMouseEnter={() => setIsCardHovering(true)}
        onMouseLeave={() => setIsCardHovering(false)}
      >
        {/* Message and Author - Bordered Section */}
        <div className="border-2 border-[#8A8FBF]/30 rounded-lg p-4 mb-3 flex-grow">
          {/* Message */}
          <div className="font-jetbrains text-xl font-bold text-[#EDEEFF] mb-3 line-clamp-3 message-text select-none">
            {markee.message}
          </div>

          {/* Author at bottom right */}
          <div className="flex justify-end">
            <p className="text-sm text-[#8A8FBF] italic">
              — <span className={hasCustomName ? 'text-[#B8B6D9]' : 'text-[#8A8FBF]'}>
                {hasCustomName ? markee.name : formatAddress(markee.owner)}
              </span>
            </p>
          </div>
        </div>

        {/* Stats and Actions at bottom */}
        <div className="pt-3 border-t border-[#8A8FBF]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MarkeeStats 
                messageViews={messageViews}
                totalViews={totalViews}
                ethAmount={markee.totalFundsAdded}
                rank={rank}
                size={size}
              />

              <button 
                onClick={() => onAddFunds?.(markee)}
                className="text-xs px-2 py-1 bg-[#F897FE] hover:bg-[#F897FE]/80 text-[#060A2A] font-semibold rounded transition"
              >
                Add Funds
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isOwner && (
                <button 
                  onClick={() => onEditMessage?.(markee)}
                  className="text-xs px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
                >
                  Edit Message
                </button>
              )}

              <EmojiDisplay
                reactions={reactions}
                markee={markee}
                onReact={onReact}
                userAddress={userAddress}
                hasMinBalance={hasMinBalance}
                size={size}
                isCardHovering={isCardHovering}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Medium view (ranks 4-26)
  if (size === 'medium') {
    const [isCardHovering, setIsCardHovering] = useState(false)

    return (
      <div 
        className="relative bg-[#0A0F3D] rounded-lg shadow-sm p-4 h-full flex flex-col"
        onMouseEnter={() => setIsCardHovering(true)}
        onMouseLeave={() => setIsCardHovering(false)}
      >
        {/* Message and Author - Bordered Section */}
        <div className="border border-[#8A8FBF]/30 rounded-lg p-3 mb-2 flex-grow">
          {/* Message */}
          <div className="font-jetbrains text-sm font-semibold text-[#EDEEFF] mb-2 line-clamp-2 message-text select-none">
            {markee.message}
          </div>

          {/* Author at bottom right */}
          <div className="flex justify-end">
            <p className="text-xs text-[#8A8FBF] italic">
              — <span className={hasCustomName ? 'text-[#B8B6D9]' : 'text-[#8A8FBF]'}>
                {hasCustomName ? markee.name : formatAddress(markee.owner)}
              </span>
            </p>
          </div>
        </div>

        {/* Stats and Actions at bottom */}
        <div className="pt-2 border-t border-[#8A8FBF]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MarkeeStats 
                messageViews={messageViews}
                totalViews={totalViews}
                ethAmount={markee.totalFundsAdded}
                rank={rank}
                size={size}
              />

              <button 
                onClick={() => onAddFunds?.(markee)}
                className="text-[10px] px-2 py-1 bg-[#F897FE] hover:bg-[#F897FE]/80 text-[#060A2A] font-semibold rounded transition"
              >
                Add Funds
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {isOwner && (
                <button 
                  onClick={() => onEditMessage?.(markee)}
                  className="text-[10px] px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
                >
                  Edit Message
                </button>
              )}

              <EmojiDisplay
                reactions={reactions}
                markee={markee}
                onReact={onReact}
                userAddress={userAddress}
                hasMinBalance={hasMinBalance}
                size={size}
                isCardHovering={isCardHovering}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
