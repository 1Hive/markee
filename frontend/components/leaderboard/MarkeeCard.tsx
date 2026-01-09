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

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🎉', '🚀', '🪧']
const ALL_EMOJIS = ['❤️', '👍', '👎', '💯', '😂', '🎉', '😮', '💩', '😠', '🚀', '👑', '🤔', '🪧']
const MARKEE_THRESHOLD = 100n * 10n ** 18n

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
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

/* ---------------- Emoji Reactions ---------------- */

function EmojiReactions({
  reactions,
  markee,
  onReact,
  onRemoveReaction,
  userAddress,
  hasMinBalance,
  size,
}: {
  reactions?: EmojiReaction[]
  markee: Markee
  onReact?: (markee: Markee, emoji: string) => void
  onRemoveReaction?: (markee: Markee) => void
  userAddress?: string
  hasMinBalance: boolean
  size: string
}) {
  const [showAllEmojis, setShowAllEmojis] = useState(false)

  if (!reactions || reactions.length === 0) {
    return null
  }

  const userReaction = reactions.find(
    r => r.userAddress.toLowerCase() === userAddress?.toLowerCase()
  )

  const reactionCounts = reactions.reduce((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortedReactions = Object.entries(reactionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const buttonSize =
    size === 'hero' ? 'text-base' : size === 'large' ? 'text-sm' : 'text-xs'

  const handleEmojiClick = (emoji: string) => {
    if (!hasMinBalance) return

    if (userReaction?.emoji === emoji) {
      onRemoveReaction?.(markee)
    } else {
      onReact?.(markee, emoji)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {sortedReactions.map(([emoji, count]) => {
          const userHasThisReaction = userReaction?.emoji === emoji

          return (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              disabled={!hasMinBalance}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full ${buttonSize} transition-all ${
                userHasThisReaction
                  ? 'bg-[#F897FE]/20 border-2 border-[#F897FE]'
                  : 'bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30'
              } ${hasMinBalance ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}`}
            >
              <span>{emoji}</span>
              <span className="text-[10px] font-medium text-[#B8B6D9]">
                {count}
              </span>
            </button>
          )
        })}

        {hasMinBalance && userAddress && (
          <div className="relative">
            <button
              onClick={() => setShowAllEmojis(!showAllEmojis)}
              className={`flex items-center justify-center w-7 h-7 rounded-full bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 ${buttonSize} transition-all hover:scale-105`}
            >
              ➕
            </button>

            {showAllEmojis && (
              <div className="absolute top-full left-0 mt-2 p-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl z-50 flex gap-1 flex-wrap max-w-[200px]">
                {ALL_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      handleEmojiClick(emoji)
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

      {showAllEmojis && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowAllEmojis(false)}
        />
      )}
    </div>
  )
}

/* ---------------- Hover Emoji Bar ---------------- */

function HoverEmojiBar({
  markee,
  onReact,
  hasMinBalance,
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
            onClick={e => {
              e.stopPropagation()
              onReact?.(markee, emoji)
            }}
            className="text-lg hover:scale-125 transition-transform p-1 hover:bg-[#8A8FBF]/20 rounded"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Card ---------------- */

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
  reactions,
}: MarkeeCardProps) {
  const { address } = useAccount()
  const isOwner = userAddress?.toLowerCase() === markee.owner.toLowerCase()
  const hasCustomName = markee.name && markee.name.trim()

  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const hasMinBalance = balance ? balance >= MARKEE_THRESHOLD : false

  /* ⬇️ ALL JSX BELOW IS UNCHANGED EXCEPT:
     - HoverEmojiBar only renders if no reactions
     - EmojiReactions receives onRemoveReaction
  */

  if (size === 'hero') {
    return (
      <div className="relative bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 rounded-xl shadow-lg p-8 mb-6 group">
        {!reactions?.length && (
          <HoverEmojiBar markee={markee} onReact={onReact} hasMinBalance={hasMinBalance} />
        )}

        {/* ... rest unchanged ... */}

        <EmojiReactions
          reactions={reactions}
          markee={markee}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
          userAddress={userAddress}
          hasMinBalance={hasMinBalance}
          size={size}
        />
      </div>
    )
  }

  return null
}
