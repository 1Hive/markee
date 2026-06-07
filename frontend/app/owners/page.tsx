'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import TokenomicsSimulator from '@/components/ui/TokenomicsSimulator'

// ---------------------------------------------------------------------------
// Phase / stage data
// ---------------------------------------------------------------------------

const STAGE_1_START = new Date('2025-12-21T00:00:00Z')
const CUT_INTERVAL_MS = 91.31 * 24 * 60 * 60 * 1000

const PHASES = [
  {
    phase: 0,
    rate: 100000,
    endDate: new Date(STAGE_1_START.getTime() + 1 * CUT_INTERVAL_MS),
    label: 'Phase 0',
    color: 'bg-[#935AF0]',
  },
  {
    phase: 1,
    rate: 50000,
    endDate: new Date(STAGE_1_START.getTime() + 2 * CUT_INTERVAL_MS),
    label: 'Phase 1',
    color: 'bg-[#7B6AF4]',
  },
  {
    phase: 2,
    rate: 25000,
    endDate: new Date(STAGE_1_START.getTime() + 3 * CUT_INTERVAL_MS),
    label: 'Phase 2',
    color: 'bg-[#6A4AE3]',
  },
  {
    phase: 3,
    rate: 12500,
    endDate: new Date(STAGE_1_START.getTime() + 4 * CUT_INTERVAL_MS),
    label: 'Phase 3',
    color: 'bg-[#4B3ACC]',
  },
  {
    phase: 4,
    rate: 6250,
    endDate: new Date('2026-12-21T00:00:00Z'),
    label: 'Stage 2',
    color: 'bg-[#4B3ACC]',
  },
]

function getCurrentPhase() {
  const now = new Date()
  for (let i = 0; i < PHASES.length; i++) {
    if (now < PHASES[i].endDate) return i
  }
  return PHASES.length - 1
}

const STAGES = [
  { n: 1, cut: '−50%', dur: '1 year', color: '#F897FE' },
  { n: 2, cut: '−20%', dur: '2 years', color: '#7B6AF4' },
  { n: 3, cut: '−10%', dur: 'forever', color: '#7C9CFF' },
]

const TEAM = [
  { name: 'Paul', role: 'Founder', color: '#F897FE' },
  { name: 'Jango', role: 'Revnets Lead', color: '#7B6AF4' },
  { name: 'Gossman', role: 'Engineer', color: '#7C9CFF' },
  { name: 'Stefano', role: 'Engineer', color: '#7C9CFF' },
  { name: 'Mati', role: 'Growth', color: '#1DB227' },
  { name: 'Rohek', role: 'Growth', color: '#1DB227' },
]

const ABOUT_POINTS = [
  'Markee is a digital-native cooperative. All network assets, including revenue, smart contracts, frontends, branding, and treasury backing, are owned and governed by MARKEE token holders and bound by a Covenant.',
  'All platform revenue is received by the Markee Revnet, issuing MARKEE at the current scheduled price, with a 38% community reserve distributed to network participants.',
  'A one-time auto-issuance of 40M MARKEE was allocated at launch to the Markee Growth Fund.',
  'A one-time auto-issuance of 10M MARKEE was allocated to the Founding Team at launch.',
  'Token issuance terms are immutable and locked forever.',
]

const FAQS = [
  {
    q: 'What is the Markee Cooperative?',
    a: "It's the digital-native organization that owns and operates Markee. There's no company behind it — the network is collectively owned by everyone holding MARKEE and governed onchain by the Covenant.",
  },
  {
    q: 'What do MARKEE holders own?',
    a: "Everything the network is made of: protocol revenue, the smart contracts, the frontends, the brand, and the treasury backing the token. Ownership is proportional to your MARKEE, enforced onchain.",
  },
  {
    q: 'What is Revnets?',
    a: 'Revnets is the onchain mechanism that receives all platform revenue and issues MARKEE at a fixed, decreasing schedule with a 38% community reserve. The rules are immutable.',
  },
  {
    q: 'What is Gardens?',
    a: 'Gardens is where governance happens. MARKEE holders propose and vote on decisions using conviction voting; proposals that reach the threshold execute automatically.',
  },
  {
    q: 'Is Markee open source?',
    a: 'Yes. The contracts and frontends are open source and owned by the cooperative — anyone can read, fork, and build on them.',
  },
  {
    q: 'How do I become an owner?',
    a: 'Buy MARKEE with the widget at the top of this page, or earn it by participating in the network. Holding MARKEE makes you an owner with a vote in governance.',
  },
]

