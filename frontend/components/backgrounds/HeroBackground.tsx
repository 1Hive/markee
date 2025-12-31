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

      {/* Floating letters - CSS animated */}
      <div className="cosmic-letters">
        <div className="letter letter-1">M</div>
        <div className="letter letter-2">A</div>
        <div className="letter letter-3">R</div>
        <div className="letter letter-4">K</div>
        <div className="letter letter-5">E</div>
        <div className="letter letter-6">E</div>
        <div className="letter letter-7">C</div>
        <div className="letter letter-8">O</div>
        <div className="letter letter-9">P</div>
        <div className="letter letter-10">W</div>
        <div className="letter letter-11">E</div>
        <div className="letter letter-12">B</div>
        <div className="letter letter-13">3</div>
        <div className="letter letter-14">D</div>
        <div className="letter letter-15">A</div>
        <div className="letter letter-16">O</div>
        <div className="letter letter-17">X</div>
        <div className="letter letter-18">Y</div>
        <div className="letter letter-19">Z</div>
        <div className="letter letter-20">T</div>
      </div>

      <style jsx>{`
        .cosmic-letters {
          position: absolute;
          inset: 0;
          font-family: var(--font-jetbrains-mono), 'JetBrains Mono', monospace;
          font-weight: 600;
        }

        .letter {
          position: absolute;
          color: #B8B6D9;
          text-shadow: 0 0 8px rgba(248, 151, 254, 0.3);
          opacity: 0.05;
        }

        /* Position and animate each letter uniquely */
        .letter-1 { font-size: 24px; top: 15%; left: 10%; animation: float-rotate-1 80s infinite linear; }
        .letter-2 { font-size: 18px; top: 25%; left: 75%; animation: float-rotate-2 95s infinite linear; }
        .letter-3 { font-size: 22px; top: 45%; left: 20%; animation: float-rotate-3 110s infinite linear; }
        .letter-4 { font-size: 20px; top: 60%; left: 85%; animation: float-rotate-4 88s infinite linear; }
        .letter-5 { font-size: 26px; top: 75%; left: 45%; animation: float-rotate-5 120s infinite linear; }
        .letter-6 { font-size: 16px; top: 10%; left: 55%; animation: float-rotate-6 105s infinite linear; }
        .letter-7 { font-size: 21px; top: 35%; left: 65%; animation: float-rotate-7 92s infinite linear; }
        .letter-8 { font-size: 19px; top: 50%; left: 12%; animation: float-rotate-8 98s infinite linear; }
        .letter-9 { font-size: 23px; top: 68%; left: 70%; animation: float-rotate-9 115s infinite linear; }
        .letter-10 { font-size: 17px; top: 82%; left: 25%; animation: float-rotate-10 85s infinite linear; }
        .letter-11 { font-size: 25px; top: 20%; left: 40%; animation: float-rotate-11 100s infinite linear; }
        .letter-12 { font-size: 20px; top: 42%; left: 88%; animation: float-rotate-12 93s infinite linear; }
        .letter-13 { font-size: 18px; top: 55%; left: 52%; animation: float-rotate-13 107s infinite linear; }
        .letter-14 { font-size: 22px; top: 12%; left: 82%; animation: float-rotate-14 96s infinite linear; }
        .letter-15 { font-size: 19px; top: 72%; left: 15%; animation: float-rotate-15 89s infinite linear; }
        .letter-16 { font-size: 24px; top: 38%; left: 35%; animation: float-rotate-16 112s infinite linear; }
        .letter-17 { font-size: 21px; top: 65%; left: 58%; animation: float-rotate-17 91s infinite linear; }
        .letter-18 { font-size: 16px; top: 28%; left: 48%; animation: float-rotate-18 103s infinite linear; }
        .letter-19 { font-size: 20px; top: 85%; left: 78%; animation: float-rotate-19 94s infinite linear; }
        .letter-20 { font-size: 23px; top: 48%; left: 92%; animation: float-rotate-20 108s infinite linear; }

        /* Keyframe animations - very slow rotation with subtle float */
        @keyframes float-rotate-1 {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(10px, -8px) rotate(90deg); }
          50% { transform: translate(0, -15px) rotate(180deg); }
          75% { transform: translate(-10px, -8px) rotate(270deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes float-rotate-2 {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-12px, 10px) rotate(-90deg); }
          50% { transform: translate(0, 18px) rotate(-180deg); }
          75% { transform: translate(12px, 10px) rotate(-270deg); }
          100% { transform: translate(0, 0) rotate(-360deg); }
        }

        @keyframes float-rotate-3 {
          0% { transform: translate(0, 0) rotate(15deg); }
          50% { transform: translate(8px, -12px) rotate(195deg); }
          100% { transform: translate(0, 0) rotate(375deg); }
        }

        @keyframes float-rotate-4 {
          0% { transform: translate(0, 0) rotate(-20deg); }
          33% { transform: translate(-15px, 5px) rotate(100deg); }
          66% { transform: translate(5px, -10px) rotate(220deg); }
          100% { transform: translate(0, 0) rotate(340deg); }
        }

        @keyframes float-rotate-5 {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-8px, 12px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes float-rotate-6 {
          0% { transform: translate(0, 0) rotate(45deg); }
          25% { transform: translate(12px, 8px) rotate(-45deg); }
          50% { transform: translate(0, 15px) rotate(-135deg); }
          75% { transform: translate(-12px, 8px) rotate(-225deg); }
          100% { transform: translate(0, 0) rotate(-315deg); }
        }

        @keyframes float-rotate-7 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes float-rotate-8 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(-360deg); }
        }

        @keyframes float-rotate-9 {
          0% { transform: translate(0, 0) rotate(30deg); }
          50% { transform: translate(10px, -10px) rotate(210deg); }
          100% { transform: translate(0, 0) rotate(390deg); }
        }

        @keyframes float-rotate-10 {
          0% { transform: translate(0, 0) rotate(-15deg); }
          50% { transform: translate(-10px, 10px) rotate(165deg); }
          100% { transform: translate(0, 0) rotate(345deg); }
        }

        @keyframes float-rotate-11 {
          0% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(8px, -5px) rotate(120deg); }
          66% { transform: translate(-8px, -5px) rotate(240deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes float-rotate-12 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(-360deg); }
        }

        @keyframes float-rotate-13 {
          0% { transform: translate(0, 0) rotate(60deg); }
          50% { transform: translate(6px, 8px) rotate(240deg); }
          100% { transform: translate(0, 0) rotate(420deg); }
        }

        @keyframes float-rotate-14 {
          0% { transform: translate(0, 0) rotate(-30deg); }
          50% { transform: translate(-6px, -8px) rotate(150deg); }
          100% { transform: translate(0, 0) rotate(330deg); }
        }

        @keyframes float-rotate-15 {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(12px, 12px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes float-rotate-16 {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-12px, -12px) rotate(-180deg); }
          100% { transform: translate(0, 0) rotate(-360deg); }
        }

        @keyframes float-rotate-17 {
          0% { transform: translate(0, 0) rotate(90deg); }
          100% { transform: translate(0, 0) rotate(450deg); }
        }

        @keyframes float-rotate-18 {
          0% { transform: translate(0, 0) rotate(-45deg); }
          100% { transform: translate(0, 0) rotate(-405deg); }
        }

        @keyframes float-rotate-19 {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(5px, 10px) rotate(90deg); }
          50% { transform: translate(0, 5px) rotate(180deg); }
          75% { transform: translate(-5px, 10px) rotate(270deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes float-rotate-20 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        /* Respect reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .letter {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
