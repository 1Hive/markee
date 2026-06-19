'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useEthPrice } from '@/hooks/useEthPrice'

const C = {
  bg: '#060A2A', bg2: '#0A0F3D',
  pink: '#F897FE', blue: '#7C9CFF', green: '#1DB227',
  text: '#EDEEFF', text2: '#B8B6D9', muted: '#8A8FBF',
  border: 'rgba(138,143,191,0.2)', borderHover: 'rgba(248,151,254,0.4)',
}

type PlatformKey = 'openinternet' | 'github' | 'superfluid'

const PLATFORMS = [
  {
    key: 'openinternet' as PlatformKey,
    name: 'Website',
    tagline: 'Any site you own',
    icon: 'globe',
    color: C.pink,
    summary: 'Add a Markee sign to any website you manage with a highly flexible LLM-guided integration.',
    seeUrl: '/marketplace',
  },
  {
    key: 'github' as PlatformKey,
    name: 'GitHub Repo',
    tagline: 'Any markdown file.',
    icon: 'github',
    color: C.text,
    summary: 'Drop a Markee sign into any markdown file in your repo. Perfect for READMEs, docs and skill.md files.',
    seeUrl: '/ecosystem/platforms/github',
  },
  {
    key: 'superfluid' as PlatformKey,
    name: 'Superfluid Project',
    tagline: 'Earn SUP incentives',
    icon: 'zap',
    color: C.green,
    summary: 'Create a Markee sign for your Superfluid project and earn SUP rewards for every message bought.',
    seeUrl: '/ecosystem/platforms/superfluid',
  },
]

function PlatGlyph({ icon, size = 24, color }: { icon: string; size?: number; color: string }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24' as const, fill: 'none' as const, stroke: color, strokeWidth: 1.8 as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (icon === 'globe') return <svg {...s}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  if (icon === 'github') return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
  if (icon === 'zap') return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  return <svg {...s}><path d="M12 5v14M5 12h14"/></svg>
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${C.border}` }}>
      <div className="starfield-bg" />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '80px 40px 64px', textAlign: 'center' as const }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.muted, marginBottom: 20, padding: '6px 14px', background: 'rgba(248,151,254,0.07)', border: `1px solid rgba(248,151,254,0.2)`, borderRadius: 99 }}>
          Raise Funding
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(34px,5.5vw,60px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.04, color: C.text }}>
          Add Markee to your site<br/>and start <span style={{ color: C.pink }}>earning</span>
        </h1>
        <p style={{ margin: '20px auto 0', color: C.text2, fontSize: 18, lineHeight: 1.6, maxWidth: '54ch' }}>
          Connect your audience to our global network of buyers.
        </p>
        <div style={{ marginTop: 32, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <Link href="/create-a-markee" style={{ background: C.pink, color: C.bg, borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 8px 32px rgba(248,151,254,0.3)', display: 'inline-flex', alignItems: 'center' }}>
            Create a Markee →
          </Link>
          <a href="#how" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text2, borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            How it works
          </a>
        </div>
      </div>
    </section>
  )
}

// ── Platform picker ──────────────────────────────────────────────────────────
const MONO = "var(--font-jetbrains-mono)"

type PlatStats = { markees: number; usd: number }

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n}`
}

