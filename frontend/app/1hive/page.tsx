import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Eye, MonitorSmartphone, Zap } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { LiveDot } from '@/components/ui/LiveDot'
import { MONO, PINK, GREEN, TEXT, TEXT2, MUTED } from '@/lib/design-tokens'
import { CAMPAIGN_1HIVE_SPONSOR_URL, CAMPAIGN_1HIVE_TERMS } from '@/lib/campaigns/1hive'
import { BonusSlider } from './BonusSlider'
import { HeroSignCard } from './HeroSignCard'
import { SignsLeaderboard } from './SignsLeaderboard'
import { CAMPAIGN_CARD } from './styles'

export const metadata: Metadata = {
  title: 'Earn up to $1k/mo · Markee × 1Hive',
  description: 'Add a Markee to your site and get paid to get viewed. Limited time, sponsored by 1Hive.',
}

const CREATE_HREF = '/create-a-markee'

const CARD = CAMPAIGN_CARD
const PRIMARY_BTN =
  'inline-flex items-center gap-2 rounded-lg bg-[#F897FE] px-5 py-3 text-[15px] font-bold text-[#060A2A] shadow-[0_8px_32px_rgba(248,151,254,0.3)] transition-transform duration-[140ms] hover:-translate-y-px'
const SECONDARY_BTN =
  'inline-flex items-center rounded-lg border border-[#8A8FBF]/30 px-5 py-3 text-[15px] font-semibold text-[#EDEEFF] transition-colors duration-[140ms] hover:border-[rgba(248,151,254,0.4)]'

const STEPS = [
  { n: '01', title: 'Add a Markee', body: 'Embed a new sign on your site.', Icon: MonitorSmartphone },
  { n: '02', title: 'Get Traffic', body: 'Funding unlocks after 100 views', Icon: Eye },
  { n: '03', title: 'Get paid', body: 'Up to $1k/mo. based on traffic', Icon: Zap },
]

export default function Campaign1HivePage() {
  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="1hive" />

      {/* Hero */}
      <section
        className="border-b border-[#8A8FBF]/15"
        style={{
          background:
            'radial-gradient(ellipse 60% 70% at 10% 0%, rgba(123,106,244,0.18), transparent 60%), radial-gradient(ellipse 50% 60% at 100% 100%, rgba(124,156,255,0.16), transparent 60%)',
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:px-8">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-[#8A8FBF]/25 bg-[#0A0F3D]/80 px-3 py-1.5 text-xs"
              style={{ fontFamily: MONO, color: TEXT2 }}
            >
              <LiveDot color={GREEN} /> limited time · sponsored by{' '}
              <a href={CAMPAIGN_1HIVE_SPONSOR_URL} target="_blank" rel="noopener noreferrer" className="-ml-1 hover:text-[#F897FE]">1Hive</a>
            </span>
            <h1 className="mt-6 text-[44px] font-extrabold leading-[1.02] tracking-[-2px] sm:text-[64px] sm:tracking-[-3px]" style={{ color: TEXT }}>
              Earn up to <span style={{ color: PINK }}>$1k/mo</span> when you add a Markee to your site.
            </h1>
            <p className="mt-6 max-w-[520px] text-lg leading-relaxed" style={{ color: TEXT2 }}>
              We&apos;re looking for sites people love. Create your Markee today and get paid to get viewed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={CREATE_HREF} className={PRIMARY_BTN}>
                Create a Markee <ArrowRight size={16} aria-hidden />
              </Link>
              <a href="#leaderboard" className={SECONDARY_BTN}>See the leaderboard</a>
            </div>
          </div>

          {/* Illustrative sign */}
          <HeroSignCard href={CREATE_HREF} />
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {/* How it works */}
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ n, title, body, Icon }) => (
            <div key={n} className={`${CARD} p-6`}>
              <div className="flex items-start justify-between">
                <span className="text-sm" style={{ fontFamily: MONO, color: MUTED }}>{n}</span>
                <Icon size={22} style={{ color: PINK }} aria-hidden />
              </div>
              <h3 className="mt-5 text-xl font-extrabold tracking-[-0.5px]" style={{ color: TEXT }}>{title}</h3>
              <p className="mt-2 text-[15px]" style={{ color: TEXT2 }}>{body}</p>
            </div>
          ))}
        </div>

        {/* Bonus calculator */}
        <div className="mt-8">
          <BonusSlider />
        </div>

        {/* Leaderboard */}
        <section id="leaderboard" className="mt-20 scroll-mt-24">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 text-[26px] font-extrabold tracking-[-1px]" style={{ color: TEXT }}>
              <LiveDot color={GREEN} /> Signs earning bonuses
            </h2>
            <span className="text-xs" style={{ fontFamily: MONO, color: MUTED }}>ranked by total views</span>
          </div>

          <SignsLeaderboard createHref={CREATE_HREF} />
        </section>
      </main>

      {/* Closing CTA + terms */}
      <section
        className="border-t border-[#8A8FBF]/15 px-4 py-20 sm:px-6"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 100%, rgba(248,151,254,0.12), transparent 70%)' }}
      >
        <div className="mx-auto max-w-6xl text-center">
          <h2 style={{ color: TEXT, textWrap: 'balance' }} className="text-[36px] font-extrabold leading-[1.05] tracking-[-1.5px] sm:text-[56px] sm:tracking-[-2.5px]">
            Limited time. <span style={{ color: PINK }}>While funding lasts.</span>
          </h2>
          <Link href={CREATE_HREF} className={`${PRIMARY_BTN} mt-8`}>
            Create a Markee <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <div className={`${CARD} mx-auto mt-14 max-w-3xl p-6 sm:p-8`}>
          <h3 className="text-xs uppercase tracking-[2px]" style={{ fontFamily: MONO, color: MUTED }}>Terms and conditions</h3>
          <ul className="mt-4 list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed" style={{ color: TEXT2 }}>
            {CAMPAIGN_1HIVE_TERMS.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </section>

      <Footer />
    </div>
  )
}
