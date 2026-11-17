'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Zap } from 'lucide-react'
import { MarkeeWatermark } from '@/components/board-detail/shared'
import { MONO, PINK, MUTED } from '@/lib/design-tokens'

// Illustrative sign for the /1hive hero. Shares the home-page reader-card hover treatment (lift,
// pink border, Markee watermark, price pill) so it behaves like every other sign on the site.
export function HeroSignCard({ href }: { href: string }) {
  const [hover, setHover] = useState(false)

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label="Create a Markee for your site"
      className="reader-card !block !aspect-auto !p-6 sm:!p-7"
      // containerType lets the sign text size itself to the card's width (cqi), so
      // "to join the Markee network 🪧" stays on one line at every viewport.
      style={{ containerType: 'inline-size', background: 'linear-gradient(160deg, rgba(123,106,244,0.22), rgba(10,15,61,0.85))' }}
    >
      <MarkeeWatermark show={hover} />
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ fontFamily: MONO, color: MUTED }}>
          <Eye size={14} aria-hidden /> 10.0k
        </span>
      </div>
      <p className="mt-4 font-bold leading-snug" style={{ fontFamily: MONO, color: PINK, fontSize: 'clamp(13px, 5.2cqi, 26px)' }}>
        This is your sign...
        <br />
        to join the Markee network 🪧
      </p>
      <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#8A8FBF]/20 pt-4 text-xs">
        <span style={{ fontFamily: MONO, color: MUTED }}>yoursite.com</span>
        <span className="inline-flex items-center gap-1.5 font-bold" style={{ fontFamily: MONO, color: PINK }}>
          <Zap size={14} aria-hidden /> Earning $100/mo
        </span>
      </div>
      <span className="reader-pill" style={{ padding: '4px 16px' }}>more views = bigger bonus</span>
    </Link>
  )
}
