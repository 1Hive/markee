'use client'

// Pricing-strategy picker card for the Create a Markee flow: icon tile + title + view count +
// one-line description, with a "Best for" checklist underneath. /raise-funding still uses the
// centered StrategyPreviewCard; the glyph and view formatting are shared from there.

import { useState } from 'react'
import { Check } from 'lucide-react'
import { STRATEGIES, type Strategy } from '@/lib/strategy'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'
import { StrategyGlyph, fmtViews } from '@/components/StrategyPreviewCard'
import { MONO, GREEN, BG, TEXT, TEXT2, MUTED, BORDER, LAVENDER } from '@/lib/design-tokens'

const COPY: Record<Strategy, { description: string; bestFor: string[] }> = {
  streaming: {
    description: 'Stream payment only when winning',
    bestFor: ['Most websites and platforms', 'Market dynamics for buyers and sellers'],
  },
  fixed: {
    description: 'Pay lump sum to change a message',
    bestFor: ['Sites with philanthropic sponsors', 'Buyers happy to pay a premium'],
  },
}

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`
}

export function StrategyChoiceCard({
  strategyKey, selected, disabled, onSelect, viewCount,
}: {
  strategyKey: Strategy; selected: boolean; disabled?: boolean; onSelect: () => void; viewCount?: number
}) {
  const [hovering, setHovering] = useState(false)
  const meta = STRATEGIES[strategyKey]
  const copy = COPY[strategyKey]
  const accent = meta.accent
  const isSelected = selected && !disabled
  const active = hovering && !disabled

  return (
    <div>
      <button
        type="button"
        role="radio"
        aria-checked={isSelected}
        aria-disabled={disabled || undefined}
        onClick={() => { if (!disabled) onSelect() }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          position: 'relative', width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 18,
          padding: '18px 20px', borderRadius: 16,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          background: isSelected ? rgba(accent, 0.1) : 'rgba(124,156,255,0.05)',
          border: `1.5px solid ${isSelected ? rgba(accent, 0.85) : active ? rgba(accent, 0.4) : 'rgba(124,156,255,0.22)'}`,
          boxShadow: isSelected ? `0 0 0 4px ${rgba(accent, 0.1)}` : 'none',
          transform: active && !isSelected ? 'translateY(-2px)' : 'none',
          transition: 'border-color 200ms, background 200ms, box-shadow 200ms, transform 200ms',
        }}
      >
        {/* Icon tile, with a check badge when selected */}
        <span style={{
          position: 'relative', flexShrink: 0, width: 50, height: 50, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: rgba(accent, 0.12),
        }}>
          <StrategyGlyph glyph={meta.glyph} color={accent} size={24} />
          {isSelected && (
            <span aria-hidden style={{
              position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 99,
              background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 2px ${BG}`,
            }}>
              <Check size={12} strokeWidth={3} color={BG} />
            </span>
          )}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: TEXT }}>
              {meta.label}
            </span>
            {disabled ? (
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: MUTED, background: BG, border: `1px solid ${BORDER}`, borderRadius: 99, padding: '3px 9px' }}>
                Coming soon
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, color: MUTED }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
                {viewCount != null ? fmtViews(viewCount) : <ViewsSpinner size={9} />}
              </span>
            )}
          </span>
          <span style={{ display: 'block', marginTop: 4, fontSize: 14.5, lineHeight: 1.45, color: TEXT2 }}>
            {copy.description}
          </span>
        </span>
      </button>

      <div style={{ padding: '18px 6px 0' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: LAVENDER, opacity: 0.8 }}>
          Best for
        </div>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {copy.bestFor.map(item => (
            <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14.5, lineHeight: 1.45, color: TEXT }}>
              <Check size={16} strokeWidth={2.4} color={GREEN} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
