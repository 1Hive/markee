'use client'

/**
 * FlagButton
 * 
 * Renders only for admin wallets. Toggles the flagged state of a markee.
 * Place this anywhere inside a card — it handles its own visibility.
 * 
 * Usage:
 *   <FlagButton chainId={8453} markeeId="42" />
 */

import { useState } from 'react'
import { useModeration } from '@/components/moderation/ModerationProvider'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

interface FlagButtonProps {
  chainId: number | string
  markeeId: string
  /** Compact mode for smaller cards */
  compact?: boolean
}

export function FlagButton({ chainId, markeeId, compact = false }: FlagButtonProps) {
  const { isAdmin, isFlagged, toggleFlag } = useModeration()
  const [isToggling, setIsToggling] = useState(false)

  if (!isAdmin) return null

  const flagged = isFlagged(chainId, markeeId)
  const iconSize = compact ? 14 : 16

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click-through
    if (isToggling) return

    setIsToggling(true)
    try {
      await toggleFlag(chainId, markeeId)
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isToggling}
      className={`
        flex items-center gap-1 rounded transition-all
        ${compact ? 'p-1' : 'px-2 py-1'}
        ${flagged
          ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30'
          : 'bg-[#0A0F3D]/50 border border-[#8A8FBF]/30 text-[#8A8FBF] hover:bg-[#8A8FBF]/20 hover:border-[#8A8FBF]/50'
        }
        ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
      `}
      title={flagged ? 'Unflag this message' : 'Flag this message'}
    >
      {flagged ? (
        <ShieldAlert size={iconSize} />
      ) : (
        <ShieldCheck size={iconSize} />
      )}
      {!compact && (
        <span className="text-[10px] font-medium">
          {flagged ? 'Unflag' : 'Flag'}
        </span>
      )}
    </button>
  )
}
