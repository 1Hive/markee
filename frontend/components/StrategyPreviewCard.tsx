'use client'

// Extracted from app/create-a-markee/page.tsx (the "Choose Pricing Strategy" step) so
// app/raise-funding/page.tsx can use the exact same card, not a lookalike -- same visual language,
// hover/selection states, and live view counts, styled after FeaturedCard in board-detail/shared.tsx.

import { useState } from 'react'
import { STRATEGIES, type Strategy } from '@/lib/strategy'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'
import { PINK, BLUE, GREEN, BG, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'

const C = { bg: BG, pink: PINK, blue: BLUE, green: GREEN, text: TEXT, text2: TEXT2, muted: MUTED, border: BORDER }

function StrategyGlyph({ glyph, size = 24, color }: { glyph: 'tag' | 'stream'; size?: number; color: string }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24' as const, fill: 'none' as const, stroke: color, strokeWidth: 1.8 as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (glyph === 'tag') return <svg {...s}><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="7.5" r="1.2" fill={color} stroke="none"/></svg>
  return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${+(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function StrategyPreviewCard({
  strategyKey, selected, disabled, onSelect, viewCount,
}: {
  strategyKey: Strategy; selected: boolean; disabled?: boolean; onSelect: () => void; viewCount?: number
}) {
  const [hovering, setHovering] = useState(false)
  const [pressing, setPressing] = useState(false)
  const meta = STRATEGIES[strategyKey]

  const pillText = strategyKey === 'fixed'
    ? 'Pay lump sum to change a message.'
    : 'Stream payment to change a message.'

  const active     = hovering && !disabled
  const isSelected = selected && !disabled

  const textGradient = `linear-gradient(120deg, ${C.text} 0%, ${meta.accent} 100%)`

  const accentRgba = (a: number): string => {
    const hex = meta.accent.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  const borderColor = isSelected
    ? accentRgba(0.75)
    : active
    ? accentRgba(0.35)
    : 'rgba(255,255,255,0.18)'

  const handleClick = () => {
    if (disabled) return
    setPressing(true)
    setTimeout(() => setPressing(false), 220)
    onSelect()
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setPressing(false) }}
      style={{
        position: 'relative' as const, width: '100%', minHeight: 130,
        textAlign: 'center' as const, cursor: disabled ? 'default' : 'pointer',
        background: isSelected ? accentRgba(0.06) : 'rgba(255,255,255,0.04)',
        border: `1px solid ${borderColor}`,
        borderRadius: 16, padding: '20px 24px',
        backdropFilter: 'blur(4px)',
        opacity: disabled ? 0.55 : 1,
        boxShadow: isSelected
          ? `0 0 0 4px ${accentRgba(0.12)}, 0 16px 44px rgba(6,10,42,0.55)`
          : active ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
        transform: pressing ? 'scale(0.96)' : active || isSelected ? 'translateY(-2px)' : 'none',
        transition: 'border-color 220ms, transform 220ms, box-shadow 220ms, background 220ms',
        display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* View count — absolute top-right */}
      <div style={{ position: 'absolute' as const, top: 14, right: 18, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.blue }}>
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        {viewCount != null ? fmtViews(viewCount) : <ViewsSpinner size={9} />}
      </div>

      {/* Label + icon — centered, gradient text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StrategyGlyph glyph={meta.glyph} color={meta.accent} size={28} />
        <div style={{
          fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700,
          fontSize: 'clamp(20px, 2.5vw, 30px)', lineHeight: 1.15, letterSpacing: '-0.02em',
          background: textGradient,
          WebkitBackgroundClip: 'text' as const, backgroundClip: 'text' as const,
          WebkitTextFillColor: 'transparent', userSelect: 'none' as const,
        }}>
          {meta.label}
        </div>
      </div>

      {/* Price pill — floats up from bottom center on hover */}
      <span style={{
        position: 'absolute' as const, bottom: -14, left: '50%',
        transform: `translateX(-50%) ${active ? 'translateY(0)' : 'translateY(4px)'}`,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: meta.accent, color: C.bg,
        fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700, fontSize: 12,
        padding: '6px 14px', borderRadius: 8, whiteSpace: 'nowrap' as const,
        boxShadow: `0 6px 22px ${meta.accent}66`,
        opacity: active ? 1 : 0,
        transition: 'opacity 180ms, transform 180ms',
        pointerEvents: 'none' as const, zIndex: 3,
      }}>
        {pillText}
      </span>

      {/* Coming soon badge */}
      {disabled && (
        <span style={{ position: 'absolute' as const, top: 12, right: 12, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 99, padding: '3px 9px' }}>Coming soon</span>
      )}
    </button>
  )
}
