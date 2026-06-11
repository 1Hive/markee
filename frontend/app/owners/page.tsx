'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

const C = {
  bg: '#060A2A', bg2: '#0A0F3D',
  pink: '#F897FE', blue: '#7C9CFF', purp: '#7B6AF4', green: '#1DB227',
  text: '#EDEEFF', text2: '#B8B6D9', muted: '#8A8FBF',
  border: 'rgba(138,143,191,0.2)', borderHover: 'rgba(248,151,254,0.4)',
}

const GARDENS_URL = 'https://app.gardens.fund/gardens/8453/0xce6b968c8bd130ca08f1fcc97b509a824380d867'
const REVNET_URL = 'https://revnet.app/base/markee'
const GROWTH_FUND_URL = GARDENS_URL

// ── Issuance schedule ─────────────────────────────────────────────────────────
const SEASON_MS = 91.31 * 24 * 60 * 60 * 1000
const SCHEDULE_START = new Date('2025-12-21T00:00:00Z')

function buildPhases() {
  const rules = [
    { stage: 1, cut: 0.5, seasons: 4 },
    { stage: 2, cut: 0.2, seasons: 8 },
    { stage: 3, cut: 0.1, seasons: 6 },
  ]
  const out: { idx: number; stage: number; rate: number; start: Date; end: Date }[] = []
  let rate = 100000, idx = 0
  rules.forEach(r => {
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

// ── Revnet buy widget ──────────────────────────────────────────────────────────
function RevnetWidget() {
  const [amount, setAmount] = useState('0.1')
  const phase = PHASES[currentPhaseIdx()]
  const eth = parseFloat(amount) || 0
  const receive = Math.round(eth * phase.rate)
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')

  return (
    <div style={{ width: 'min(440px, 100%)', margin: '36px auto 22px', textAlign: 'left' as const }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, boxShadow: '0 18px 50px rgba(6,10,42,0.5)' }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, margin: '2px 0 8px 2px' }}>
          You pay
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 11, padding: '0 14px' }}>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            aria-label="ETH amount"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: C.text, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 22, fontWeight: 700, padding: '14px 0', outline: 'none', letterSpacing: -0.5 }}
          />
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 14, fontWeight: 700, color: C.text2 }}>ETH</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px 0' }}>
          <span style={{ color: C.muted, fontSize: 13 }}>You receive</span>
          <span style={{ color: C.pink, fontWeight: 800, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 18, letterSpacing: -0.3 }}>{receive.toLocaleString()} MARKEE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'transparent', border: 'none', color: expanded ? C.pink : C.text2, cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}
          >
            <span style={{ fontSize: 14, lineHeight: '1' }}>{expanded ? '−' : '+'}</span> Add a message
          </button>
        </div>
        {expanded && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              placeholder="Set a message with your payment."
              style={{ width: '100%', boxSizing: 'border-box', resize: 'none', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 14px', color: C.text, fontSize: 14, outline: 'none', lineHeight: 1.4 }}
            />
            <p style={{ margin: '8px 2px 0', fontSize: 12, lineHeight: 1.45, color: C.muted }}>
              Your message will be shown on the{' '}
              <Link href="/markee/0x" style={{ color: C.pink, textDecoration: 'none', borderBottom: `1px dotted ${C.pink}` }}>Markee Cooperative Leaderboard</Link>
            </p>
          </div>
        )}
        <a
          href={REVNET_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', marginTop: 14, background: C.pink, color: C.bg, border: 'none', borderRadius: 10,
            padding: '15px 20px', fontWeight: 700, fontSize: 15, textDecoration: 'none',
            boxShadow: '0 8px 32px rgba(248,151,254,0.3)',
            transition: 'box-shadow 120ms',
          }}
        >
          Buy MARKEE
        </a>
      </div>
    </div>
  )
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function BigCountdown() {
  const phase = PHASES[currentPhaseIdx()]
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0 })
  useEffect(() => {
    const tick = () => {
      const diff = phase.end.getTime() - Date.now()
      if (diff > 0) setT({ d: Math.floor(diff / 864e5), h: Math.floor((diff / 36e5) % 24), m: Math.floor((diff / 6e4) % 60), s: Math.floor((diff / 1e3) % 60) })
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [phase.end])
  const cells: [string, number][] = [['Days', t.d], ['Hours', t.h], ['Minutes', t.m], ['Seconds', t.s]]
  return (
    <div style={{ textAlign: 'center' as const, marginBottom: 36 }}>
      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, marginBottom: 16 }}>Next price increase in</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' as const }}>
        {cells.map(([label, v]) => (
          <div key={label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', minWidth: 84 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.pink, fontFamily: 'var(--font-jetbrains-mono)', lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Phases card ───────────────────────────────────────────────────────────────
function PhasesViz() {
  const cur = currentPhaseIdx()
  const shown = PHASES.slice(0, 5)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Phases</h3>
        <p style={{ margin: '4px 0 0', color: C.muted, fontSize: 13 }}>MARKEE is issued at pre-scheduled prices that increase every season.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {shown.map(p => {
          const isCur = p.idx === cur, past = p.idx < cur
          return (
            <div key={p.idx} style={{ position: 'relative', borderRadius: 12, padding: '18px 14px', textAlign: 'center' as const, border: `1px solid ${isCur ? C.pink : C.border}`, background: isCur ? 'rgba(248,151,254,0.08)' : C.bg, opacity: past ? 0.5 : 1 }}>
              {isCur && <span style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: C.pink, color: C.bg, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99 }}>ACTIVE</span>}
              <div style={{ fontSize: 12, fontWeight: 600, color: isCur ? C.pink : C.muted, marginBottom: 6 }}>Phase {p.idx} · S{p.stage}</div>
              <div style={{ fontSize: 21, fontWeight: 800, color: isCur ? C.text : C.text2, fontFamily: 'var(--font-jetbrains-mono)' }}>{p.rate.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>MARKEE / ETH</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{past ? 'Ended' : isCur ? 'Ends' : 'From'} {fmtDate(p.end)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stages card ───────────────────────────────────────────────────────────────
function StagesViz() {
  const stages = [
    { n: 1, cut: '-50%', dur: '1 year', color: C.pink },
    { n: 2, cut: '-20%', dur: '2 years', color: C.purp },
    { n: 3, cut: '-10%', dur: 'forever', color: C.blue },
  ]
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: C.text }}>Stages</h3>
      <p style={{ margin: '0 0 22px', color: C.muted, fontSize: 13 }}>Seasonal price increases slow down in Stages.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 10, borderRadius: 6, background: C.pink }} />
        <div style={{ flex: 2, height: 10, borderRadius: 6, background: C.purp }} />
        <div style={{ flex: 2, height: 10, borderRadius: 6, background: `linear-gradient(90deg, ${C.blue}, rgba(124,156,255,0.08))` }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10.5, color: C.muted }}>
        <span style={{ flex: 1 }}>1 yr</span><span style={{ flex: 2 }}>2 yrs</span><span style={{ flex: 2 }}>forever →</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {stages.map(s => (
          <div key={s.n} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' as const, color: s.color, fontWeight: 700 }}>Stage {s.n}</span>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: C.muted }}>{s.dur}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.text, fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: -1 }}>{s.cut}<span style={{ fontSize: 14, color: C.muted, fontWeight: 600, letterSpacing: 0 }}> / season</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: About MARKEE ─────────────────────────────────────────────────────────
function AboutMarkee({ setTab }: { setTab: (t: string) => void }) {
  const points = [
    <>Markee is a digital-native cooperative. All network assets, including revenue, smart contracts, frontends, branding, and treasury backing, are owned and governed by MARKEE token holders and bound by a <a href={GARDENS_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.pink, textDecoration: 'none', borderBottom: `1px dotted ${C.pink}` }}>Covenant</a>.</>,
    <><span>All platform revenue is received by the Markee Revnet, issuing MARKEE at the current </span><button onClick={() => setTab('schedule')} style={{ background: 'none', border: 'none', padding: 0, color: C.pink, cursor: 'pointer', font: 'inherit', borderBottom: `1px dotted ${C.pink}` }}>scheduled price</button><span>, with a <strong style={{ color: C.text }}>38% community reserve</strong> distributed to network participants.</span></>,
    <>A one-time auto-issuance of <strong style={{ color: C.text }}>40M MARKEE</strong> was allocated at launch to the <a href={GROWTH_FUND_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.pink, textDecoration: 'none', borderBottom: `1px dotted ${C.pink}` }}>Markee Growth Fund</a>.</>,
    <>A one-time auto-issuance of <strong style={{ color: C.text }}>10M MARKEE</strong> was allocated to the Founding Team at launch.</>,
    <>Token issuance terms are <strong style={{ color: C.text }}>immutable and locked forever</strong>.</>,
  ]
  return (
    <div>
      <div style={{ maxWidth: 720, marginBottom: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, marginBottom: 14, padding: '6px 14px', background: 'rgba(248,151,254,0.07)', border: `1px solid rgba(248,151,254,0.2)`, borderRadius: 99 }}>
          About MARKEE
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(24px,3.2vw,34px)', fontWeight: 800, letterSpacing: -0.8, color: C.text }}>5 things to know about Ownership of the Markee Network</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14, maxWidth: 760 }}>
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', background: 'rgba(10,15,61,0.45)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 99, background: 'rgba(248,151,254,0.12)', border: `1px solid ${C.pink}`, color: C.pink, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            <p style={{ margin: 0, color: C.text2, fontSize: 15.5, lineHeight: 1.6 }}>{p}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Token Issuance Schedule ──────────────────────────────────────────────
function IssuanceSchedule() {
  return (
    <div>
      <BigCountdown />
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>
        <PhasesViz />
        <StagesViz />
      </div>
    </div>
  )
}

// ── Tab: Founding Team ────────────────────────────────────────────────────────
function FoundingTeam() {
  const team = [
    { name: 'Paul', role: 'Founder', color: C.pink },
    { name: 'Jango', role: 'Revnets Lead', color: C.purp },
    { name: 'Gossman', role: 'Engineer', color: C.blue },
    { name: 'Stefano', role: 'Engineer', color: C.blue },
    { name: 'Mati', role: 'Growth', color: C.green },
    { name: 'Rohek', role: 'Growth', color: C.green },
  ]
  return (
    <div>
      <div style={{ maxWidth: 720, marginBottom: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, marginBottom: 14, padding: '6px 14px', background: 'rgba(124,156,255,0.07)', border: `1px solid rgba(124,156,255,0.2)`, borderRadius: 99 }}>
          Founding team
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(24px,3.2vw,34px)', fontWeight: 800, letterSpacing: -0.8, color: C.text }}>The people who launched Markee</h2>
        <p style={{ margin: 0, color: C.text2, fontSize: 16, lineHeight: 1.6 }}>The founding team received a one-time 10M MARKEE allocation at launch - owners alongside everyone else.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, maxWidth: 820 }}>
        {team.map(m => (
          <div key={m.name} style={{ background: 'rgba(10,15,61,0.45)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 99, flexShrink: 0, background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700, fontSize: 18 }}>{m.name[0]}</div>
            <div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{m.name}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{m.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: FAQs ─────────────────────────────────────────────────────────────────
function FAQs({ setTab }: { setTab: (t: string) => void }) {
  const [open, setOpen] = useState<number>(0)
  const faqs = [
    { q: 'What is the Markee Cooperative?', a: <>It's the digital-native organization that owns and operates Markee. There's no company behind it - the network is collectively owned by everyone holding MARKEE and governed onchain, bound by the <button onClick={() => setTab('how')} style={{ background: 'none', border: 'none', padding: 0, color: C.pink, cursor: 'pointer', font: 'inherit', borderBottom: `1px dotted ${C.pink}` }}>Covenant</button>.</> },
    { q: 'What do MARKEE holders own?', a: 'Everything the network is made of: protocol revenue, the smart contracts, the frontends, the brand, and the treasury backing the token. Ownership is proportional to your MARKEE, enforced onchain.' },
    { q: 'What is Revnets?', a: <>Revnets is the onchain mechanism that receives all platform revenue and issues MARKEE at a fixed, decreasing schedule with a 38% community reserve. The rules are immutable. <a href={REVNET_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.pink, textDecoration: 'none', borderBottom: `1px dotted ${C.pink}` }}>View the Markee Revnet ↗</a></> },
    { q: 'What is Gardens?', a: <>Gardens is where governance happens. MARKEE holders propose and vote on decisions using conviction voting; proposals that reach the threshold execute automatically. <a href={GARDENS_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.pink, textDecoration: 'none', borderBottom: `1px dotted ${C.pink}` }}>Open the Markee garden ↗</a></> },
    { q: 'Is Markee open source?', a: 'Yes. The contracts and frontends are open source and owned by the cooperative - anyone can read, fork, and build on them.' },
    { q: 'How do I become an owner?', a: 'Buy MARKEE with the widget at the top of this page, or earn it by participating in the network. Holding MARKEE makes you an owner with a vote in governance.' },
  ]
  return (
    <div>
      <div style={{ maxWidth: 720, marginBottom: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, marginBottom: 14, padding: '6px 14px', background: 'rgba(124,156,255,0.07)', border: `1px solid rgba(124,156,255,0.2)`, borderRadius: 99 }}>
          FAQs
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(24px,3.2vw,34px)', fontWeight: 800, letterSpacing: -0.8, color: C.text }}>Questions, answered</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, maxWidth: 760 }}>
        {faqs.map((f, i) => (
          <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: open === i ? 'rgba(10,15,61,0.5)' : 'transparent', overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              style={{ width: '100%', textAlign: 'left' as const, background: 'transparent', border: 'none', cursor: 'pointer', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: C.text, fontSize: 16, fontWeight: 600 }}
            >
              {f.q}
              <span style={{ color: C.pink, fontSize: 20, lineHeight: '1', transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 160ms', flexShrink: 0 }}>+</span>
            </button>
            {open === i && <p style={{ margin: 0, padding: '0 20px 20px', color: C.text2, fontSize: 15, lineHeight: 1.65 }}>{f.a}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'how', label: 'About MARKEE' },
  { key: 'schedule', label: 'Token Issuance Schedule' },
  { key: 'team', label: 'Founding Team' },
  { key: 'faqs', label: 'FAQs' },
]

export default function Owners() {
  const [tab, setTab] = useState('how')

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header activePage="own" useRegularLinks />
      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${C.border}`, background: 'linear-gradient(180deg, rgba(123,106,244,0.10), rgba(6,10,42,0))' }}>
        <div className="starfield-bg" />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', padding: '80px 40px 64px', textAlign: 'center' as const }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, marginBottom: 20, padding: '6px 14px', background: 'rgba(248,151,254,0.07)', border: `1px solid rgba(248,151,254,0.2)`, borderRadius: 99 }}>
            Own the Network
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(34px,5vw,56px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, color: C.text }}>
            Become an <span style={{ color: C.pink }}>owner</span> of the Markee network
          </h1>
          <p style={{ margin: '20px auto 0', color: C.text2, fontSize: 18, lineHeight: 1.6, maxWidth: '52ch' }}>
            Markee is cooperatively owned by MARKEE token holders using <strong style={{ color: C.text }}>Revnets</strong> for token issuance and <strong style={{ color: C.text }}>Gardens</strong> for governance.
          </p>
          <RevnetWidget />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href={REVNET_URL} target="_blank" rel="noopener noreferrer" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', transition: 'border-color 160ms, color 160ms' }}>
              View Revnet ↗
            </a>
            <a href={GARDENS_URL} target="_blank" rel="noopener noreferrer" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', transition: 'border-color 160ms, color 160ms' }}>
              Govern on Gardens ↗
            </a>
          </div>
        </div>
      </section>

      {/* Sticky pill tabs */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(6,10,42,0.92)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 20px', display: 'flex', gap: 8, overflowX: 'auto' as const }}>
          {TABS.map(t => {
            const on = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  cursor: 'pointer', padding: '9px 18px', whiteSpace: 'nowrap' as const, borderRadius: 999,
                  fontSize: 13.5, fontWeight: on ? 700 : 600, background: on ? C.pink : 'rgba(10,15,61,0.6)',
                  color: on ? C.bg : C.text2, border: `1px solid ${on ? C.pink : C.border}`,
                  transition: 'background 140ms, color 140ms, border-color 140ms',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 40px 96px' }}>
        {tab === 'how' && <AboutMarkee setTab={setTab} />}
        {tab === 'schedule' && <IssuanceSchedule />}
        {tab === 'team' && <FoundingTeam />}
        {tab === 'faqs' && <FAQs setTab={setTab} />}
      </section>
      <Footer />
    </div>
  )
}
