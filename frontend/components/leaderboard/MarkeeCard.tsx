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
                  ? 'bg-[#F897FE]/20 border-2 border-[#F897FE]' 
                  : 'bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30'
              } ${hasMinBalance ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}`}
              title={hasMinBalance ? `${count} reaction${count > 1 ? 's' : ''}` : 'Need 100 MARKEE to react'}
            >
              <span>{emoji}</span>
              <span className="text-[10px] font-medium text-[#B8B6D9]">{count}</span>
            </button>
          )
        })}

        {/* Add more button if user has balance */}
        {hasMinBalance && userAddress && (
          <div className="relative">
            <button
              onClick={() => setShowAllEmojis(!showAllEmojis)}
              className={`flex items-center justify-center w-7 h-7 rounded-full bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 ${buttonSize} transition-all hover:scale-105`}
              title="More reactions"
            >
              ➕
            </button>

            {/* All emojis picker */}
            {showAllEmojis && (
              <div className="absolute top-full left-0 mt-2 p-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl z-50 flex gap-1 flex-wrap max-w-[200px]">
                {ALL_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReact?.(markee, emoji)
                      setShowAllEmojis(false)
                    }}
                    className="text-xl hover:scale-125 transition-transform p-1 hover:bg-[#8A8FBF]/20 rounded"
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
      <div className="flex gap-1 p-1.5 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-lg">
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={(e) => {
              e.stopPropagation()
              onReact?.(markee, emoji)
            }}
            className="text-lg hover:scale-125 transition-transform p-1 hover:bg-[#8A8FBF]/20 rounded"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
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
    <div className={`flex items-center justify-between ${textSize} text-[#8A8FBF]`}>
      <div className="flex items-center gap-3">
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
      </div>

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
      enabled: !!address && MARKEE_TOKEN !== '0xf2A27822c8b7404c6aA7C3d7e2876DF597f02807'
    }
  })

  const hasMinBalance = MARKEE_TOKEN === '0xf2A27822c8b7404c6aA7C3d7e2876DF597f02807' 
    ? true 
    : balance ? balance >= MARKEE_THRESHOLD : false

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
    return (
      <div className="relative bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 rounded-xl shadow-lg p-8 mb-6 group">
        {/* Discord-style hover emoji bar */}
        <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />

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
              className="text-xs px-3 py-1.5 bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
            >
              Add Funds
            </button>
          </div>

          {isOwner && (
            <button 
              onClick={() => onEditMessage?.(markee)}
              className="text-xs px-3 py-1.5 bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
            >
              Edit Message
            </button>
          )}
        </div>
      </div>
    )
  }

  // Large view (ranks 2-3)
  if (size === 'large') {
    return (
      <div className="relative bg-[#0A0F3D] rounded-lg shadow-md p-6 h-full flex flex-col group">
        {/* Discord-style hover emoji bar */}
        <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />

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

        {/* Stats and Actions at bottom */}
        <div className="pt-3 border-t border-[#8A8FBF]/20">
          <div className="flex items-center justify-between mb-2">
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
                className="text-xs px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Add Funds
              </button>
            </div>
            
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="text-xs px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Edit Message
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Medium view (ranks 4-26)
  if (size === 'medium') {
    return (
      <div className="relative bg-[#0A0F3D] rounded-lg shadow-sm p-4 h-full flex flex-col group">
        {/* Discord-style hover emoji bar */}
        <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />

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

        {/* Stats and Actions at bottom */}
        <div className="pt-2 border-t border-[#8A8FBF]/20">
          <div className="flex items-center justify-between mb-1.5">
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
                className="text-[10px] px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Add Funds
              </button>
            </div>
            
            {isOwner && (
              <button 
                onClick={() => onEditMessage?.(markee)}
                className="text-[10px] px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Edit Message
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
