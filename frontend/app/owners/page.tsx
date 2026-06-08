'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { V13_LEADERBOARDS } from '@/lib/contracts/addresses'

// ---------------------------------------------------------------------------
// Phase / stage data
// ---------------------------------------------------------------------------

const SEASON_MS = 91.31 * 24 * 60 * 60 * 1000
const SCHEDULE_START = new Date('2025-12-21T00:00:00Z')

interface Phase { idx: number; stage: number; rate: number; start: Date; end: Date }

function buildPhases(): Phase[] {
  const rules = [{ stage: 1, cut: 0.5, seasons: 4 }, { stage: 2, cut: 0.2, seasons: 8 }, { stage: 3, cut: 0.1, seasons: 6 }]
  const out: Phase[] = []
  let rate = 100000
  let idx = 0
  rules.forEach((r) => {
    for (let i = 0; i < r.seasons; i++) {
      out.push({ idx, stage: r.stage, rate: Math.round(rate), start: new Date(SCHEDULE_START.getTime() + idx * SEASON_MS), end: new Date(SCHEDULE_START.getTime() + (idx + 1) * SEASON_MS) })
      rate = rate * (1 - r.cut)
      idx++
    }
  })
  return out
}

const PHASES = buildPhases()

function currentPhaseIdx() {
  const now = Date.now()
  for (let i = 0; i < PHASES.length; i++) if (now < PHASES[i].end.getTime()) return i
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

const TABS = [
  { key: 'how', label: 'About MARKEE' },
  { key: 'schedule', label: 'Token Issuance Schedule' },
  { key: 'team', label: 'Founding Team' },
  { key: 'faqs', label: 'FAQs' },
] as const
type TabKey = (typeof TABS)[number]['key']


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const MAX_MSG = 280

function RevnetWidget({ onBuy }: { onBuy: (amount: string, message: string) => void }) {
  const [amount, setAmount] = useState('0.1')
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const rate = 4200
  const eth = parseFloat(amount) || 0
  const receive = Math.round(eth * rate)
  const defaultMessage = `bought ${receive.toLocaleString()} MARKEE tokens`

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
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MSG))}
              rows={2}
              maxLength={MAX_MSG}
              placeholder="tell the world what you have to say..."
              className="w-full mt-3 resize-none bg-[#060A2A] border border-[#8A8FBF]/20 rounded-[11px] px-[14px] py-[11px] text-[#EDEEFF] font-sans text-[14px] outline-none leading-[1.4] box-border"
            />
            <div className="text-right mt-1 text-[11px]" style={{ color: message.length >= MAX_MSG - 20 ? '#F897FE' : '#8A8FBF' }}>
              {message.length}/{MAX_MSG}
            </div>
          </>
        )}
        <button
          onClick={() => onBuy(amount, message.trim() || defaultMessage)}
          className="w-full mt-[14px] bg-[#F897FE] text-[#060A2A] border-none rounded-[10px] py-[15px] px-5 font-bold text-[15px] cursor-pointer flex items-center justify-center gap-2 shadow-[0_8px_32px_rgba(248,151,254,0.3)] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px] transition-[transform,box-shadow] duration-[120ms]"
        >
          Connect wallet to buy
        </button>
      </div>
    </div>
  )
}

