'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

const MONO = "var(--font-jetbrains-mono),'JetBrains Mono',monospace"
const SANS = "Manrope,system-ui,sans-serif"
const PINK = '#F897FE'
const BG   = '#060A2A'
const TEXT = '#EDEEFF'
const MUTED = '#8A8FBF'

interface EmbedData {
  address: string
  leaderboardName: string
  topMarkeeAddress: string | null
  message: string
  name: string
  totalFundsAdded: string
  updatedAt: string
}

export default function EmbedPage() {
  const { address } = useParams<{ address: string }>()
  const [data, setData]     = useState<EmbedData | null>(null)
  const [hover, setHover]   = useState(false)
  const [btnHover, setBtnHover] = useState(false)

  useEffect(() => {
    if (!address) return
    const load = () =>
      fetch(`/api/embed/${address}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setData(d) })
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [address])

  const pageUrl   = `https://markee.xyz/markee/${address}`
  const hasMsg    = !!data?.message

  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: SANS, padding: '12px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 680,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${hover ? 'rgba(248,151,254,0.4)' : 'rgba(138,143,191,0.2)'}`,
        borderRadius: 12, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'border-color 180ms',
      }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* Pulsing dot */}
        <span style={{
          width: 8, height: 8, borderRadius: 99, flexShrink: 0,
          background: hasMsg ? PINK : MUTED,
          boxShadow: hasMsg ? `0 0 10px ${PINK}` : 'none',
          animation: hasMsg ? 'glowPulse 1.5s ease-in-out infinite' : 'none',
        }} />

        {/* Message */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasMsg ? (
            <>
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', fontFamily: MONO, fontSize: 14,
                  color: TEXT, textDecoration: 'none',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {data!.message}
              </a>
              {data!.name && (
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 2, display: 'block' }}>
                  by {data!.name}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>
              {data ? 'No message yet — be the first.' : 'Loading…'}
            </span>
          )}
        </div>

        {/* CTA */}
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            flexShrink: 0,
            background: btnHover ? PINK : 'transparent',
            color: btnHover ? BG : PINK,
            border: `1px solid ${PINK}`,
            borderRadius: 8, padding: '6px 14px',
            fontFamily: MONO, fontSize: 12, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
            transition: 'background 140ms, color 140ms',
          }}
        >
          {hasMsg ? 'Beat it →' : 'Buy →'}
        </a>
      </div>

      {/* Attribution */}
      <a
        href="https://markee.xyz"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'absolute', bottom: 6, right: 10,
          fontFamily: MONO, fontSize: 9, color: 'rgba(138,143,191,0.4)',
          textDecoration: 'none', letterSpacing: 0.5,
          transition: 'color 140ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = MUTED }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(138,143,191,0.4)' }}
      >
        markee.xyz
      </a>
    </div>
  )
}
