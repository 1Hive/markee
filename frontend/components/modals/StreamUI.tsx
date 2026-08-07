'use client'

import { useState } from 'react'
import { parseEther } from 'viem'

// ── Design tokens shared by the streaming modals ───────────────────────────────
export const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
export const BG = '#060A2A'
export const BG2 = '#0A0F3D'
export const PINK = '#F897FE'
export const BLUE = '#7C9CFF'
export const BORDER = 'rgba(138,143,191,0.2)'
export const MUTED = '#8A8FBF'
export const TEXT = '#EDEEFF'
export const TEXT2 = '#B8B6D9'

export const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
  fontFamily: MONO, fontSize: 13, outline: 'none',
}

export function btnStyle(primary: boolean, disabled = false): React.CSSProperties {
  return {
    width: '100%', padding: '13px 0', borderRadius: 10, border: primary ? 'none' : `1px solid ${BORDER}`,
    background: primary ? PINK : 'transparent', color: primary ? BG : TEXT,
    fontFamily: 'inherit', fontWeight: 700, fontSize: 15,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  }
}

// ── Input helpers ──────────────────────────────────────────────────────────────
// Keeps only digits and the first decimal point, so ".1" stays typable.
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const i = cleaned.indexOf('.')
  return i === -1 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, '')
}

// Parses what the sanitizer lets through, including ".1" and "1.", to wei. 0n on anything invalid.
export function parseEthInput(value: string): bigint {
  if (!value) return 0n
  let v = value.startsWith('.') ? `0${value}` : value
  if (v.endsWith('.')) v = v.slice(0, -1)
  if (!v) return 0n
  try { return parseEther(v) } catch { return 0n }
}

// Refetch-interval policy for reads that gate a modal: poll every few seconds only while the read
// has no data yet, so a failed or rate-limited first fetch resolves itself in seconds. Without this
// a read that exhausts its retries stays empty until a window refocus, leaving the modal on its
// loading state indefinitely. Once loaded, polling stops; the modals refetch explicitly after a tx.
export function retryUntilLoaded(query: { state: { data: unknown } }): number | false {
  return query.state.data === undefined ? 4000 : false
}

// ── Small building blocks ──────────────────────────────────────────────────────
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: 99, flexShrink: 0, display: 'inline-block',
        border: '2px solid currentColor', borderTopColor: 'transparent',
        animation: 'spin 1s linear infinite',
      }}
    />
  )
}

// A little ⓘ that reveals an explanation on hover or tap: the place technical detail lives so the
// forms themselves stay plain.
export function InfoTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="More info"
        onClick={e => { e.preventDefault(); setOpen(v => !v) }}
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'help', color: MUTED, display: 'inline-flex' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          width: 230, background: '#030714', border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '10px 12px', zIndex: 20, boxShadow: '0 12px 36px rgba(0,0,0,0.55)',
          fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 11.5, lineHeight: 1.55,
          color: TEXT2, textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal',
          fontWeight: 400, textAlign: 'left',
        }}>
          {children}
        </span>
      )}
    </span>
  )
}

export function ModalField({ label, info, children }: { label: string; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center' }}>
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {children}
    </label>
  )
}

export function Row({ label, value, bold, info }: { label: string; value: string; bold?: boolean; info?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center' }}>
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </span>
      <span style={{ fontFamily: MONO, fontSize: bold ? 14 : 12, color: bold ? PINK : TEXT2 }}>{value}</span>
    </div>
  )
}

export function TxRing({ done }: { done: boolean }) {
  return (
    <div style={{
      width: 72, height: 72, borderRadius: 99, flexShrink: 0,
      background: done ? PINK : 'transparent',
      border: done ? 'none' : `2px solid ${PINK}`,
      borderTopColor: done ? undefined : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: done ? 'none' : 'spin 1s linear infinite',
      boxShadow: '0 0 32px rgba(248,151,254,0.3)',
    }}>
      {done && (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke={BG} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

// Full-screen overlay + card + pulsing-dot header every streaming modal shares.
export function ModalShell({ stepLabel, onClose, footer, children }: {
  stepLabel: string
  onClose: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
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
          width: '100%', maxWidth: 560,
          background: BG2, borderRadius: 16, border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'Manrope, system-ui, sans-serif', color: TEXT, overflow: 'hidden',
          animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            {stepLabel}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}>×</button>
        </div>
        {children}
        {footer && (
          <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Step indicator for multi-tx flows (e.g. activation: create → approve → stream).
export function TxSteps({ steps }: { steps: { label: string; done: boolean; active: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
      {steps.map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 99, flexShrink: 0,
            background: s.done ? PINK : 'transparent',
            border: s.done ? 'none' : `1.5px solid ${s.active ? PINK : BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {s.done ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke={BG} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : s.active ? (
              <span style={{ width: 7, height: 7, borderRadius: 99, background: PINK, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            ) : (
              <span style={{ width: 6, height: 6, borderRadius: 99, background: MUTED }} />
            )}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 11, color: s.done ? TEXT2 : s.active ? PINK : MUTED, letterSpacing: 0.5 }}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// The in-flight / success body: ring + headline + supporting line.
export function TxProgress({ isSuccess, headline, steps }: {
  isSuccess: boolean
  headline: string
  detail?: string
  steps?: { label: string; done: boolean; active: boolean }[]
}) {
  return (
    <div style={{ padding: steps ? '40px 22px 40px' : '56px 22px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center', flex: 1 }}>
      {steps && <TxSteps steps={steps} />}
      <TxRing done={isSuccess} />
      <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {headline}
      </div>
    </div>
  )
}
