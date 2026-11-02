'use client'

// Shared building blocks for the /account dashboard: panel header, segmented toggle, amber attention
// group, archive button, status dot, wallet-pending state and amount formatting.

import { useState } from 'react'
import { Archive, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatUsd } from '@/lib/utils'
import { MONO, PINK, BG, BORDER, TEXT2, MUTED, SANS, AMBER, LAVENDER } from '@/lib/design-tokens'

export const SECONDS_PER_MONTH = 60n * 60n * 24n * 30n

// 860 · 1,310 · 12.4K
export function fmtCount(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : n.toLocaleString('en-US')
}

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

// "1–10 of 42" with previous/next; renders nothing when everything fits on one page.
export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  if (total <= pageSize) return null
  const last = Math.ceil(total / pageSize) - 1
  const btn = (disabled: boolean): React.CSSProperties => ({ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: disabled ? MUTED : TEXT2, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontFamily: MONO, fontSize: 11.5, color: MUTED }}>
      <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}</span>
      <button aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} style={btn(page === 0)}><ChevronLeft size={14} /></button>
      <button aria-label="Next page" disabled={page >= last} onClick={() => onPage(page + 1)} style={btn(page >= last)}><ChevronRight size={14} /></button>
    </div>
  )
}

// pageSize pages the group instead of the default "show 3, then show more".
export function AttnGroup<T>({ title, sub, items, render, noun = ['Markee', 'Markees'], right, pageSize }: {
  title: string
  sub: string
  items: T[]
  render: (item: T) => React.ReactNode
  noun?: [string, string]
  right?: React.ReactNode
  pageSize?: number
}) {
  const [all, setAll] = useState(false)
  const [page, setPage] = useState(0)
  const lastPage = pageSize ? Math.max(0, Math.ceil(items.length / pageSize) - 1) : 0
  const shownPage = Math.min(page, lastPage)
  const hidden = pageSize ? 0 : items.length - 3
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: AMBER }}>{title}</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: AMBER, background: `${AMBER}24`, borderRadius: 99, padding: '1px 8px' }}>{items.length}</span>
        <span style={{ fontSize: 12.5, color: MUTED }}>{sub}</span>
        {right && <><span style={{ flex: 1 }} />{right}</>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(pageSize ? items.slice(shownPage * pageSize, (shownPage + 1) * pageSize) : all ? items : items.slice(0, 3)).map(render)}
        {pageSize && <Pager page={shownPage} total={items.length} pageSize={pageSize} onPage={setPage} />}
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
