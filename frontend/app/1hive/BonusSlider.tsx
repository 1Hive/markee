'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { MONO, PINK, GREEN, TEXT, TEXT2, MUTED, PURPLE } from '@/lib/design-tokens'
import { CAMPAIGN_1HIVE_MIN_VIEWS, CAMPAIGN_1HIVE_MAX_VIEWS, campaign1HiveMonthlyBonusUsd } from '@/lib/campaigns/1hive'

// Log scale: slider position 0..STEPS maps to 10^2 .. 10^6 views.
const STEPS = 400
const LOG_MIN = Math.log10(CAMPAIGN_1HIVE_MIN_VIEWS)
const LOG_MAX = Math.log10(CAMPAIGN_1HIVE_MAX_VIEWS)

function positionToViews(pos: number): number {
  const raw = 10 ** (LOG_MIN + (pos / STEPS) * (LOG_MAX - LOG_MIN))
  // Round to two significant figures so the readout lands on clean numbers.
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1)
  return Math.round(raw / mag) * mag
}

const TICKS = ['100 · $10', '1K', '10K · $100', '100K', '1M+ · $1k']

export function BonusSlider() {
  const [pos, setPos] = useState(STEPS / 2) // 10,000 views
  const views = positionToViews(pos)
  const bonus = campaign1HiveMonthlyBonusUsd(views)
  const pct = (pos / STEPS) * 100

  return (
    <div className="rounded-2xl border border-[#8A8FBF]/20 bg-[#0A0F3D]/70 p-6 sm:p-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <h2 className="text-[28px] sm:text-[40px] font-extrabold leading-[1.05] tracking-[-1.5px]" style={{ color: TEXT }}>
          More views,<br className="hidden lg:block" /> <span style={{ color: PINK }}>bigger bonus.</span>
        </h2>
        {/* Each number reserves the width of its largest value (990,000 / $1,000) so dragging never
            reflows the layout. */}
        <div className="flex items-start gap-3 sm:gap-6" aria-live="polite">
          <div className="text-right">
            <div className="min-w-[6.6ch] text-[28px] sm:text-[56px] font-extrabold leading-none tracking-[-2px] tabular-nums" style={{ color: PURPLE }}>
              {views >= CAMPAIGN_1HIVE_MAX_VIEWS ? '1M+' : views.toLocaleString('en-US')}
            </div>
            <div className="mt-2 text-sm" style={{ color: TEXT2 }}>views</div>
          </div>
          <ArrowRight className="mt-2 sm:mt-5 shrink-0" size={22} style={{ color: MUTED }} aria-hidden />
          <div>
            <div className="min-w-[5.6ch] text-[28px] sm:text-[56px] font-extrabold leading-none tracking-[-2px] tabular-nums" style={{ color: GREEN }}>
              ${bonus.toLocaleString('en-US')}
            </div>
            <div className="mt-2 text-sm" style={{ color: TEXT2 }}>per month</div>
          </div>
        </div>
      </div>

      <label htmlFor="campaign-1hive-views" className="block mt-8 mb-4 text-[11px] uppercase tracking-[2px]" style={{ fontFamily: MONO, color: MUTED }}>
        Drag to see your bonus
      </label>
      <input
        id="campaign-1hive-views"
        type="range"
        min={0}
        max={STEPS}
        step={1}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-valuetext={`${views >= CAMPAIGN_1HIVE_MAX_VIEWS ? '1 million or more' : views.toLocaleString('en-US')} views, $${bonus} per month`}
        className="campaign-1hive-range w-full"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
      <div className="mt-4 flex justify-between text-[11px] sm:text-xs" style={{ fontFamily: MONO, color: MUTED }}>
        {TICKS.map((t, i) => (
          <span key={t} className={i % 2 === 1 ? 'hidden sm:inline' : ''}>{t}</span>
        ))}
      </div>

      <style>{`
        .campaign-1hive-range { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px; cursor: pointer;
          background: linear-gradient(to right, ${PINK} 0%, ${PINK} var(--pct), rgba(138,143,191,0.25) var(--pct), rgba(138,143,191,0.25) 100%); }
        .campaign-1hive-range:focus { outline: none; }
        .campaign-1hive-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 6px rgba(248,151,254,0.4); }
        .campaign-1hive-range:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 6px rgba(248,151,254,0.4); }
        .campaign-1hive-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: ${PINK}; box-shadow: 0 0 0 4px rgba(248,151,254,0.2); }
        .campaign-1hive-range::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 50%;
          background: ${PINK}; box-shadow: 0 0 0 4px rgba(248,151,254,0.2); }
      `}</style>
    </div>
  )
}
