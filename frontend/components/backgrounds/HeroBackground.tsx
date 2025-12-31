export function HeroBackground({
  className = '',
  onReady,
  onError,
  starCount, // Ignored - no animations
  letterCount, // Ignored - no animations
}: {
  className?: string
  starCount?: number
  letterCount?: number
  onReady?: () => void
  onError?: () => void
}) {
  // Call onReady immediately since there's nothing to load
  if (onReady && typeof window !== 'undefined') {
    setTimeout(() => onReady(), 0)
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Base deep space gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#060A2A] via-[#0A0F3D] to-[#1A1766]" />
      
      {/* Nebula cloud 1 - Pink/Purple glow */}
      <div 
        className="absolute w-[800px] h-[800px] rounded-full opacity-20 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, rgba(248,151,254,0.6) 0%, rgba(123,106,244,0.3) 40%, transparent 70%)',
          top: '10%',
          right: '15%',
        }}
      />
      
      {/* Nebula cloud 2 - Blue glow */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full opacity-25 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, rgba(124,156,255,0.5) 0%, rgba(123,106,244,0.25) 50%, transparent 70%)',
          bottom: '20%',
          left: '10%',
        }}
      />
      
      {/* Subtle star field effect using CSS */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(2px 2px at 20% 30%, white, transparent),
            radial-gradient(2px 2px at 60% 70%, white, transparent),
            radial-gradient(1px 1px at 50% 50%, white, transparent),
            radial-gradient(1px 1px at 80% 10%, white, transparent),
            radial-gradient(2px 2px at 90% 60%, white, transparent),
            radial-gradient(1px 1px at 33% 85%, white, transparent),
            radial-gradient(1px 1px at 15% 75%, white, transparent),
            radial-gradient(2px 2px at 45% 15%, white, transparent)
          `,
          backgroundSize: '200% 200%',
          backgroundPosition: '0% 0%, 40% 60%, 80% 20%, 30% 90%, 60% 40%, 90% 80%, 10% 50%, 70% 10%',
        }}
      />
    </div>
  )
}
