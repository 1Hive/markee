'use client'

import { useState } from 'react'
import { parseEther, formatEther } from 'viem'
import { formatUsd } from '@/lib/utils'
import { formatRunwayShort, formatEthxBalanceDisplay } from '@/lib/superfluid/streaming'

// ── Design tokens shared by the streaming modals ───────────────────────────────
import { MONO, BG, BG2, PINK, BLUE, GREEN, BORDER, MUTED, TEXT, TEXT2 } from '@/lib/design-tokens'
export { MONO, BG, BG2, PINK, BLUE, GREEN, BORDER, MUTED, TEXT, TEXT2 }
export const GOLD = '#FFD700'
export const RED = '#FF8E8E'

export const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
  fontFamily: MONO, fontSize: 13, outline: 'none',
}

// The message field is the emphasized input (matches MarkeeSignModal/StreamSignModal's convention)
// -- attention lands on what you're saying before what you're paying.
export const messageBoxStyle = {
  ...inputStyle,
  border: `1.5px solid ${PINK}`,
  boxShadow: '0 0 24px rgba(248,151,254,0.08)',
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
// Keeps only digits and the first decimal point (so ".1" stays typable), capped at 9 digits on
// each side of the decimal — matches MarkeeSignModal's sanitizeAmountInput.
export function sanitizeDecimalInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const i = cleaned.indexOf('.')
  if (i !== -1) cleaned = cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, '')
  const [intPart, fracPart] = cleaned.split('.')
  const cappedInt = (intPart ?? '').slice(0, 9)
  return fracPart !== undefined ? `${cappedInt}.${fracPart.slice(0, 9)}` : cappedInt
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
export function InfoTip({ children, align = 'center' }: { children: React.ReactNode; align?: 'center' | 'right' }) {
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
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: MUTED, display: 'inline-flex' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)',
          ...(align === 'right' ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
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

// The pre-submit "Review Payment Info" step every payment button now opens instead of submitting
// directly: what you're paying, what you earn, and whether the message ends up featured -- with the
// For Rent refund/takeover mechanics spelled out when relevant. Body only (no footer/buttons), so
// each modal keeps swapping it in for its own form the same way it already swaps in TxProgress for
// its own post-submit state. Pair with PaymentReviewFooter for the Back/Confirm controls.
export function PaymentReviewCard({
  kind, message, amountLabel, amountUsd, depositLabel, markeeEarnedLabel, willWin, minToWinLabel,
}: {
  kind: 'fixed' | 'rent'
  message: string
  amountLabel: string
  amountUsd?: string | null
  depositLabel?: string | null
  markeeEarnedLabel: string
  willWin: boolean
  minToWinLabel?: string | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)',
        padding: '12px 14px', fontFamily: MONO, fontSize: 13.5, color: TEXT, lineHeight: 1.45,
      }}>
        {message || '—'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Row label="Paying" value={amountUsd ? `${amountLabel}  (≈ ${amountUsd})` : amountLabel} bold />
        {depositLabel && <Row label="Depositing now" value={depositLabel} />}
        <Row label="You'll earn" value={markeeEarnedLabel} />
      </div>

      <div style={{
        borderRadius: 10, padding: '12px 14px',
        border: `1px solid ${willWin ? 'rgba(29,178,39,0.35)' : kind === 'rent' ? 'rgba(255,215,0,0.35)' : 'rgba(255,142,142,0.35)'}`,
        background: willWin ? 'rgba(29,178,39,0.06)' : kind === 'rent' ? 'rgba(255,215,0,0.06)' : 'rgba(255,142,142,0.06)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: willWin ? GREEN : kind === 'rent' ? GOLD : RED }}>
          {willWin
            ? kind === 'fixed'
              ? 'Your message will be featured immediately'
              : "Your payment only streams while your message is winning"
            : kind === 'rent'
              ? "You are placing a bid for a message that won't be featured yet"
              : `Not featured yet — needs ${minToWinLabel ?? 'more funding'} to take the top spot`}
        </span>
        {kind === 'rent' && !willWin && (
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: TEXT }}>
            Add {minToWinLabel ?? 'more funding'} to take the top spot
          </span>
        )}
        {kind === 'rent' && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.4 }}>
            {willWin
              ? "Anyone can overtake your message by bidding more, pausing your payment until you're winning again. You can cancel at any time."
              : "You won't pay for time your message isn't winning, although you'll see an outgoing stream that's being refunded 100% to your wallet."}
          </span>
        )}
      </div>
    </div>
  )
}

export function PaymentReviewFooter({ onBack, onConfirm, busy, error }: {
  onBack: () => void
  onConfirm: () => void
  busy: boolean
  error?: string | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          style={{ ...btnStyle(false, busy), width: 'auto', flex: '0 0 auto', padding: '12px 20px' }}
        >
          Back
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} style={{ ...btnStyle(true, busy), flex: 1 }}>
          {busy && <Spinner />}
          {busy ? 'Confirming…' : 'Confirm Payment'}
        </button>
      </div>
    </div>
  )
}