function PlatformPicker({ stats }: { stats: Record<string, PlatStats> }) {
  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 40px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {PLATFORMS.map(p => (
          <div key={p.key} style={{
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' as const,
            background: 'rgba(10,15,61,0.5)', border: `1px solid ${C.border}`,
            borderRadius: 14, padding: '18px 22px',
          }}
          >
            {/* Icon */}
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PlatGlyph icon={p.icon} color={p.color} size={22} />
            </div>

            {/* Name + tagline */}
            <div style={{ flexShrink: 0, width: 148 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{p.name}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{p.tagline}</div>
            </div>

            {/* Summary */}
            <div style={{ flex: 1, minWidth: 200, color: C.text2, fontSize: 13, lineHeight: 1.55 }}>
              {p.summary}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 24, flexShrink: 0, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ color: C.text, fontWeight: 700, fontFamily: MONO, fontSize: 15 }}>
                  {stats[p.key] != null ? stats[p.key].markees.toLocaleString() : '—'}
                </div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>active signs</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ color: C.blue, fontWeight: 700, fontFamily: MONO, fontSize: 15 }}>
                  {stats[p.key] != null ? fmtUsd(stats[p.key].usd) : '—'}
                </div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>raised</div>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Link href={p.seeUrl}
                style={{
                  background: 'transparent', color: C.text2, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none', whiteSpace: 'nowrap' as const,
                  display: 'inline-flex', alignItems: 'center',
                  transition: 'border-color 140ms, color 140ms',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.borderHover; el.style.color = C.text }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.color = C.text2 }}
              >
                Learn More
              </Link>
              <Link href={`/create-a-markee?platform=${p.key}`} style={{
                background: C.pink, color: C.bg, border: 'none',
                borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700,
                textDecoration: 'none', whiteSpace: 'nowrap' as const,
                display: 'inline-flex', alignItems: 'center',
                boxShadow: '0 4px 16px rgba(248,151,254,0.3)',
              }}>
                Create →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '01', t: 'Choose your platform', d: 'Pick where your Markee will be embedded.' },
    { n: '02', t: 'Set up your sign', d: 'Add your info and a wallet to receive funds.' },
    { n: '03', t: 'Activate your Markee', d: 'Embed to your site in just a few clicks.' },
  ]
  return (
    <section id="how" style={{ borderTop: `1px solid ${C.border}`, background: C.bg2 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 40px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, color: C.pink, marginBottom: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: C.pink, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
          How it works
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(26px,3.6vw,38px)', fontWeight: 800, letterSpacing: -0.8, color: C.text }}>Embed a paid message to any digital space</h2>
        <p style={{ margin: 0, color: C.text2, fontSize: 16, lineHeight: 1.6, maxWidth: '60ch' }}>
          Cross-platform, non-intrusive, and kinda fun for people to see.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, margin: '34px 0 36px' }}>
          {steps.map(s => (
            <div key={s.n} style={{ background: 'rgba(6,10,42,0.5)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px' }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color: C.pink, fontWeight: 700, marginBottom: 10 }}>{s.n}</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{s.t}</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{s.d}</div>
            </div>
          ))}
        </div>
        <Link href="/create-a-markee" style={{ background: C.pink, color: C.bg, borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 8px 32px rgba(248,151,254,0.3)', display: 'inline-flex', alignItems: 'center' }}>
          Create a Markee →
        </Link>
      </div>
    </section>
  )
}

