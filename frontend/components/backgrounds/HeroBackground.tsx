export function HeroBackground({
  className = '',
  onReady,
}: {
  className?: string
  starCount?: number
  letterCount?: number
  onReady?: () => void
  onError?: () => void
}) {
  if (onReady && typeof window !== 'undefined') {
    setTimeout(() => onReady(), 0)
  }

  return <div className={`starfield-bg ${className}`} />
}
