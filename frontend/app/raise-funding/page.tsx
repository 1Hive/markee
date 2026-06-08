'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Globe2, Github, Zap, CheckCircle } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

type PlatformKey = 'website' | 'github' | 'superfluid'

interface Platform {
  key: PlatformKey
  name: string
  tagline: string
  summary: string
  icon: React.ReactNode
  color: string
  href: string
}

const PLATFORMS: Platform[] = [
  {
    key: 'website',
    name: 'Website',
    tagline: 'Any site you own',
    summary: 'Add a paid message slot to any website you control.',
    icon: <Globe2 size={26} />,
    color: '#F897FE',
    href: '/create-a-markee?platform=website',
  },
  {
    key: 'github',
    name: 'GitHub Repo',
    tagline: 'README, docs, any markdown',
    summary: 'Turn your repo README or docs into a monetizable ad slot.',
    icon: <Github size={26} />,
    color: '#EDEEFF',
    href: '/create-a-markee?platform=github',
  },
  {
    key: 'superfluid',
    name: 'Superfluid Project',
    tagline: 'Earn SUP incentives',
    summary: 'Attach a paid message to your Superfluid project and earn SUP.',
    icon: <Zap size={26} />,
    color: '#1DB227',
    href: '/create-a-markee?platform=superfluid',
  },
]

const HOW_IT_WORKS = [
  { n: '01', t: 'Choose your platform', d: 'Pick where your Markee will be embedded.' },
  { n: '02', t: 'Set up your sign', d: 'Add your info and a wallet to receive funds.' },
  { n: '03', t: 'Activate your Markee', d: 'Embed to your site in just a few clicks.' },
]

// ─── Platform Picker ─────────────────────────────────────────────────────────