// ── Integration form ──────────────────────────────────────────────────────────
function IntegrateForm() {
  const [form, setForm] = useState({ platform: '', name: '', email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.platform.trim() && form.email.trim()

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY,
          subject: `Markee integration: ${form.platform}`,
          from_name: form.name || 'Markee site',
          platform: form.platform,
          name: form.name,
          email: form.email,
        }),
      })
    } catch {}
    setSubmitting(false)
    setSent(true)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: '12px 14px', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11,
    letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8,
  }

  return (
    <section id="integrate" style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 40px 90px' }} className="integrate-grid">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 48, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, color: C.pink, marginBottom: 18 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: C.pink, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
              For platforms
            </div>
            <h2 style={{ margin: 0, fontSize: 'clamp(26px,3.6vw,38px)', fontWeight: 800, letterSpacing: -0.8, color: C.text }}>Looking for a deeper integration?</h2>
            <p style={{ margin: '16px 0 0', color: C.text2, fontSize: 16, lineHeight: 1.65, maxWidth: '46ch' }}>
              We'll work with you 1-on-1 to build embeddable messages your platform's users will love.
            </p>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              {[
                'Give your users an easy way to raise funds',
                "Earn fees on all your platform's Markees",
                'Drive engagement and make it fun for people to come back!',
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.text2, fontSize: 14 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: C.blue, boxShadow: `0 0 6px ${C.blue}`, flexShrink: 0, display: 'inline-block' }} />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
            {sent ? (
              <div style={{ textAlign: 'center' as const, padding: '28px 8px' }}>
                <div style={{ width: 52, height: 52, borderRadius: 99, background: 'rgba(29,178,39,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <span style={{ color: C.green, fontSize: 26 }}>✓</span>
                </div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 18 }}>Thanks - we'll be in touch.</div>
                <p style={{ color: C.muted, fontSize: 14, margin: '8px 0 0' }}>Our partnerships team will reach out to <span style={{ color: C.text2 }}>{form.email}</span> shortly.</p>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', marginBottom: 16 }}>
                  <span style={labelStyle}>Website / Platform Name *</span>
                  <input value={form.platform} onChange={e => set('platform', e.target.value)} placeholder="Acme Protocol" style={inputStyle} />
                </label>
                <label style={{ display: 'block', marginBottom: 16 }}>
                  <span style={labelStyle}>Your name</span>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jordan" style={inputStyle} />
                </label>
                <label style={{ display: 'block', marginBottom: 20 }}>
                  <span style={labelStyle}>Email *</span>
                  <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@acme.xyz" type="email" style={inputStyle} />
                </label>
                <button
                  onClick={submit}
                  disabled={!valid || submitting}
                  style={{
                    width: '100%', background: valid && !submitting ? C.pink : C.bg2,
                    color: valid && !submitting ? C.bg : C.muted,
                    border: valid && !submitting ? 'none' : `1px solid ${C.border}`,
                    borderRadius: 8, padding: '13px 0', fontSize: 14, fontWeight: 700,
                    cursor: valid && !submitting ? 'pointer' : 'default',
                    boxShadow: valid && !submitting ? '0 8px 24px rgba(248,151,254,0.3)' : 'none',
                    transition: 'background 160ms',
                  }}
                >
                  {submitting ? 'Sending…' : 'Send integration request →'}
                </button>
                <p style={{ margin: '14px 0 0', textAlign: 'center' as const, color: C.muted, fontSize: 13 }}>
                  Or email us at <a href="mailto:hello@markee.xyz" style={{ color: C.pink, textDecoration: 'none', borderBottom: `1px dotted ${C.pink}` }}>hello@markee.xyz</a>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function RaiseFunding() {
  const ethPrice = useEthPrice()
  const [platStats, setPlatStats] = useState<Record<string, PlatStats>>({})

  useEffect(() => {
    fetch('/api/ecosystem/leaderboards', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !ethPrice) return
        const acc: Record<string, { markees: number; eth: number }> = {
          openinternet: { markees: 0, eth: 0 },
          github:       { markees: 0, eth: 0 },
          superfluid:   { markees: 0, eth: 0 },
        }
        for (const lb of data.leaderboards ?? []) {
          if (lb.gamed) continue
          const key = lb.platform === 'website' ? 'openinternet' : lb.platform
          if (!acc[key] || lb.markeeCount < 1) continue
          acc[key].markees++
          acc[key].eth += parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
        }
        setPlatStats({
          openinternet: { markees: acc.openinternet.markees, usd: Math.round(acc.openinternet.eth * ethPrice) },
          github:       { markees: acc.github.markees,       usd: Math.round(acc.github.eth * ethPrice) },
          superfluid:   { markees: acc.superfluid.markees,   usd: Math.round(acc.superfluid.eth * ethPrice) },
        })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ethPrice])

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header activePage="raise" useRegularLinks />
      <Hero />
      <PlatformPicker stats={platStats} />
      <HowItWorks />
      <IntegrateForm />
      <Footer />
    </div>
  )
}
