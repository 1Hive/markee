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
      <div className="absolute inset-0 bg-gradient-to-br from-[#060A2A] via-[#0A0F3D] to-[#1A1766] pointer-events-none" />
      
      {/* Nebula cloud 1 - Pink/Purple glow */}
      <div 
        className="absolute w-[800px] h-[800px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(248,151,254,0.6) 0%, rgba(123,106,244,0.3) 40%, transparent 70%)',
          top: '10%',
          right: '15%',
        }}
      />
      
      {/* Nebula cloud 2 - Blue glow */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full opacity-25 blur-[100px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(124,156,255,0.5) 0%, rgba(123,106,244,0.25) 50%, transparent 70%)',
          bottom: '20%',
          left: '10%',
        }}
      />
      
      {/* Subtle star field effect using CSS */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none"
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
      <div className="cosmic-letters pointer-events-none">
        <div className="letter letter-1 pointer-events-none">M</div>
        <div className="letter letter-2 pointer-events-none">A</div>
        <div className="letter letter-3 pointer-events-none">R</div>
        <div className="letter letter-4 pointer-events-none">K</div>
        <div className="letter letter-5 pointer-events-none">E</div>
        <div className="letter letter-6 pointer-events-none">E</div>
        <div className="letter letter-7 pointer-events-none">C</div>
        <div className="letter letter-8 pointer-events-none">O</div>
        <div className="letter letter-9 pointer-events-none">P</div>
        <div className="letter letter-10 pointer-events-none">W</div>
        <div className="letter letter-11 pointer-events-none">E</div>
        <div className="letter letter-12 pointer-events-none">B</div>
        <div className="letter letter-13 pointer-events-none">3</div>
        <div className="letter letter-14 pointer-events-none">D</div>
        <div className="letter letter-15 pointer-events-none">A</div>
        <div className="letter letter-16 pointer-events-none">O</div>
        <div className="letter letter-17 pointer-events-none">X</div>
        <div className="letter letter-18 pointer-events-none">Y</div>
        <div className="letter letter-19 pointer-events-none">Z</div>
        <div className="letter letter-20 pointer-events-none">T</div>
      </div>

      <style jsx>{`
        .cosmic-letters {
          position: absolute;
          inset: 0;
          font-family: var(--font-jetbrains-mono), 'JetBrains Mono', monospace;
          font-weight: 600;
          pointer-events: none;
        }

        .letter {
          position: absolute;
          color: #B8B6D9;
          text-shadow: 0 0 8px rgba(248, 151, 254, 0.3);
          pointer-events: none;
        }

        /* Position and animate each letter uniquely with varying brightness */
        .letter-1 { font-size: 24px; top: 15%; left: -5%; opacity: 0.12; animation: float-rotate-1 80s infinite linear; animation-delay: -10s; }
        .letter-2 { font-size: 18px; top: 25%; left: 105%; opacity: 0.07; animation: float-rotate-2 95s infinite linear; animation-delay: -20s; }
        .letter-3 { font-size: 22px; top: 45%; left: -5%; opacity: 0.15; animation: float-rotate-3 110s infinite linear; animation-delay: -30s; }
        .letter-4 { font-size: 20px; top: 60%; left: 105%; opacity: 0.05; animation: float-rotate-4 88s infinite linear; animation-delay: -15s; }
        .letter-5 { font-size: 26px; top: 75%; left: -5%; opacity: 0.10; animation: float-rotate-5 120s infinite linear; animation-delay: -45s; }
        .letter-6 { font-size: 16px; top: 10%; left: 105%; opacity: 0.04; animation: float-rotate-6 105s infinite linear; animation-delay: -25s; }
        .letter-7 { font-size: 21px; top: 35%; left: -5%; opacity: 0.13; animation: float-rotate-7 92s infinite linear; animation-delay: -35s; }
        .letter-8 { font-size: 19px; top: 50%; left: 105%; opacity: 0.08; animation: float-rotate-8 98s infinite linear; animation-delay: -40s; }
        .letter-9 { font-size: 23px; top: 68%; left: -5%; opacity: 0.11; animation: float-rotate-9 115s infinite linear; animation-delay: -50s; }
        .letter-10 { font-size: 17px; top: 82%; left: 105%; opacity: 0.06; animation: float-rotate-10 85s infinite linear; animation-delay: -18s; }
        .letter-11 { font-size: 25px; top: 20%; left: -5%; opacity: 0.14; animation: float-rotate-11 100s infinite linear; animation-delay: -55s; }
        .letter-12 { font-size: 20px; top: 42%; left: 105%; opacity: 0.09; animation: float-rotate-12 93s infinite linear; animation-delay: -28s; }
        .letter-13 { font-size: 18px; top: 55%; left: -5%; opacity: 0.03; animation: float-rotate-13 107s infinite linear; animation-delay: -42s; }
        .letter-14 { font-size: 22px; top: 12%; left: 105%; opacity: 0.12; animation: float-rotate-14 96s infinite linear; animation-delay: -33s; }
        .letter-15 { font-size: 19px; top: 72%; left: -5%; opacity: 0.07; animation: float-rotate-15 89s infinite linear; animation-delay: -48s; }
        .letter-16 { font-size: 24px; top: 38%; left: 105%; opacity: 0.15; animation: float-rotate-16 112s infinite linear; animation-delay: -60s; }
        .letter-17 { font-size: 21px; top: 65%; left: -5%; opacity: 0.05; animation: float-rotate-17 91s infinite linear; animation-delay: -22s; }
        .letter-18 { font-size: 16px; top: 28%; left: 105%; opacity: 0.10; animation: float-rotate-18 103s infinite linear; animation-delay: -52s; }
        .letter-19 { font-size: 20px; top: 85%; left: -5%; opacity: 0.08; animation: float-rotate-19 94s infinite linear; animation-delay: -38s; }
        .letter-20 { font-size: 23px; top: 48%; left: 105%; opacity: 0.13; animation: float-rotate-20 108s infinite linear; animation-delay: -44s; }

        /* Keyframe animations - drift across screen with rotation */
        @keyframes float-rotate-1 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(120vw, 30vh) rotate(360deg); }
        }

        @keyframes float-rotate-2 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-80vw, -20vh) rotate(-360deg); }
        }

        @keyframes float-rotate-3 {
          0% { transform: translate(0, 0) rotate(15deg); }
          100% { transform: translate(95vw, -35vh) rotate(375deg); }
        }

        @keyframes float-rotate-4 {
          0% { transform: translate(0, 0) rotate(-20deg); }
          100% { transform: translate(-110vw, 25vh) rotate(340deg); }
        }

        @keyframes float-rotate-5 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(70vw, 40vh) rotate(360deg); }
        }

        @keyframes float-rotate-6 {
          0% { transform: translate(0, 0) rotate(45deg); }
          100% { transform: translate(-95vw, -30vh) rotate(-315deg); }
        }

        @keyframes float-rotate-7 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(85vw, -15vh) rotate(360deg); }
        }

        @keyframes float-rotate-8 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-75vw, 35vh) rotate(-360deg); }
        }

        @keyframes float-rotate-9 {
          0% { transform: translate(0, 0) rotate(30deg); }
          100% { transform: translate(105vw, -25vh) rotate(390deg); }
        }

        @keyframes float-rotate-10 {
          0% { transform: translate(0, 0) rotate(-15deg); }
          100% { transform: translate(-88vw, 20vh) rotate(345deg); }
        }

        @keyframes float-rotate-11 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(92vw, 28vh) rotate(360deg); }
        }

        @keyframes float-rotate-12 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-102vw, -18vh) rotate(-360deg); }
        }

        @keyframes float-rotate-13 {
          0% { transform: translate(0, 0) rotate(60deg); }
          100% { transform: translate(78vw, -40vh) rotate(420deg); }
        }

        @keyframes float-rotate-14 {
          0% { transform: translate(0, 0) rotate(-30deg); }
          100% { transform: translate(-85vw, 32vh) rotate(330deg); }
        }

        @keyframes float-rotate-15 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(115vw, -22vh) rotate(360deg); }
        }

        @keyframes float-rotate-16 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-72vw, 38vh) rotate(-360deg); }
        }

        @keyframes float-rotate-17 {
          0% { transform: translate(0, 0) rotate(90deg); }
          100% { transform: translate(88vw, 18vh) rotate(450deg); }
        }

        @keyframes float-rotate-18 {
          0% { transform: translate(0, 0) rotate(-45deg); }
          100% { transform: translate(-98vw, -28vh) rotate(-405deg); }
        }

        @keyframes float-rotate-19 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(82vw, 35vh) rotate(360deg); }
        }

        @keyframes float-rotate-20 {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-108vw, -15vh) rotate(360deg); }
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
