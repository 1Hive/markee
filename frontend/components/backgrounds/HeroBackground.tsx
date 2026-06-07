export function HeroBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Gradient: pink glow top-left, blue glow bottom-right, dark base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%), ' +
            'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%), ' +
            'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
        }}
      />
      {/* Two-layer twinkling starfield (CSS ::before + ::after, cross-faded) */}
      <div className="starfield-bg" />
      {/* Scanline texture */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)',
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
