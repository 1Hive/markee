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

import { useState, type ReactNode } from 'react'
import { useModeration } from '@/components/moderation/ModerationProvider'
import { MODERATION_DEFAULTS } from '@/lib/moderation/config'

interface ModeratedContentProps {
  chainId: number | string
  markeeId: string
  children: ReactNode
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
  children,
  blurAmount = MODERATION_DEFAULTS.blurAmount,
  overlayText = MODERATION_DEFAULTS.overlayText,
  allowReveal = MODERATION_DEFAULTS.allowReveal,
  className = '',
}: ModeratedContentProps) {
  const { isFlagged, isAdmin } = useModeration()
  const [revealed, setRevealed] = useState(false)

  const flagged = isFlagged(chainId, markeeId)

  // Admins always see content (with a subtle indicator)
  // Non-flagged content passes through unchanged
  if (!flagged || isAdmin) {
    return (
      <div className={`relative ${className}`}>
        {children}
        {flagged && isAdmin && (
          <div className="absolute top-1 right-1 text-[10px] bg-red-500/80 text-white px-1.5 py-0.5 rounded font-medium">
            Flagged
          </div>
        )}
      </div>
    )
  }

  // Flagged content for regular users
  if (revealed) {
    return (
      <div className={`relative ${className}`}>
        {children}
        <button
          onClick={() => setRevealed(false)}
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
            onClick={() => setRevealed(true)}
            className="text-xs text-[#7C9CFF] hover:text-[#F897FE] underline transition-colors"
          >
            {MODERATION_DEFAULTS.revealText}
          </button>
        )}
      </div>
    </div>
  )
}
