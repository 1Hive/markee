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

/* ---------------- Emoji Overlay ---------------- */

function EmojiOverlay({
  reactions,
  markee,
  userAddress,
  onReact,
  onRemoveReaction,
  hasMinBalance,
}: {
  reactions?: EmojiReaction[]
  markee: Markee
  userAddress?: string
  onReact?: (markee: Markee, emoji: string) => void
  onRemoveReaction?: (markee: Markee) => void
  hasMinBalance: boolean
}) {
  const [open, setOpen] = useState(false)

  const hasReactions = reactions && reactions.length > 0

  const userReaction = reactions?.find(
    r => r.userAddress.toLowerCase() === userAddress?.toLowerCase()
  )

  const grouped = reactions?.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1
    return acc
  }, {}) ?? {}

  const handlePick = (emoji: string) => {
    if (userReaction?.emoji === emoji) {
      onRemoveReaction?.(markee)
    } else {
      onReact?.(markee, emoji)
    }
    setOpen(false)
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute bottom-4 right-4 pointer-events-auto flex flex-col items-end gap-2">
        {!hasReactions && hasMinBalance && (
          <button
            onClick={() => setOpen(true)}
            className="text-3xl opacity-70 hover:opacity-100"
          >
            ❤️
          </button>
        )}

        {hasReactions && (
          <div className="flex gap-3">
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
          </div>
        )}

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
    </div>
  )
}

/* ---------------- Card ---------------- */

export function MarkeeCard(props: MarkeeCardProps) {
  const {
    markee,
    userAddress,
    onReact,
    onRemoveReaction,
    reactions,
    children,
  } = props

  const { address } = useAccount()

  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const hasMinBalance = balance ? balance >= MARKEE_THRESHOLD : false

  return (
    <div className="relative">
      {/* existing card layout is untouched */}
      {children}

      <EmojiOverlay
        reactions={reactions}
        markee={markee}
        userAddress={userAddress}
        onReact={onReact}
        onRemoveReaction={onRemoveReaction}
        hasMinBalance={hasMinBalance}
      />
    </div>
  )
}
