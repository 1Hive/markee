import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LiveDot } from '@/components/ui/LiveDot'
import { MONO, PINK, GREEN, TEXT, TEXT2, MUTED } from '@/lib/design-tokens'
import { ONE_HIVE_MIN_VIEWS, oneHiveMonthlyBonusUsd } from '@/lib/campaigns/oneHive'

// Home-page promo for the 1Hive incentives campaign, shown under the "Pay to be seen" metrics. Remove along with the header pill when the
// campaign ends.
export function OneHiveBanner() {
  return (
    <div
      className="mx-auto mt-12 flex max-w-[780px] flex-col gap-4 rounded-2xl border px-5 py-5 text-left sm:px-7 sm:py-6 md:flex-row md:items-center md:gap-7"
      style={{
        borderColor: 'rgba(248,151,254,0.55)',
        background: 'linear-gradient(100deg, rgba(248,151,254,0.12) 0%, rgba(123,106,244,0.14) 45%, rgba(124,156,255,0.12) 100%)',
      }}
    >
      <div className="flex-1">
        <span className="inline-flex items-center gap-2 text-xs" style={{ fontFamily: MONO, color: TEXT2 }}>
          <LiveDot color={GREEN} /> limited time · sponsored by 1Hive
        </span>
        <h2 className="mt-2 text-[20px] font-extrabold leading-[1.15] tracking-[-0.5px] sm:text-[22px]" style={{ color: TEXT, textWrap: 'balance' }}>
          Earn up to <span style={{ color: PINK }}>$1k/mo</span> when you add a Markee to your site.
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-5 md:gap-7">
        <div className="md:border-l md:pl-7" style={{ borderColor: 'rgba(138,143,191,0.25)' }}>
          <div className="text-[22px] font-bold leading-none" style={{ fontFamily: MONO, color: GREEN }}>
            ${oneHiveMonthlyBonusUsd(ONE_HIVE_MIN_VIEWS)}/mo
          </div>
          <div className="mt-1 text-[11px]" style={{ fontFamily: MONO, color: MUTED }}>
            bonus unlocks at {ONE_HIVE_MIN_VIEWS} views
          </div>
        </div>
        <Link
          href="/1hive"
          className="inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-[14px] font-bold text-[#060A2A] shadow-[0_8px_32px_rgba(248,151,254,0.3)] transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-px hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)]"
          style={{ background: PINK }}
        >
          See how <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </div>
  )
}
