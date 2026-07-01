import { STRATEGIES, type Strategy } from '@/lib/strategy'

// Small pill marking a markee's pricing strategy, so fixed-price and streaming can share one list.
export function StrategyBadge({ strategy, size = 'sm' }: { strategy: Strategy; size?: 'sm' | 'xs' }) {
  const meta = STRATEGIES[strategy]
  const isStream = strategy === 'streaming'
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
      {isStream ? 'Streaming' : 'Fixed'}
    </span>
  )
}