function BigCountdown() {
  const phase = PHASES[currentPhaseIdx()]
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0 })

  useEffect(() => {
    const tick = () => {
      const diff = phase.end.getTime() - Date.now()
      if (diff > 0) setT({ d: Math.floor(diff / 864e5), h: Math.floor((diff / 36e5) % 24), m: Math.floor((diff / 6e4) % 60), s: Math.floor((diff / 1e3) % 60) })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase.end])

  const cells: [string, number][] = [['Days', t.d], ['Hours', t.h], ['Minutes', t.m], ['Seconds', t.s]]

  return (
    <div style={{ textAlign: 'center', marginBottom: 36 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: '#8A8FBF', marginBottom: 16 }}>Next price increase in</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {cells.map(([label, v]) => (
          <div key={label} style={{ background: '#0A0F3D', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 12, padding: '16px 18px', minWidth: 84 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#F897FE', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 12, color: '#8A8FBF', marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PhasesViz() {
  const cur = currentPhaseIdx()
  const shown = PHASES.slice(0, 5)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })

  return (
    <div style={{ background: '#0A0F3D', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 16, padding: 26, marginBottom: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#EDEEFF' }}>Phases</h3>
        <p style={{ margin: '4px 0 0', color: '#8A8FBF', fontSize: 13 }}>MARKEE is issued at pre-scheduled prices that increase every season.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {shown.map((p) => {
          const isCur = p.idx === cur, past = p.idx < cur
          return (
            <div key={p.idx} style={{ position: 'relative', borderRadius: 12, padding: '18px 14px', textAlign: 'center', border: `1px solid ${isCur ? '#F897FE' : 'rgba(138,143,191,0.2)'}`, background: isCur ? 'rgba(248,151,254,0.08)' : '#060A2A', opacity: past ? 0.5 : 1 }}>
              {isCur && <span style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#F897FE', color: '#060A2A', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99 }}>ACTIVE</span>}
              <div style={{ fontSize: 12, fontWeight: 600, color: isCur ? '#F897FE' : '#8A8FBF', marginBottom: 6 }}>Phase {p.idx} · S{p.stage}</div>
              <div style={{ fontSize: 21, fontWeight: 800, color: isCur ? '#EDEEFF' : '#B8B6D9', fontFamily: "'JetBrains Mono', monospace" }}>{p.rate.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#8A8FBF', marginTop: 2 }}>MARKEE / ETH</div>
              <div style={{ fontSize: 11, color: '#8A8FBF', marginTop: 8 }}>{past ? 'Ended' : isCur ? 'Ends' : 'From'} {fmtDate(p.end)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StagesViz() {
  const stages = [
    { n: 1, cut: '−50%', dur: '1 year', color: '#F897FE' },
    { n: 2, cut: '−20%', dur: '2 years', color: '#7B6AF4' },
    { n: 3, cut: '−10%', dur: 'forever', color: '#7C9CFF' },
  ]
  return (
    <div style={{ background: '#060A2A', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 16, padding: 26 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#EDEEFF' }}>Stages</h3>
      <p style={{ margin: '0 0 22px', color: '#8A8FBF', fontSize: 13 }}>Seasonal price increases slow down in Stages.</p>
      {/* timeline bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 10, borderRadius: 6, background: '#F897FE' }} />
        <div style={{ flex: 2, height: 10, borderRadius: 6, background: '#7B6AF4' }} />
        <div style={{ flex: 2, height: 10, borderRadius: 6, background: 'linear-gradient(90deg, #7C9CFF, rgba(124,156,255,0.08))' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: '#8A8FBF' }}>
        <span style={{ flex: 1 }}>1 yr</span><span style={{ flex: 2 }}>2 yrs</span><span style={{ flex: 2 }}>forever →</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {stages.map((s) => (
          <div key={s.n} style={{ background: '#0A0F3D', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 14, padding: '20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: s.color, fontWeight: 700 }}>Stage {s.n}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8A8FBF' }}>{s.dur}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#EDEEFF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1 }}>
              {s.cut}<span style={{ fontSize: 14, color: '#8A8FBF', fontWeight: 600, letterSpacing: 0 }}> / season</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IssuanceCurve() {
  const series = PHASES.slice(0, 14)
  const max = series[0].rate
  const pts = series.map((p, i) => ({ x: (i / (series.length - 1)) * 96, y: 96 - (p.rate / max) * 88 + 2 }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L 96 98 L 0 98 Z`
  const last = pts[pts.length - 1]

  return (
    <div style={{ marginTop: 26, borderTop: '1px solid rgba(138,143,191,0.2)', paddingTop: 22 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 180 }}>
        <defs>
          <linearGradient id="iss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(248,151,254,0.4)" />
            <stop offset="100%" stopColor="rgba(248,151,254,0)" />
          </linearGradient>
        </defs>
        {[24, 48, 72].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(138,143,191,0.15)" strokeWidth="0.4" />)}
        <path d={area} fill="url(#iss)" />
        <path d={path} fill="none" stroke="#F897FE" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <path d={`M ${last.x} ${last.y} L 100 ${(last.y + 98) / 2}`} fill="none" stroke="#F897FE" strokeWidth="1.2" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity="0.6" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8A8FBF' }}>
        <span>Phase 0</span><span>→ forever</span>
      </div>
    </div>
  )
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
      {FAQS.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={i} style={{ border: '1px solid rgba(138,143,191,0.2)', borderRadius: 12, background: isOpen ? 'rgba(10,15,61,0.5)' : 'transparent', overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: '#EDEEFF', fontSize: 16, fontWeight: 600 }}
            >
              {item.q}
              <span style={{ color: '#F897FE', fontSize: 20, lineHeight: 1, flexShrink: 0, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 160ms', display: 'inline-block' }}>+</span>
            </button>
            {isOpen && (
              <p style={{ margin: 0, padding: '0 20px 20px', color: '#B8B6D9', fontSize: 15, lineHeight: 1.65 }}>{item.a}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Owners() {
  const [activeTab, setActiveTab] = useState<TabKey>('how')
  const [revnetModalOpen, setRevnetModalOpen] = useState(false)
  const [revnetInitialAmount, setRevnetInitialAmount] = useState('0.1')
  const [revnetInitialMessage, setRevnetInitialMessage] = useState('')

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="own" />

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative py-24 overflow-hidden border-b border-[#8A8FBF]/20">
        <HeroBackground />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-5">
            <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0" />
            Own the Network
          </div>

          {/* H1 */}
          <h1 className="text-5xl sm:text-6xl font-bold text-[#EDEEFF] mb-5 leading-[1.05]">
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
          <RevnetWidget onBuy={(amt, msg) => { setRevnetInitialAmount(amt); setRevnetInitialMessage(msg); setRevnetModalOpen(true) }} />

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
        <div className="max-w-[1180px] mx-auto px-6 flex items-center gap-2 py-[14px] overflow-x-auto">
          {TABS.map((tab) => {
            const on = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  cursor: 'pointer', padding: '9px 18px', whiteSpace: 'nowrap', borderRadius: 999, flexShrink: 0,
                  fontSize: 13.5, fontWeight: on ? 700 : 600,
                  background: on ? '#F897FE' : 'rgba(10,15,61,0.6)', color: on ? '#060A2A' : '#B8B6D9',
                  border: `1px solid ${on ? '#F897FE' : 'rgba(138,143,191,0.2)'}`,
                  transition: 'background 140ms, color 140ms, border-color 140ms',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-[1180px] mx-auto px-10 pt-12 pb-24">

        {/* About MARKEE --------------------------------------------------- */}
        {activeTab === 'how' && (
          <div>
            <div style={{ maxWidth: 720, marginBottom: 32 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, letterSpacing: -0.8, color: '#EDEEFF' }}>5 things to know about Ownership of the Markee Network</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
              {ABOUT_POINTS.map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', background: 'rgba(10,15,61,0.45)', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 99, background: 'rgba(248,151,254,0.12)', border: '1px solid #F897FE', color: '#F897FE', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                  <p style={{ margin: 0, color: '#B8B6D9', fontSize: 15.5, lineHeight: 1.6 }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Token Issuance Schedule ---------------------------------------- */}
        {activeTab === 'schedule' && (
          <div>
            <BigCountdown />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <PhasesViz />
              <StagesViz />
            </div>
          </div>
        )}

        {/* Founding Team -------------------------------------------------- */}
        {activeTab === 'team' && (
          <div>
            <div style={{ maxWidth: 720, marginBottom: 32 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, letterSpacing: -0.8, color: '#EDEEFF' }}>The people who launched Markee</h2>
              <p style={{ margin: '10px 0 0', color: '#B8B6D9', fontSize: 15, lineHeight: 1.6 }}>The founding team received a one-time 10M MARKEE allocation at launch — owners alongside everyone else.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, maxWidth: 820 }}>
              {TEAM.map((member) => (
                <div key={member.name} style={{ background: 'rgba(10,15,61,0.45)', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 14, padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 99, flexShrink: 0, background: `${member.color}22`, color: member.color, border: `1px solid ${member.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18 }}>{member.name[0]}</div>
                  <div>
                    <div style={{ color: '#EDEEFF', fontWeight: 700, fontSize: 16 }}>{member.name}</div>
                    <div style={{ color: '#8A8FBF', fontSize: 13, marginTop: 2 }}>{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQs ----------------------------------------------------------- */}
        {activeTab === 'faqs' && (
          <div>
            <div style={{ maxWidth: 720, marginBottom: 32 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, letterSpacing: -0.8, color: '#EDEEFF' }}>Questions, answered</h2>
            </div>
            <FaqAccordion />
          </div>
        )}
      </div>

      <Footer />

      <TopDawgModal
        isOpen={revnetModalOpen}
        onClose={() => setRevnetModalOpen(false)}
        initialMode="create"
        strategyAddress={V13_LEADERBOARDS.COOPERATIVE}
        initialAmount={revnetInitialAmount}
        initialMessage={revnetInitialMessage}
        onSuccess={() => setRevnetModalOpen(false)}
      />
    </div>
  )
}
