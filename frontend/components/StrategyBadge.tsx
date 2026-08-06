'use client'

import { useState } from 'react'
import { STRATEGIES, type Strategy } from '@/lib/strategy'

export function StrategyBadge({ strategy, size = 'sm', iconOnly = false }: { strategy: Strategy; size?: 'sm' | 'xs'; iconOnly?: boolean }) {
  const [hov, setHov] = useState(false)
  const meta = STRATEGIES[strategy]
  const isStream = strategy === 'streaming'

  if (iconOnly) {
    return (
      <span
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', flexShrink: 0, width: 20, height: 20 }}
      >
        <span style={{ color: meta.accent, fontSize: 13, lineHeight: 1 }} aria-label={meta.label}>
          {isStream ? '⚡' : '🏷'}
        </span>
        {hov && (
          <span style={{
            position: 'absolute', right: 0, bottom: '100%', marginBottom: 5,
            background: '#0A0F3D', border: `1px solid ${meta.accent}40`,
            borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' as const,
            fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: meta.accent,
            pointerEvents: 'none', zIndex: 10,
          }}>
            {meta.label}
          </span>
        )}
      </span>
    )
  }

  const fs = size === 'xs' ? 9 : 10
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'var(--font-jetbrains-mono)', fontSize: fs, letterSpacing: 0.5,
      textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.4,
      color: meta.accent, background: `${meta.accent}1A`, border: `1px solid ${meta.accent}40`,
      borderRadius: 99, padding: size === 'xs' ? '1px 6px' : '2px 8px',
    }}>
      <span aria-hidden style={{ fontSize: fs + 1 }}>{isStream ? '⚡' : '🏷'}</span>
      {meta.label}
    </span>
  )
}
