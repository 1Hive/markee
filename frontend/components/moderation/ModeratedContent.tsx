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
import { useSyncExternalStore, type ReactNode } from 'react'
import { useModeration } from '@/components/moderation/ModerationProvider'
import { MODERATION_DEFAULTS } from '@/lib/moderation/config'

interface ModeratedContentProps {
  chainId: number | string
  message?: string
  markeeId: string
  children: ReactNode
  /** This markee's board admin -- lets that board's own admin see through the blur too, not just global admins */
  boardAdmin?: string | null
  /** Override default blur amount */
  blurAmount?: string
  /** Override default overlay text */
  overlayText?: string
  /** Override whether users can reveal content */
  allowReveal?: boolean
  /** Additional class names for the wrapper */
  className?: string
  /** Placeholder bars shown while the moderation check runs: 1 for single-line rows, 2 (default) for cards */
  placeholderLines?: 1 | 2
}

// Revealed flagged Markees, keyed by markee and message, shared so revealing a message also reveals its
// author label wherever both are shown.
let revealedKeys = new Set<string>()
const revealListeners = new Set<() => void>()
const subscribeRevealed = (listener: () => void) => { revealListeners.add(listener); return () => { revealListeners.delete(listener) } }
function setRevealed(key: string, shown: boolean) {
  revealedKeys = new Set(revealedKeys)
  if (shown) revealedKeys.add(key); else revealedKeys.delete(key)
  revealListeners.forEach(listener => listener())
}
function useRevealed(key: string) {
  return useSyncExternalStore(subscribeRevealed, () => revealedKeys.has(key), () => false)
}

/** The moderation verdict both a message and its author label follow: flagged by a moderator or automatically. */
function useMarkeeVerdict(chainId: number | string, markeeId: string, message?: string) {
  const { isFlagged } = useModeration()
  const automatic = usePublishedModeration(chainId, markeeId, message)
  const manuallyFlagged = isFlagged(chainId, markeeId) || automatic.data?.siteState === 'manual-flagged'
  // An automatic flag is separate from the moderator's flag (the shield only toggles the latter), so it gets
  // its own label and reason; a moderator clears it with a false-positive approval in the queue.
  const autoFlagged = !manuallyFlagged && automatic.data?.siteState === 'soft-flagged'
  return { automatic, manuallyFlagged, autoFlagged, flagged: manuallyFlagged || autoFlagged }
}

/** Message-shaped loading bars, shown instead of the message until its moderation check is done. */
export function MessageSkeleton({ lines = 2 }: { lines?: 1 | 2 }) {
  return (
    <span className="skeleton-lines" aria-hidden="true">
      <span className="skeleton skeleton-line" />
      {lines === 2 && <span className="skeleton skeleton-line skeleton-line--short" />}
    </span>
  )
}

export function ModeratedContent({
  chainId,
  markeeId,
  message,
  children,
  boardAdmin,
  blurAmount = MODERATION_DEFAULTS.blurAmount,
  overlayText = MODERATION_DEFAULTS.overlayText,
  allowReveal = MODERATION_DEFAULTS.allowReveal,
  className = '',
  placeholderLines = 2,
}: ModeratedContentProps) {
  const { canModerate } = useModeration()
  const { automatic, autoFlagged, flagged } = useMarkeeVerdict(chainId, markeeId, message)
  const revealKey = `${markeeId.toLowerCase()}:${message ?? ''}`
  const revealed = useRevealed(revealKey)
  if (automatic.unavailable) return (
    <div role="status" aria-label="Loading message" className={className}>
      <MessageSkeleton lines={placeholderLines} />
    </div>
  )
  const isAdmin = canModerate(boardAdmin)

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
  if (revealed) {
    return (
      <div className={`relative ${className}`}>
        {children}
        <button
          onClick={() => setRevealed(revealKey, false)}
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
            onClick={() => setRevealed(revealKey, true)}
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
 * ModeratedAuthor
 *
 * Wraps a message's author label (display name, or wallet when there is no name). The display name is
 * judged with the message by the same rules, and a flagged Markee blurs both, as SDK signs hide both.
 * The board's moderators and global admins still see it; revealing the message reveals its author too.
 * Without `message` (a past name in a board's history) only a moderator's flag applies.
 *
 * Usage:
 *   <ModeratedAuthor chainId={8453} markeeId={markee.address} message={markee.message}>{markee.name}</ModeratedAuthor>
 */
export function ModeratedAuthor({ chainId, markeeId, message, boardAdmin, blurAmount = MODERATION_DEFAULTS.blurAmount, children }: {
  chainId: number | string
  message?: string
  markeeId: string
  boardAdmin?: string | null
  blurAmount?: string
  children: ReactNode
}) {
  const { canModerate } = useModeration()
  const { automatic, flagged } = useMarkeeVerdict(chainId, markeeId, message)
  const revealed = useRevealed(`${markeeId.toLowerCase()}:${message ?? ''}`)
  // Until a verdict is in, the label stays blurred like its message's placeholder.
  const pending = message !== undefined && automatic.unavailable
  if (revealed || canModerate(boardAdmin) || !flagged && !pending) return <>{children}</>
  return (
    <span>
      <span className="select-none" style={{ filter: `blur(${blurAmount})` }} aria-hidden="true">{children}</span>
      <span className="sr-only">{MODERATION_DEFAULTS.hiddenAuthorText}</span>
    </span>
  )
}
