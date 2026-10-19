'use client'

// Shared building blocks for the /account dashboard: panel header, segmented toggle, amber attention
// group, archive button, status dot, wallet-pending state and amount formatting.

import { useState } from 'react'
import { Archive, ChevronDown } from 'lucide-react'
import { formatUsd } from '@/lib/utils'
import { MONO, PINK, BG, BORDER, TEXT2, MUTED, SANS, AMBER, LAVENDER } from '@/lib/design-tokens'

export const SECONDS_PER_MONTH = 60n * 60n * 24n * 30n

export function fmtAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function GlowDot({ size = 8, color }: { size?: number; color: string }) {
  return <span style={{ width: size, height: size, borderRadius: 99, background: color, boxShadow: `0 0 ${size * 1.5}px ${color}`, flexShrink: 0, display: 'inline-block' }} />
}

export function fmtWeiUsd(wei: bigint, ethPrice: number | null): string {
  const eth = Number(wei) / 1e18
  return ethPrice ? formatUsd(eth * ethPrice) : `${eth.toFixed(3).replace(/\.?0+$/, '')} ETH`
}

export function PanelHead({ label, n, sub, children }: { label: string; n?: number; sub?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '15px 18px', minHeight: 56, boxSizing: 'border-box', borderBottom: '1px solid rgba(138,143,191,0.18)', background: 'rgba(138,143,191,0.05)' }}>
      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: LAVENDER }}>{label}</span>
      {n != null && <span style={{ fontFamily: MONO, fontSize: 11, color: LAVENDER, background: 'rgba(180,172,247,0.12)', borderRadius: 99, padding: '1px 8px' }}>{n}</span>}
      {sub && <span style={{ fontSize: 12.5, color: MUTED }}>{sub}</span>}
      {children && <span style={{ flex: 1 }} />}
      {children}
    </div>
  )
}

export function SegToggle<K extends string>({ options, value, onChange, label }: {
  options: { k: K; l: string; n?: number }[]
  value: K
  onChange: (k: K) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(o => {
        const on = value === o.k
        return (
          <button
            key={o.k} role="radio" aria-checked={on} onClick={() => onChange(o.k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: on ? 'rgba(248,151,254,0.14)' : 'transparent', color: on ? PINK : TEXT2, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {o.l}{o.n != null && <span style={{ fontFamily: MONO, fontSize: 11, color: on ? PINK : LAVENDER }}>{o.n}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function ArchiveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      aria-label={label}
      style={{ height: 32, boxSizing: 'border-box', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, cursor: 'pointer', padding: '0 10px', color: TEXT2, fontSize: 12.5, fontWeight: 600, fontFamily: SANS }}
    >
      <Archive size={13} style={{ color: MUTED }} />
      Archive
    </button>
  )
}

export function AttnGroup<T>({ title, sub, items, render, noun = ['Markee', 'Markees'], right }: {
  title: string
  sub: string
  items: T[]
  render: (item: T) => React.ReactNode
  noun?: [string, string]
  right?: React.ReactNode
}) {
  const [all, setAll] = useState(false)
  const hidden = items.length - 3
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: AMBER }}>{title}</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: AMBER, background: `${AMBER}24`, borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>
        <span style={{ fontSize: 12.5, color: MUTED }}>{sub}</span>
        {right && <><span style={{ flex: 1 }} />{right}</>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(all ? items : items.slice(0, 3)).map(render)}
        {hidden > 0 && (
          <button
            onClick={() => setAll(v => !v)}
            aria-expanded={all}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 38, boxSizing: 'border-box', background: 'transparent', border: `1px dashed ${BORDER}`, borderRadius: 14, color: TEXT2, fontSize: 13, fontWeight: 600, fontFamily: SANS, cursor: 'pointer' }}
          >
            {all ? 'Show fewer' : `Show ${hidden} more ${hidden === 1 ? noun[0] : noun[1]}`}
            <ChevronDown size={12} style={{ transform: all ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
          </button>
        )}
      </div>
    </section>
  )
}

export function Spinner({ size = 12 }: { size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: 99, border: `2px solid ${BORDER}`, borderTopColor: PINK, animation: 'spin 0.8s linear infinite', display: 'inline-block', flexShrink: 0 }} />
}

// Shown in place of a write's buttons while the wallet prompt (signature or tx) is open.
export function WalletPending({ label = 'Confirm in wallet…' }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: TEXT2, whiteSpace: 'nowrap', fontFamily: SANS }}>
      <Spinner />{label}
    </span>
  )
}

// A rejected wallet prompt restores the UI silently; anything else is worth showing.
export function isUserRejection(e: unknown): boolean {
  return /reject|denied/i.test(e instanceof Error ? e.message : String(e ?? ''))
}