const TABS = ['About MARKEE', 'Token Issuance Schedule', 'Founding Team', 'FAQs'] as const
type Tab = (typeof TABS)[number]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RevnetWidget() {
  const [amount, setAmount] = useState('0.1')
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const rate = 4200
  const eth = parseFloat(amount) || 0
  const receive = Math.round(eth * rate)

  return (
    <div className="w-full max-w-[440px] mx-auto my-9 text-left">
      <div className="bg-[#0A0F3D] border border-[#8A8FBF]/20 rounded-[16px] p-4 shadow-[0_18px_50px_rgba(6,10,42,0.5)]">
        <label className="block font-mono text-[10px] tracking-[1.5px] uppercase text-[#8A8FBF] mb-2 mt-[2px]">
          You pay
        </label>
        <div className="flex items-center gap-2 bg-[#060A2A] border border-[#8A8FBF]/20 rounded-[11px] px-[14px]">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="flex-1 min-w-0 bg-transparent border-none text-[#EDEEFF] font-mono text-[22px] font-bold py-[14px] outline-none tracking-[-0.5px]"
          />
          <span className="font-mono text-[14px] font-bold text-[#B8B6D9]">ETH</span>
        </div>
        <div className="flex items-center justify-between px-1 pt-[14px]">
          <span className="text-[#8A8FBF] text-[13px]">You receive</span>
          <span className="text-[#F897FE] font-extrabold font-mono text-[18px] tracking-[-0.3px]">
            {receive.toLocaleString()} MARKEE
          </span>
        </div>
        <div className="flex items-center mt-[14px] pt-[14px] border-t border-[#8A8FBF]/20">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="bg-transparent border-none cursor-pointer font-mono text-[12px] inline-flex items-center gap-[6px] p-0"
            style={{ color: expanded ? '#F897FE' : '#B8B6D9' }}
          >
            <span className="text-[14px] leading-none">{expanded ? '−' : '+'}</span> Add a message
          </button>
        </div>
        {expanded && (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Set a message with your payment."
            className="w-full mt-3 resize-none bg-[#060A2A] border border-[#8A8FBF]/20 rounded-[11px] px-[14px] py-[11px] text-[#EDEEFF] font-sans text-[14px] outline-none leading-[1.4] box-border"
          />
        )}
        <a
          href="https://revnet.app/base/markee"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full mt-[14px] bg-[#F897FE] text-[#060A2A] rounded-[10px] py-[15px] px-5 font-bold text-[15px] flex items-center justify-center gap-2 no-underline shadow-[0_8px_32px_rgba(248,151,254,0.3)] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px] transition-[transform,box-shadow] duration-[120ms]"
        >
          Buy MARKEE ↗
        </a>
      </div>
    </div>
  )
}

function BigCountdown() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const currentPhaseIndex = getCurrentPhase()
  const currentPhase = PHASES[currentPhaseIndex]

  useEffect(() => {
    function update() {
      const diff = currentPhase.endDate.getTime() - Date.now()
      if (diff > 0) {
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / 1000 / 60) % 60),
          seconds: Math.floor((diff / 1000) % 60),
        })
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [currentPhase.endDate])

  const units = [
    { label: 'Days', value: timeLeft.days },
    { label: 'Hours', value: timeLeft.hours },
    { label: 'Minutes', value: timeLeft.minutes },
    { label: 'Seconds', value: timeLeft.seconds },
  ]

  return (
    <div className="text-center mb-10">
      <p className="text-[#8A8FBF] text-sm mb-5">Next phase change in:</p>
      <div className="flex justify-center gap-4">
        {units.map(({ label, value }) => (
          <div
            key={label}
            className="bg-[#0A0F3D] border border-[#8A8FBF]/20 rounded-xl p-4 min-w-[80px]"
          >
            <div className="text-[#F897FE] font-mono text-3xl font-bold">
              {String(value).padStart(2, '0')}
            </div>
            <div className="text-[#8A8FBF] text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PhasesViz() {
  const currentPhaseIndex = getCurrentPhase()
  const now = new Date()

  return (
    <div className="mb-10">
      <h3 className="text-[#EDEEFF] font-bold text-lg mb-5 text-center">MARKEE Token Issuance Phases</h3>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {PHASES.map((phase, index) => {
          const isPast = now > phase.endDate
          const isCurrent = index === currentPhaseIndex

          return (
            <div
              key={phase.phase}
              className={`relative rounded-xl p-4 border-2 transition-all ${
                isCurrent
                  ? 'border-[#F897FE] bg-[#F897FE]/10 shadow-lg shadow-[#F897FE]/20 scale-105'
                  : isPast
                  ? 'border-[#8A8FBF]/30 bg-[#0A0F3D] opacity-60'
                  : 'border-[#8A8FBF]/30 bg-[#0A0F3D] opacity-50'
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[#F897FE] text-[#060A2A] text-[10px] font-bold px-3 py-1 rounded-full">
                    ACTIVE
                  </span>
                </div>
              )}
              <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${phase.color}`} />
              <div className="text-center">
                <div className={`text-sm font-semibold mb-1 ${isCurrent ? 'text-[#F897FE]' : 'text-[#8A8FBF]'}`}>
                  {phase.label}
                </div>
                <div className={`text-2xl font-bold font-mono mb-1 ${isCurrent ? 'text-[#EDEEFF]' : 'text-[#8A8FBF]'}`}>
                  {phase.rate.toLocaleString()}
                </div>
                <div className="text-xs text-[#8A8FBF]">MARKEE / ETH</div>
                <div className="text-xs text-[#8A8FBF] mt-2">
                  {isPast ? 'Ended' : isCurrent ? 'Ends' : 'Upcoming'}{' '}
                  {phase.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StagesViz() {
  return (
    <div className="mb-10">
      <h3 className="text-[#EDEEFF] font-bold text-lg mb-5 text-center">Issuance Stages</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {STAGES.map((s) => (
          <div
            key={s.n}
            className="bg-[rgba(10,15,61,0.45)] border border-[#8A8FBF]/20 rounded-xl p-6"
          >
            <div
              className="w-1 h-10 rounded-full mb-4"
              style={{ backgroundColor: s.color }}
            />
            <div className="text-[#8A8FBF] text-xs font-mono uppercase tracking-widest mb-1">
              Stage {s.n}
            </div>
            <div className="text-[#EDEEFF] text-2xl font-bold font-mono mb-1">{s.cut}</div>
            <div className="text-[#B8B6D9] text-sm">per phase cut · {s.dur}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IssuanceCurve() {
  // Simple SVG area chart showing the decreasing issuance rate across phases
  const points = PHASES.map((p, i) => ({ x: i, y: p.rate }))
  const maxRate = points[0].y
  const w = 560
  const h = 160
  const pad = { top: 16, right: 20, bottom: 32, left: 52 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const xs = points.map((p) => pad.left + (p.x / (points.length - 1)) * chartW)
  const ys = points.map((p) => pad.top + chartH - (p.y / maxRate) * chartH)

  const linePath = points
    .map((_, i) => `${i === 0 ? 'M' : 'L'}${xs[i]},${ys[i]}`)
    .join(' ')

  const areaPath =
    linePath +
    ` L${xs[xs.length - 1]},${pad.top + chartH} L${xs[0]},${pad.top + chartH} Z`

  return (
    <div className="mb-4">
      <h3 className="text-[#EDEEFF] font-bold text-lg mb-5 text-center">Issuance Curve</h3>
      <div className="bg-[rgba(10,15,61,0.45)] border border-[#8A8FBF]/20 rounded-xl p-6 overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 200 }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad.top + chartH * (1 - t)
            return (
              <g key={t}>
                <line x1={pad.left} y1={y} x2={pad.left + chartW} y2={y} stroke="#8A8FBF" strokeOpacity={0.15} strokeDasharray="4 4" />
                <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#8A8FBF">
                  {Math.round(maxRate * t).toLocaleString()}
                </text>
              </g>
            )
          })}
          {/* X labels */}
          {points.map((_, i) => (
            <text key={i} x={xs[i]} y={h - 6} textAnchor="middle" fontSize={10} fill="#8A8FBF">
              {PHASES[i].label}
            </text>
          ))}
          {/* Area fill */}
          <defs>
            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F897FE" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#F897FE" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#curveGrad)" />
          <path d={linePath} fill="none" stroke="#F897FE" strokeWidth={2} strokeLinejoin="round" />
          {/* Dots */}
          {points.map((_, i) => (
            <circle key={i} cx={xs[i]} cy={ys[i]} r={4} fill="#F897FE" stroke="#060A2A" strokeWidth={2} />
          ))}
        </svg>
      </div>
    </div>
  )
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {FAQS.map((item, i) => (
        <div key={i} className="bg-[rgba(10,15,61,0.45)] border border-[#8A8FBF]/20 rounded-xl overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
          >
            <span className="text-[#EDEEFF] font-semibold text-base">{item.q}</span>
            <span className="text-[#F897FE] text-xl font-mono shrink-0">{open === i ? '−' : '+'}</span>
          </button>
          {open === i && (
            <div className="px-6 pb-5 text-[#B8B6D9] text-sm leading-relaxed border-t border-[#8A8FBF]/20 pt-4">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Owners() {
  const [activeTab, setActiveTab] = useState<Tab>('About MARKEE')

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="own" />

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative py-24 overflow-hidden border-b border-[#8A8FBF]/20">
        <HeroBackground />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2 bg-[rgba(10,15,61,0.6)] border border-[#8A8FBF]/20 rounded-full px-4 py-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_6px_#F897FE]" />
            <span className="font-mono text-[11px] tracking-[2px] uppercase text-[#8A8FBF]">
              Own the Network
            </span>
          </div>

          {/* H1 */}
          <h1 className="text-4xl sm:text-5xl font-bold text-[#EDEEFF] mb-5 leading-tight">
            Become an{' '}
            <span style={{ color: '#F897FE' }}>owner</span>{' '}
            of the Markee network
          </h1>

          {/* Body */}
          <p className="text-lg text-[#B8B6D9] mb-8 max-w-2xl mx-auto">
            Markee is cooperatively owned by MARKEE token holders using{' '}
            <strong className="text-[#EDEEFF]">Revnets</strong> for token issuance and{' '}
            <strong className="text-[#EDEEFF]">Gardens</strong> for governance.
          </p>

          {/* Widget */}
          <RevnetWidget />

          {/* Ghost buttons */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a
              href="https://revnet.app/base/markee"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-transparent border border-[#8A8FBF]/40 text-[#B8B6D9] px-6 py-3 rounded-xl font-semibold text-sm hover:border-[#F897FE]/60 hover:text-[#EDEEFF] transition-colors"
            >
              View Revnet ↗
            </a>
            <a
              href="https://app.gardens.fund/gardens/8453/0xee3027f1e021b09d629922d40436c5dea3c6cb38/0xce6b968c8bd130ca08f1fcc97b509a824380d867"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-transparent border border-[#8A8FBF]/40 text-[#B8B6D9] px-6 py-3 rounded-xl font-semibold text-sm hover:border-[#F897FE]/60 hover:text-[#EDEEFF] transition-colors"
            >
              Govern on Gardens ↗
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Sticky tab bar                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="sticky top-0 z-20 backdrop-blur-md border-b border-[#8A8FBF]/20"
        style={{ backgroundColor: 'rgba(6,10,42,0.92)' }}
      >
        <div className="max-w-[1180px] mx-auto px-6 flex items-center gap-2 py-3 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-[#F897FE] text-[#060A2A]'
                  : 'bg-[rgba(138,143,191,0.12)] text-[#8A8FBF] hover:text-[#B8B6D9]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-[1180px] mx-auto px-10 pt-12 pb-24">

        {/* About MARKEE --------------------------------------------------- */}
        {activeTab === 'About MARKEE' && (
          <div>
            <h2 className="text-[#EDEEFF] text-2xl font-bold mb-8">
              5 things to know about Ownership of the Markee Network
            </h2>
            <div className="space-y-4">
              {ABOUT_POINTS.map((text, i) => (
                <div
                  key={i}
                  className="flex gap-5 bg-[rgba(10,15,61,0.45)] border border-[#8A8FBF]/20 rounded-xl p-6"
                >
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#F897FE] flex items-center justify-center text-[#060A2A] font-bold text-sm">
                    {i + 1}
                  </div>
                  <p className="text-[#B8B6D9] text-base leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Token Issuance Schedule ---------------------------------------- */}
        {activeTab === 'Token Issuance Schedule' && (
          <div>
            <h2 className="text-[#EDEEFF] text-2xl font-bold mb-8 text-center">
              Token Issuance Schedule
            </h2>
            <BigCountdown />
            <PhasesViz />
            <StagesViz />
            <IssuanceCurve />
            <div className="mt-10">
              <h3 className="text-[#EDEEFF] font-bold text-lg mb-6 text-center">Tokenomics Simulator</h3>
              <TokenomicsSimulator />
            </div>
          </div>
        )}

        {/* Founding Team -------------------------------------------------- */}
        {activeTab === 'Founding Team' && (
          <div>
            <h2 className="text-[#EDEEFF] text-2xl font-bold mb-2">The people who launched Markee</h2>
            <p className="text-[#8A8FBF] text-sm mb-8">Founding contributors who built and launched the network.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {TEAM.map((member) => (
                <div
                  key={member.name}
                  className="bg-[rgba(10,15,61,0.45)] border border-[#8A8FBF]/20 rounded-xl p-6 flex flex-col items-center text-center gap-4"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-[#060A2A] text-xl font-bold"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name[0]}
                  </div>
                  <div>
                    <div className="text-[#EDEEFF] font-semibold">{member.name}</div>
                    <div className="text-[#8A8FBF] text-sm">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQs ----------------------------------------------------------- */}
        {activeTab === 'FAQs' && (
          <div>
            <h2 className="text-[#EDEEFF] text-2xl font-bold mb-8">Frequently Asked Questions</h2>
            <FaqAccordion />
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
