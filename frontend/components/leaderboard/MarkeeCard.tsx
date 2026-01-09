'use client'

import { formatEth, formatAddress } from '@/lib/utils'
import { Eye } from 'lucide-react'
import type { Markee, EmojiReaction } from '@/types'
import { useMemo, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { MARKEE_TOKEN } from '@/lib/contracts/addresses'

interface MarkeeCardProps {
  markee: Markee
  rank: number
  size: 'hero' | 'large' | 'medium' | 'small' | 'list'
  userAddress?: string
  onEditMessage?: (markee: Markee) => void
  onAddFunds?: (markee: Markee) => void
  onReact?: (markee: Markee, emoji: string) => void // should call toggleReaction in parent
  onRemoveReaction?: (markee: Markee) => void       // should call removeReaction in parent
  messageViews?: number
  totalViews?: number
  reactions?: EmojiReaction[]
}

const ALL_EMOJIS = ['❤️', '👍', '👎', '💯', '😂', '🎉', '😮', '💩', '😠', '🚀', '👑', '🤔', '🪧']
const MARKEE_THRESHOLD = 100n * 10n ** 18n // 100 MARKEE tokens

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

// Stats component - ETH, views, rank, and medal
function MarkeeStats({
  totalViews,
  ethAmount,
  rank,
  size,
}: {
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
        {medal ? (
          <div className="flex items-center gap-1">
            <span className={size === 'hero' ? 'text-2xl' : size === 'large' ? 'text-xl' : 'text-base'}>
              {medal}
            </span>
          </div>
        ) : rank <= 26 ? (
          <span className="font-bold text-[#8A8FBF]">#{rank}</span>
        ) : null}

        <span className="font-bold text-[#7C9CFF]">{formatEth(ethAmount)} ETH</span>
      </div>

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

function ReactionArea({
  markee,
  reactions,
  onReact,
  onRemoveReaction,
  hasMinBalance,
  userAddress,
}: {
  markee: Markee
  reactions: EmojiReaction[]
  onReact?: (markee: Markee, emoji: string) => void
  onRemoveReaction?: (markee: Markee) => void
  hasMinBalance: boolean
  userAddress?: string
}) {
  const [openPicker, setOpenPicker] = useState(false)

  const { counts, sorted, hasAnyReactions, myEmoji } = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of reactions) c[r.emoji] = (c[r.emoji] || 0) + 1

    const s = Object.entries(c)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    const me = userAddress
      ? reactions.find(r => r.userAddress.toLowerCase() === userAddress.toLowerCase())?.emoji
      : undefined

    return {
      counts: c,
      sorted: s,
      hasAnyReactions: reactions.length > 0,
      myEmoji: me,
    }
  }, [reactions, userAddress])

  const canReact = hasMinBalance && !!userAddress

  const handlePick = (emoji: string) => {
    if (!canReact) return
    onReact?.(markee, emoji) // parent should toggle (same emoji removes, different overwrites)
    setOpenPicker(false)
  }

  const handleRemove = () => {
    if (!canReact) return
    onRemoveReaction?.(markee)
    setOpenPicker(false)
  }

  // When there are no reactions yet:
  // - show nothing by default
  // - on hover show only a heart at bottom right
  if (!hasAnyReactions) {
    return (
      <div className="relative">
        {canReact && (
          <>
            <button
              onClick={() => setOpenPicker(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-8 h-8 rounded-full bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30"
              title="React"
            >
              ❤️
            </button>

            {openPicker && (
              <>
                <div className="absolute bottom-full right-0 mb-2 p-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl z-50 flex gap-1 flex-wrap max-w-[220px]">
                  {ALL_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => handlePick(emoji)}
                      className="text-xl hover:scale-125 transition-transform p-1 hover:bg-[#8A8FBF]/20 rounded"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setOpenPicker(false)} />
              </>
            )}
          </>
        )}
      </div>
    )
  }

  // When reactions exist, show pills + a heart button to change reaction (opens picker)
  return (
    <div className="relative flex items-center gap-2">
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {sorted.map(([emoji]) => {
          const count = counts[emoji] || 0
          const isMine = myEmoji === emoji

          return (
            <button
              key={emoji}
              onClick={() => {
                if (!canReact) return
                // Clicking the emoji pill:
                // - if it's your current emoji: remove (toggle)
                // - else: set to that emoji (toggle handler in parent will overwrite)
                if (isMine) {
                  onReact?.(markee, emoji) // parent toggle removes if same
                } else {
                  onReact?.(markee, emoji)
                }
              }}
              disabled={!canReact}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-xs transition-all ${
                isMine
                  ? 'bg-[#F897FE]/20 border-2 border-[#F897FE]'
                  : 'bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30'
              } ${canReact ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-50'}`}
              title={canReact ? `${count} reaction${count > 1 ? 's' : ''}` : 'Need 100 MARKEE to react'}
            >
              <span>{emoji}</span>
              <span className="text-[10px] font-medium text-[#B8B6D9]">{count}</span>
            </button>
          )
        })}
      </div>

      {canReact && (
        <>
          <button
            onClick={() => setOpenPicker(true)}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 transition-all hover:scale-105"
            title={myEmoji ? 'Change reaction' : 'React'}
          >
            ❤️
          </button>

          {openPicker && (
            <>
              <div className="absolute bottom-full right-0 mb-2 p-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl z-50 flex gap-1 flex-wrap max-w-[220px]">
                {myEmoji && (
                  <button
                    onClick={handleRemove}
                    className="w-full text-left px-2 py-1 mb-1 rounded bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 text-[#B8B6D9] text-xs"
                  >
                    Remove reaction
                  </button>
                )}

                {ALL_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handlePick(emoji)}
                    className={`text-xl hover:scale-125 transition-transform p-1 hover:bg-[#8A8FBF]/20 rounded ${
                      myEmoji === emoji ? 'ring-2 ring-[#F897FE]' : ''
                    }`}
                    title={myEmoji === emoji ? 'Click to remove (toggle)' : `React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="fixed inset-0 z-40" onClick={() => setOpenPicker(false)} />
            </>
          )}
        </>
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
  reactions = [],
}: MarkeeCardProps) {
  const { address } = useAccount()
  const viewerAddress = address || userAddress
  const isOwner = !!address && address.toLowerCase() === markee.owner.toLowerCase()
  const hasCustomName = markee.name && markee.name.trim()

  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const hasMinBalance = balance ? balance >= MARKEE_THRESHOLD : false

  // List view (unchanged)
  if (size === 'list') {
    return (
      <div className="flex items-center justify-between py-2 border-b border-[#8A8FBF]/20 last:border-0 hover:bg-[#0A0F3D]">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <p className="font-jetbrains text-sm text-[#B8B6D9] truncate flex-1">{markee.message}</p>
          <span className="text-xs text-[#8A8FBF] italic">
            —{' '}
            <span className={hasCustomName ? 'text-[#B8B6D9]' : 'text-[#8A8FBF]'}>
              {hasCustomName ? markee.name : formatAddress(markee.owner)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <MarkeeStats totalViews={totalViews} ethAmount={markee.totalFundsAdded} rank={rank} size={size} />
        </div>
      </div>
    )
  }

  // HERO
  if (size === 'hero') {
    return (
      <div className="relative bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 rounded-xl shadow-lg p-8 mb-6 group">
        <div className="border-4 border-[#F897FE] rounded-lg p-6 mb-4">
          <div className="font-jetbrains text-3xl font-bold text-[#EDEEFF] mb-4 message-text select-none">
            {markee.message}
          </div>

          <div className="flex justify-end">
            <p className="text-base text-[#8A8FBF] italic">
              —{' '}
              <span className={hasCustomName ? 'text-[#B8B6D9] font-medium' : 'text-[#8A8FBF]'}>
                {hasCustomName ? markee.name : formatAddress(markee.owner)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[#8A8FBF]/30">
          <div className="flex items-center gap-3">
            <MarkeeStats totalViews={totalViews} ethAmount={markee.totalFundsAdded} rank={rank} size={size} />

            <button
              onClick={() => onAddFunds?.(markee)}
              className="text-xs px-3 py-1.5 bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
            >
              Add Funds
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={() => onEditMessage?.(markee)}
                className="text-xs px-3 py-1.5 bg-[#0A0F3D] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Edit Message
              </button>
            )}

            <ReactionArea
              markee={markee}
              reactions={reactions}
              onReact={onReact}
              onRemoveReaction={onRemoveReaction}
              hasMinBalance={hasMinBalance}
              userAddress={viewerAddress}
            />
          </div>
        </div>
      </div>
    )
  }

  // LARGE
  if (size === 'large') {
    return (
      <div className="relative bg-[#0A0F3D] rounded-lg shadow-md p-6 h-full flex flex-col group">
        <div className="border-2 border-[#8A8FBF]/30 rounded-lg p-4 mb-3 flex-grow">
          <div className="font-jetbrains text-xl font-bold text-[#EDEEFF] mb-3 line-clamp-3 message-text select-none">
            {markee.message}
          </div>

          <div className="flex justify-end">
            <p className="text-sm text-[#8A8FBF] italic">
              —{' '}
              <span className={hasCustomName ? 'text-[#B8B6D9]' : 'text-[#8A8FBF]'}>
                {hasCustomName ? markee.name : formatAddress(markee.owner)}
              </span>
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-[#8A8FBF]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MarkeeStats totalViews={totalViews} ethAmount={markee.totalFundsAdded} rank={rank} size={size} />

              <button
                onClick={() => onAddFunds?.(markee)}
                className="text-xs px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
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

              <ReactionArea
                markee={markee}
                reactions={reactions}
                onReact={onReact}
                onRemoveReaction={onRemoveReaction}
                hasMinBalance={hasMinBalance}
                userAddress={viewerAddress}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // MEDIUM
  if (size === 'medium') {
    return (
      <div className="relative bg-[#0A0F3D] rounded-lg shadow-sm p-4 h-full flex flex-col group">
        <div className="border border-[#8A8FBF]/30 rounded-lg p-3 mb-2 flex-grow">
          <div className="font-jetbrains text-sm font-semibold text-[#EDEEFF] mb-2 line-clamp-2 message-text select-none">
            {markee.message}
          </div>

          <div className="flex justify-end">
            <p className="text-xs text-[#8A8FBF] italic">
              —{' '}
              <span className={hasCustomName ? 'text-[#B8B6D9]' : 'text-[#8A8FBF]'}>
                {hasCustomName ? markee.name : formatAddress(markee.owner)}
              </span>
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-[#8A8FBF]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MarkeeStats totalViews={totalViews} ethAmount={markee.totalFundsAdded} rank={rank} size={size} />

              <button
                onClick={() => onAddFunds?.(markee)}
                className="text-[10px] px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
              >
                Add Funds
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isOwner && (
                <button
                  onClick={() => onEditMessage?.(markee)}
                  className="text-[10px] px-2 py-1 bg-[#060A2A] hover:bg-[#8A8FBF]/20 border border-[#8A8FBF]/30 rounded transition text-[#B8B6D9]"
                >
                  Edit Message
                </button>
              )}

              <ReactionArea
                markee={markee}
                reactions={reactions}
                onReact={onReact}
                onRemoveReaction={onRemoveReaction}
                hasMinBalance={hasMinBalance}
                userAddress={viewerAddress}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