export function TxRing({ done, spinning = !done }: { done: boolean; spinning?: boolean }) {
  return (
    <div style={{
      width: 72, height: 72, borderRadius: 99, flexShrink: 0,
      background: done ? PINK : 'transparent',
      border: done ? 'none' : `2px solid ${PINK}`,
      borderTopColor: !done && spinning ? 'transparent' : undefined,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: spinning ? 'spin 1s linear infinite' : 'none',
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

// Monthly-rate input shared by every For Rent "buy a message" flow (board activation and backing an
// existing message): big rate input with MIN/MAX/WIN presets, plus the auto-deposit line that
// replaced the old 1/2/3-month funding pills -- how much (if anything) gets wrapped to ETHx this tx,
// and how long the resulting balance sustains the bid, with a link out to the Deposit Manager.
export function RatePriceCard({
  monthly, setMonthly,
  minMonthlyWei, minMonthlyEth, minLoaded, belowMin,
  ethPrice, ethxBalance, walletEthBalance,
  calc, topMonthlyWei, lastPreset, setLastPreset,
  runwaySecs, onOpenDepositManager,
}: {
  monthly: string
  setMonthly: (v: string) => void
  minMonthlyWei: bigint | undefined
  minMonthlyEth: string
  minLoaded: boolean
  belowMin: boolean
  ethPrice: number | null
  ethxBalance: bigint | undefined
  walletEthBalance: bigint | undefined
  calc: { monthlyWei: bigint; prefund: bigint; value: bigint }
  topMonthlyWei?: bigint
  lastPreset: 'min' | 'win' | null
  setLastPreset: (p: 'min' | 'win' | null) => void
  runwaySecs: bigint
  onOpenDepositManager: () => void
}) {
  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      padding: '14px 16px',
      background: BG,
    }}>
      {/* Number + unit inline on left, MIN/MAX on right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <input
            inputMode="decimal"
            value={monthly}
            onChange={e => { setMonthly(sanitizeDecimalInput(e.target.value)); setLastPreset(null) }}
            placeholder={minLoaded && minMonthlyWei ? minMonthlyEth : '0.001'}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: TEXT, fontFamily: MONO, fontSize: 26, fontWeight: 800,
              padding: 0,
              width: `${Math.max(5, (monthly || (minLoaded && minMonthlyWei ? minMonthlyEth : '0.001')).length + 0.5)}ch`,
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETHx/mo</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => { if (minMonthlyWei) { setMonthly(minMonthlyEth); setLastPreset('min') } }}
            disabled={!minLoaded}
            style={{
              border: `1px solid ${lastPreset === 'min' ? PINK : BORDER}`,
              background: 'transparent',
              color: lastPreset === 'min' ? PINK : TEXT2,
              borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
              fontWeight: 700, cursor: minLoaded ? 'pointer' : 'default',
              opacity: minLoaded ? 1 : 0.4,
              transition: 'border-color 120ms, color 120ms',
            }}
          >
            MIN
          </button>
          {topMonthlyWei && topMonthlyWei > 0n && minMonthlyWei && (
            <button
              type="button"
              onClick={() => {
                const winWei = (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei
                setMonthly(formatEther(winWei)); setLastPreset('win')
              }}
              style={{
                border: `1px solid ${lastPreset === 'win' ? GOLD : BORDER}`,
                background: 'transparent',
                color: lastPreset === 'win' ? GOLD : TEXT2,
                borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                fontWeight: 700, cursor: 'pointer',
                transition: 'border-color 120ms, color 120ms',
              }}
            >
              WIN
            </button>
          )}
        </div>
      </div>

      {/* USD equiv + ETHx balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: MONO, fontSize: 12, color: MUTED, marginBottom: 12 }}>
        <span>
          {belowMin
            ? `Min: ${minMonthlyEth} ETH/mo`
            : calc.monthlyWei > 0n && ethPrice
              ? `≈ ${formatUsd(Number(formatEther(calc.monthlyWei)) * ethPrice)}/mo`
              : ' '}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {ethxBalance && ethxBalance > 0n
            ? <>ETHx Balance {formatEthxBalanceDisplay(ethxBalance)}</>
            : <>ETH Balance {parseFloat(formatEther(walletEthBalance ?? 0n)).toFixed(3)}</>}
          <InfoTip align="right">Markee uses Superfluid for payment streaming. Deposit ETH to get ETHx you can use for payments.</InfoTip>
        </span>
      </div>

      <div style={{ height: 1, background: BORDER, margin: '0 0 12px' }} />

      {/* Deposit Manager link (left) / right side — replaces the old month picker. calc.value > 0
          means the wallet's existing ETHx balance doesn't already cover this bid, so fresh ETH gets
          wrapped on top of it this tx -- show that deposit amount (with an info tip explaining the
          runway it buys) instead of the runway itself, since "how much leaves your wallet right now"
          is the more useful number to see before a first transaction. Once no deposit is needed,
          fall back to just showing the runway. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          type="button"
          onClick={onOpenDepositManager}
          style={{ background: 'transparent', border: 'none', color: PINK, fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          Deposit Manager →
        </button>
        {calc.value > 0n ? (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT }}>{parseFloat(formatEther(calc.value)).toFixed(4)} ETH</span>
            <InfoTip align="right">
              Your first transaction will deposit {parseFloat(formatEther(calc.value)).toFixed(4)} ETH as ETHx, enough to stream for {formatRunwayShort(runwaySecs)}. Go to the Deposit Manager to deposit a different amount than this.
            </InfoTip>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT }}>{formatRunwayShort(runwaySecs)}</span>
            <InfoTip align="right">
              How long your message can stream for based on your ETHx balance. To add more, go to the Deposit Manager.
            </InfoTip>
          </span>
        )}
      </div>
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
          fontFamily: 'Manrope, system-ui, sans-serif', color: TEXT, overflow: 'visible',
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
export function TxProgress({ isSuccess, headline, detail, steps }: {
  isSuccess: boolean
  headline: string
  detail?: string
  steps?: { label: string; done: boolean; active: boolean }[]
}) {
  return (
    <div style={{ padding: steps ? '40px 22px 40px' : '56px 22px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center', flex: 1 }}>
      {steps && <TxSteps steps={steps} />}
      <TxRing done={isSuccess} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {headline}
        </div>
        {detail && (
          <div style={{ fontSize: 13, color: MUTED, maxWidth: 340, lineHeight: 1.5 }}>{detail}</div>
        )}
      </div>
    </div>
  )
}
