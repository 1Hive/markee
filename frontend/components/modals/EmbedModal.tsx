'use client'

import { useEffect, useState } from 'react'
import { Globe2, Github as GithubIconLucide } from 'lucide-react'
import { EmbedPanel } from '@/components/board-detail/shared'
import { WebsiteEmbedWizard } from '@/components/modals/WebsiteEmbedWizard'
import type { EmbedStrategy } from '@/lib/embedPrompt/fragments'
import { MONO, BG, BG2, PINK, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'

type Platform = 'website' | 'github'

const PLATFORMS: { key: Platform; label: string; summary: string; icon: React.ReactNode }[] = [
  { key: 'website', label: 'Website', summary: 'Add Markee to any site you own or manage.', icon: <Globe2 size={22} /> },
  { key: 'github', label: 'GitHub Repo', summary: 'Drop into a README or markdown file.', icon: <GithubIconLucide size={22} /> },
]

// ── Props ─────────────────────────────────────────────────────────────────────
interface EmbedModalProps {
  isOpen: boolean
  onClose: () => void
  leaderboard: { address: string; name?: string; strategy?: EmbedStrategy } | null
  initialPlatform?: Platform
}

const DEFAULT_HEADER = { label: 'Add Markee To Your Site', showBack: true }

export function EmbedModal({ isOpen, onClose, leaderboard, initialPlatform }: EmbedModalProps) {
  const [step, setStep] = useState<'platform' | 'embed'>('platform')
  const [platform, setPlatform] = useState<Platform>(initialPlatform ?? 'website')
  const [header, setHeader] = useState(DEFAULT_HEADER)

  useEffect(() => {
    if (!isOpen) return
    setStep('platform')
    setPlatform(initialPlatform ?? 'website')
    setHeader(DEFAULT_HEADER)
  // Depends on leaderboard?.address (a stable primitive), not the leaderboard object itself: callers
  // pass it as an inline object literal, a new reference on every parent render. On pages with
  // rAF-driven live-ticking values (e.g. the streaming board detail page) the parent re-renders
  // constantly, so depending on the object reference re-ran this effect right after every click,
  // snapping step back to 'platform' before the user could ever reach the embed step.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, leaderboard?.address, initialPlatform])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen || !leaderboard) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeIn 180ms ease forwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640,
          background: BG2, borderRadius: 16,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'Manrope, system-ui, sans-serif',
          color: TEXT, overflow: 'hidden',
          animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            {header.label}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '22px 22px 26px', overflowY: 'auto', flex: 1 }}>
          {step === 'platform' ? (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                Where are you adding Markee?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {PLATFORMS.map(p => {
                  const active = p.key === platform
                  return (
                    <button
                      key={p.key}
                      onClick={() => { setPlatform(p.key); setStep('embed'); setHeader(DEFAULT_HEADER) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
                        background: active ? 'rgba(248,151,254,0.06)' : BG,
                        border: `1.5px solid ${active ? PINK : BORDER}`,
                        borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
                        transition: 'border-color 140ms, background 140ms',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = PINK }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = active ? PINK : BORDER }}
                    >
                      <span style={{
                        width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                        background: BG2, border: `1px solid ${BORDER}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: active ? PINK : TEXT2,
                      }}>
                        {p.icon}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: TEXT, fontWeight: 700, fontSize: 17 }}>{p.label}</div>
                        <div style={{ color: MUTED, fontSize: 13.5, marginTop: 3 }}>{p.summary}</div>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              {header.showBack && (
                <button
                  onClick={() => setStep('platform')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
                    color: PINK, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    padding: 0, marginBottom: 16,
                  }}
                >
                  ← Back
                </button>
              )}
              {platform === 'github' ? (
                <EmbedPanel address={leaderboard.address} name={leaderboard.name} platform="github" />
              ) : (
                <WebsiteEmbedWizard
                  address={leaderboard.address} name={leaderboard.name} strategy={leaderboard.strategy ?? 'fixed'}
                  onHeaderChange={setHeader}
                  onDone={onClose}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
