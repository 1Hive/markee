'use client'

import { formatEth, formatAddress } from '@/lib/utils'
import { Eye } from 'lucide-react'
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

const ALL_EMOJIS = ['❤️', '👍', '😂', '🎉', '😮', '💯', '👑', '🤔', '🚀', '🪧']
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
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

/* ---------------- Emoji Reactions ---------------- */

function EmojiReactions({
  reactions,
  markee,
  userAddress,
  onReact,
  onRemoveReaction,
}: {
  reactions?: EmojiReaction[]
  markee: Markee
  userAddress?: string
  onReact?: (markee: Markee, emoji: string) => void
  onRemoveReaction?: (markee: Markee) => void
}) {
  const [open, setOpen] = useState(false)

  if (!reactions || reactions.length === 0) return null

  const userReaction = reactions.find(
    r => r.userAddress.toLowerCase() === userAddress?.toLowerCase()
  )

  const grouped = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1
    return acc
  }, {})

  const handlePick = (emoji: string) => {
    if (userReaction?.emoji === emoji) {
      onRemoveReaction?.(markee)
    } else {
      onReact?.(markee, emoji)
    }
    setOpen(false)
  }

  return (
    <div className="absolute bottom-4 right-4 flex gap-3 items-center">
      {Object.entries(grouped).map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => setOpen(true)}
          className="text-3xl flex items-center gap-1 opacity-90 hover:opacity-100"
        >
          <span>{emoji}</span>
          <span className="text-sm text-[#8A8FBF]">{count}</span>
        </button>
      ))}

      {open && (
        <>
          <div className="absolute bottom-full right-0 mb-2 flex flex-wrap gap-2 bg-[#060A2A] p-2 rounded-lg z-50">
            {ALL_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => handlePick(e)}
                className="text-3xl hover:scale-125 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  )
}

/* ---------------- Hover Heart ---------------- */

function HoverHeart({
  markee,
  onReact,
}: {
  markee: Markee
  onReact?: (markee: Markee, emoji: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="absolute bottom-4 right-4">
      <button
        onClick={() => setOpen(true)}
        className="text-3xl opacity-70 hover:opacity-100 transition"
      >
        ❤️
      </button>

      {open && (
        <>
          <div className="absolute bottom-full right-0 mb-2 flex flex-wrap gap-2 bg-[#060A2A] p-2 rounded-lg z-50">
            {ALL_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => {
                  onReact?.(markee, e)
                  setOpen(false)
                }}
                className="text-3xl hover:scale-125 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        </>
      )}
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
  const hasReactions = reactions && reactions.length > 0

  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const hasMinBalance = balance ? balance >= MARKEE_THRESHOLD : false

  return (
    <div className="relative bg-[#0A0F3D] rounded-xl p-6 group">
      {hasMinBalance && !hasReactions && (
        <HoverHeart markee={markee} onReact={onReact} />
      )}

      {hasReactions && (
        <EmojiReactions
          reactions={reactions}
          markee={markee}
          userAddress={userAddress}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
        />
      )}

      <div className="font-jetbrains text-xl text-[#EDEEFF] mb-2">
        {markee.message}
      </div>

      <div className="flex justify-between items-center text-sm text-[#8A8FBF]">
        <span>
          — {markee.name || formatAddress(markee.owner)}
        </span>

        <span className="font-semibold text-[#7C9CFF]">
          {formatEth(markee.totalFundsAdded)} ETH
        </span>
      </div>

      {isOwner && (
        <div className="mt-4 flex gap-2">
          <button onClick={() => onAddFunds?.(markee)}>Add Funds</button>
          <button onClick={() => onEditMessage?.(markee)}>Edit Message</button>
        </div>
      )}
    </div>
  )
}