function PlatformPicker() {
  const [sel, setSel] = useState<PlatformKey | null>(null)

  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 40px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(252px, 1fr))', gap: 16 }}>
        {PLATFORMS.map((p) => {
          const on = sel === p.key
          return (
            <div
              key={p.key}
              onClick={() => setSel(p.key)}
              style={{
                background: on ? 'rgba(248,151,254,0.06)' : 'rgba(10,15,61,0.5)',
                border: `1px solid ${on ? 'rgba(248,151,254,0.5)' : 'rgba(138,143,191,0.2)'}`,
                borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
                cursor: 'pointer', transition: 'border-color 140ms, background 140ms',
              }}
            >
              <div style={{ width: 50, height: 50, borderRadius: 12, background: '#060A2A', border: '1px solid rgba(138,143,191,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.color }}>
                {p.icon}
              </div>
              <div>
                <div style={{ color: '#EDEEFF', fontWeight: 700, fontSize: 17 }}>{p.name}</div>
                <div style={{ color: '#8A8FBF', fontSize: 13, marginTop: 3 }}>{p.tagline}</div>
              </div>
              <div style={{ color: '#B8B6D9', fontSize: 13, lineHeight: 1.55 }}>{p.summary}</div>
              {on && (
                <Link
                  href={p.href}
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', background: '#F897FE', color: '#060A2A', border: 'none', borderRadius: 10, padding: '12px 20px', fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 28px rgba(248,151,254,0.35)', transition: 'opacity 120ms' }}
                >
                  Create →
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── How it Works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how" style={{ borderTop: '1px solid rgba(138,143,191,0.2)', background: '#0A0F3D', marginTop: 40 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 40px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#8A8FBF', marginBottom: 16 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: '#F897FE', boxShadow: '0 0 8px #F897FE' }} />
          How it works
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(24px,3.6vw,36px)', fontWeight: 800, letterSpacing: -0.8, color: '#EDEEFF' }}>Embed a paid message to any digital space</h2>
        <p style={{ margin: '12px 0 0', color: '#B8B6D9', fontSize: 16, lineHeight: 1.6, maxWidth: '60ch' }}>
          Markee is a cross-platform marketplace for digital real estate and a sustainable revenue source for any website.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, margin: '34px 0 36px' }}>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} style={{ background: 'rgba(6,10,42,0.5)', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 12, padding: '20px 22px' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#F897FE', fontWeight: 700, marginBottom: 10 }}>{s.n}</div>
              <div style={{ color: '#EDEEFF', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{s.t}</div>
              <div style={{ color: '#8A8FBF', fontSize: 13, lineHeight: 1.5 }}>{s.d}</div>
            </div>
          ))}
        </div>
        <Link
          href="/create-a-markee"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F897FE', color: '#060A2A', borderRadius: 10, padding: '13px 22px', fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 28px rgba(248,151,254,0.35)' }}
        >
          Create a Markee →
        </Link>
      </div>
    </section>
  )
}

// ─── Integration Request Form ─────────────────────────────────────────────────

function IntegrateForm() {
  const [form, setForm] = useState({ platform: '', name: '', email: '' })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const valid = form.platform.trim() && form.email.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || status === 'submitting') return
    setStatus('submitting')
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? '',
          subject: `Markee integration request: ${form.platform}`,
          from_name: form.name || 'Markee site',
          platform: form.platform,
          name: form.name,
          email: form.email,
        }),
      })
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#060A2A', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8, padding: '12px 14px', color: '#EDEEFF', fontSize: 15, outline: 'none', fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#8A8FBF', marginBottom: 8,
  }

  return (
    <section id="integrate" style={{ borderTop: '1px solid rgba(138,143,191,0.2)', background: '#060A2A' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 40px 90px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 48, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#8A8FBF', marginBottom: 18 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#F897FE', boxShadow: '0 0 8px #F897FE' }} />
            For platforms
          </div>
          <h2 style={{ margin: 0, fontSize: 'clamp(24px,3.2vw,34px)', fontWeight: 800, letterSpacing: -0.8, color: '#EDEEFF' }}>Looking for a deeper integration?</h2>
          <p style={{ margin: '16px 0 0', color: '#B8B6D9', fontSize: 16, lineHeight: 1.65, maxWidth: '46ch' }}>
            We'll work with you 1-on-1 to build embeddable messages your platform's users will love.
          </p>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'Give your users an easy way to raise funds',
              "Earn fees on all your platform's Markees",
              'Drive engagement and make it fun for people to come back!',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#B8B6D9', fontSize: 14 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: '#7C9CFF', boxShadow: '0 0 6px #7C9CFF', flexShrink: 0 }} />
                {t}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'rgba(10,15,61,0.5)', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 16, padding: 28 }}>
          {status === 'success' ? (
            <div style={{ textAlign: 'center', padding: '28px 8px' }}>
              <div style={{ width: 52, height: 52, borderRadius: 99, background: 'rgba(29,178,39,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle size={26} color="#1DB227" />
              </div>
              <div style={{ color: '#EDEEFF', fontWeight: 700, fontSize: 18 }}>Thanks — we'll be in touch.</div>
              <p style={{ color: '#8A8FBF', fontSize: 14, margin: '8px 0 0' }}>
                Our partnerships team will reach out to <span style={{ color: '#B8B6D9' }}>{form.email}</span> shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label>
                <span style={labelStyle}>Website / Platform Name <span style={{ color: '#F897FE' }}>*</span></span>
                <input required value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder="Acme Protocol" style={inputStyle} />
              </label>
              <label>
                <span style={labelStyle}>Your name</span>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jordan" style={inputStyle} />
              </label>
              <label>
                <span style={labelStyle}>Email <span style={{ color: '#F897FE' }}>*</span></span>
                <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@acme.xyz" style={inputStyle} />
              </label>
              <button
                type="submit"
                disabled={!valid || status === 'submitting'}
                style={{ background: '#F897FE', color: '#060A2A', border: 'none', borderRadius: 10, padding: '14px 20px', fontWeight: 700, fontSize: 15, cursor: valid && status !== 'submitting' ? 'pointer' : 'not-allowed', opacity: valid && status !== 'submitting' ? 1 : 0.4, boxShadow: '0 8px 28px rgba(248,151,254,0.3)', transition: 'opacity 120ms' }}
              >
                {status === 'submitting' ? 'Sending…' : 'Send integration request →'}
              </button>
              {status === 'error' && (
                <p style={{ margin: 0, color: '#FF7A90', fontSize: 13, textAlign: 'center' }}>Something went wrong — try emailing <a href="mailto:hello@markee.xyz" style={{ color: '#F897FE' }}>hello@markee.xyz</a></p>
              )}
              <p style={{ margin: 0, textAlign: 'center', color: '#8A8FBF', fontSize: 13 }}>
                Or email us at{' '}
                <a href="mailto:hello@markee.xyz" style={{ color: '#F897FE', textDecoration: 'none', borderBottom: '1px dotted #F897FE' }}>hello@markee.xyz</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RaiseFunding() {
  return (
    <div style={{ minHeight: '100vh', background: '#060A2A' }}>
      <Header />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(138,143,191,0.2)' }}>
        <div className="starfield-bg" />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '80px 40px 64px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#8A8FBF', marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#F897FE', boxShadow: '0 0 12px #F897FE', flexShrink: 0 }} />
            Raise Funding
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(32px,5.5vw,58px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.04, color: '#EDEEFF' }}>
            Add Markee to your site<br />and start <span style={{ color: '#F897FE' }}>earning</span>
          </h1>
          <p style={{ margin: '20px auto 0', color: '#B8B6D9', fontSize: 18, lineHeight: 1.6, maxWidth: '54ch' }}>
            Connect your audience to our global network of buyers.
          </p>
          <div style={{ marginTop: 32, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/create-a-markee"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F897FE', color: '#060A2A', borderRadius: 10, padding: '13px 22px', fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 28px rgba(248,151,254,0.35)' }}
            >
              Create a Markee →
            </Link>
            <a
              href="#how"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: '#B8B6D9', border: '1px solid rgba(138,143,191,0.3)', borderRadius: 10, padding: '13px 22px', fontWeight: 600, fontSize: 15, textDecoration: 'none', transition: 'border-color 140ms, color 140ms' }}
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      <PlatformPicker />
      <HowItWorks />
      <IntegrateForm />

      <Footer />
    </div>
  )
}
