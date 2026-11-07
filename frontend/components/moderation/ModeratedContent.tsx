'use client'

/**
 * ModeratedContent
 * 
 * Wraps any message content. If the markee is flagged, blurs the children
 * and shows an overlay. Users can optionally click through to reveal.
 * 
 * Usage:
 *   <ModeratedContent chainId={8453} markeeId="42">
 *     <p>{markee.message}</p>
 *   </ModeratedContent>
 * 
 */

import { usePublishedModeration } from '@/hooks/usePublishedModeration'
import { useState, type ReactNode } from 'react'
import { useModeration } from '@/components/moderation/ModerationProvider'
import { MODERATION_DEFAULTS } from '@/lib/moderation/config'

interface ModeratedContentProps {
  chainId: number | string
  message?: string
  markeeId: string
  children: ReactNode
  /** This markee's board admin -- lets that board's own admin see through the blur too, not just global admins */
  boardAdmin?: string | null
  /** This markee's board creator (from lib/leaderboards/resolveCreators.ts) -- same as boardAdmin */
  boardCreator?: string | null
  /** Override default blur amount */
  blurAmount?: string
  /** Override default overlay text */
  overlayText?: string
  /** Override whether users can reveal content */
  allowReveal?: boolean
  /** Additional class names for the wrapper */
  className?: string
}

export function ModeratedContent({
  chainId,
  markeeId,
  message,
  children,
  boardAdmin,
  boardCreator,
  blurAmount = MODERATION_DEFAULTS.blurAmount,
  overlayText = MODERATION_DEFAULTS.overlayText,
  allowReveal = MODERATION_DEFAULTS.allowReveal,
  className = '',
}: ModeratedContentProps) {
  const { isFlagged, canModerate } = useModeration()
  const [revealed, setRevealed] = useState<string | null>(null)

  const automatic = usePublishedModeration(chainId, markeeId, message)
  const manuallyFlagged = isFlagged(chainId, markeeId) || automatic.data?.siteState === 'manual-flagged'
  // An automatic flag is separate from the moderator's flag (the shield only toggles the latter), so it gets
  // its own label and reason; a moderator clears it with a false-positive approval in the queue.
  const autoFlagged = !manuallyFlagged && automatic.data?.siteState === 'soft-flagged'
  const flagged = manuallyFlagged || autoFlagged
  if (automatic.unavailable) return (
    <div role="status" aria-label="Loading message" className={className}>
      <span className="font-jetbrains text-[#8A8FBF]">
        This is a sign<span className="sign-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
      </span>
    </div>
  )
  const isAdmin = canModerate(boardAdmin, boardCreator)

  // Admins/board moderators always see content (with a subtle indicator)
  // Non-flagged content passes through unchanged
  if (!flagged || isAdmin) {
    return (
      <div className={`relative ${className}`}>
        {children}
        {flagged && isAdmin && (
          <div
            className={`absolute top-1 right-1 text-[10px] text-white px-1.5 py-0.5 rounded font-medium ${autoFlagged ? 'bg-amber-600/80' : 'bg-red-500/80'}`}
            title={autoFlagged ? `Automatically flagged: ${automatic.data?.reason ?? 'matched an auto-moderation rule'}` : 'Flagged by a moderator'}
          >
            {autoFlagged ? 'Auto-flagged' : 'Flagged'}
          </div>
        )}
      </div>
    )
  }

  // Flagged content for regular users
  if (revealed === `${markeeId}:${message ?? ''}`) {
    return (
      <div className={`relative ${className}`}>
        {children}
        <button
          onClick={() => setRevealed(null)}
          className="absolute top-1 right-1 text-[10px] text-[#8A8FBF] hover:text-[#B8B6D9] transition-colors"
        >
          Hide
        </button>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Blurred content */}
      <div
        className="select-none pointer-events-none"
        style={{ filter: `blur(${blurAmount})` }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#060A2A]/60 rounded">
        <span className="text-sm text-[#8A8FBF] text-center px-4">
          {overlayText}
        </span>
        {allowReveal && (
          <button
            onClick={() => setRevealed(`${markeeId}:${message ?? ''}`)}
            className="text-xs text-[#7C9CFF] hover:text-[#F897FE] underline transition-colors"
          >
            {MODERATION_DEFAULTS.revealText}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Compatibility wrapper for author labels. Moderation applies to message text only;
 * author names and wallet labels remain visible regardless of the message verdict.
 */
export function ModeratedAuthor({ children }: {
  chainId: number | string
  message?: string
  markeeId: string
  boardAdmin?: string | null
  boardCreator?: string | null
  children: ReactNode
}) {
  return children
}
