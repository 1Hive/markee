import type { CSSProperties } from 'react'
import { PINK } from '@/lib/design-tokens'

// The signature pulsing "live" indicator dot. Use this everywhere instead of hand-rolled spans so
// color, glow and timing stay consistent. The glow follows the dot color (glowPulse in globals.css
// animates box-shadow in currentColor), so a GREEN dot glows green and a PINK dot glows pink.
// Pink = live/active by default; GREEN = earning/streaming/campaign-live states.
export function LiveDot({
  color = PINK,
  size = 8,
  pulse = true,
  style,
}: {
  color?: string
  size?: number
  /** false renders a still, glow-less dot (e.g. an inactive state). */
  pulse?: boolean
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden
      className={pulse ? 'live-dot' : undefined}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 99,
        flexShrink: 0,
        background: color,
        color,
        ...style,
      }}
    />
  )
}
