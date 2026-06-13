'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { formatEther } from 'viem'
import { useAccount } from 'wagmi'
import { Eye, ExternalLink, ChevronDown } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { ModeratedContent, FlagButton } from '@/components/moderation'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getAddressUrl } from '@/lib/explorer'
import { formatUsd } from '@/lib/utils'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useLeaderboardDetail } from '@/lib/contracts/useLeaderboardDetail'
import type { LeaderboardMarkee } from '@/lib/contracts/useLeaderboardDetail'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO  = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK  = '#F897FE'
const BLUE  = '#7C9CFF'
const GREEN = '#1DB227'
const BG    = '#060A2A'
const BG2   = '#0A0F3D'
const TEXT  = '#EDEEFF'
const TEXT2 = '#B8B6D9'
const MUTED = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

const HERO_GRAD = [
  'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%)',
  'radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%)',
  'linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)',
].join(', ')

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function fmtAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function priceToOvertake(topFunds: bigint) {
  return topFunds + BigInt('1000000000000000')
}

// ── Platform / served-on info from ecosystem API ──────────────────────────────
interface EcoEntry { address: string; platform: string; verifiedUrl?: string; verifiedUrls?: string[]; logoUrl?: string; leaderboardName?: string }

function useServedOn(leaderboardAddress: string) {
  const [entry, setEntry] = useState<EcoEntry | null>(null)
  useEffect(() => {
    if (!leaderboardAddress) return
    fetch('/api/ecosystem/leaderboards', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.leaderboards) return
        const found = (data.leaderboards as EcoEntry[]).find(
          lb => lb.address.toLowerCase() === leaderboardAddress.toLowerCase()
        )
        if (found) setEntry(found)
      })
      .catch(() => {})
  }, [leaderboardAddress])
  return entry
}

// ── Served On cell ────────────────────────────────────────────────────────────
function ServedOnCell({ entry }: { entry: EcoEntry | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!entry) return <span style={{ fontFamily: MONO, fontSize: 15, color: MUTED }}>—</span>
  if (entry.platform === 'github') return <span style={{ fontFamily: MONO, fontSize: 15, color: TEXT }}>GitHub Repo</span>
  if (entry.platform === 'superfluid') return <span style={{ fontFamily: MONO, fontSize: 15, color: TEXT }}>Superfluid</span>

  const urls = entry.verifiedUrls?.length ? entry.verifiedUrls : entry.verifiedUrl ? [entry.verifiedUrl] : []
  if (urls.length === 0) return <span style={{ fontFamily: MONO, fontSize: 15, color: MUTED }}>—</span>

  const first = urls[0].replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 15 }}>
      <a href={`https://${first}`} target="_blank" rel="noopener noreferrer" style={{ color: TEXT, textDecoration: 'none', borderBottom: `1px dotted ${MUTED}` }}>{first}</a>
      {urls.length > 1 && (
        <>
          <button onClick={() => setOpen(v => !v)} style={{ background: `${PINK}22`, border: `1px solid ${BORDER}`, color: PINK, borderRadius: 99, padding: '2px 8px', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            +{urls.length - 1}
          </button>
          {open && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, minWidth: 200, zIndex: 30, boxShadow: '0 16px 44px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {urls.map(u => {
                const clean = u.replace(/^https?:\/\//, '').replace(/\/$/, '')
                return (
                  <a key={u} href={`https://${clean}`} target="_blank" rel="noopener noreferrer"
                    style={{ color: TEXT2, textDecoration: 'none', fontSize: 13, padding: '8px 10px', borderRadius: 7, display: 'block', transition: 'background 100ms, color 100ms' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; (e.currentTarget as HTMLElement).style.color = PINK }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
                  >{clean}</a>
                )
              })}
            </div>
          )}
        </>
      )}
    </span>
  )
}

// ── Metrics bar ───────────────────────────────────────────────────────────────
function MetricsBar({ meta, topViews, markeeCount, entry, ethPrice }: {
  meta: { totalLeaderboardFunds: bigint; address: string }
  topViews: number
  markeeCount: number
  entry: EcoEntry | null
  ethPrice: number | null
}) {
  const totalEth = parseFloat(formatEther(meta.totalLeaderboardFunds))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const cell = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{label}</span>
      {node}
    </div>
  )
  const val = (text: string, color = TEXT) => (
    <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{text}</span>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 24, padding: '26px 0', borderTop: `1px solid ${BORDER}` }}>
      {cell('Served on', <ServedOnCell entry={entry} />)}
      {cell('Total funds added', val(totalLabel, GREEN))}
      {cell('Total views', val(formatViews(topViews), BLUE))}
      {cell('Messages bought', val(markeeCount.toLocaleString()))}
      {cell('Contract address',
        <a href={getAddressUrl(CANONICAL_CHAIN_ID, meta.address)} target="_blank" rel="noopener noreferrer"
          style={{ alignSelf: 'flex-start', fontFamily: MONO, fontSize: 15, color: PINK, textDecoration: 'none', borderBottom: `1px dotted ${PINK}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {fmtAddr(meta.address)} <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}

// ── Featured card ─────────────────────────────────────────────────────────────
function FeaturedCard({ markee, topViews, ethPrice, onBuy }: {
  markee: LeaderboardMarkee
  topViews: number
  ethPrice: number | null
  onBuy: () => void
}) {
  const [hover, setHover] = useState(false)
  const priceEth = parseFloat(formatEther(priceToOvertake(markee.totalFundsAdded)))
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`
  const displayName = markee.name || fmtAddr(markee.owner)

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 2, textTransform: 'uppercase' as const }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, boxShadow: `0 0 12px ${PINK}` }} />
        <span>Top Message</span>
        <span style={{ flex: 1, height: 1, background: BORDER, marginLeft: 8 }} />
      </div>

      <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={markee.address}>
        <button
          onClick={onBuy}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
            borderRadius: 16, padding: '18px 26px 22px', backdropFilter: 'blur(4px)',
            transition: 'border-color 180ms, transform 180ms, box-shadow 180ms',
            transform: hover ? 'translateY(-2px)' : 'none',
            boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
            fontFamily: 'Manrope, system-ui, sans-serif',
          }}
        >
          {/* top-right: views + flag */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 13, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
            <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markee.address} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: BLUE }}>
              <Eye size={10} style={{ opacity: 0.7 }} /> {formatViews(topViews)}
            </span>
          </div>

          {/* message */}
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 'clamp(20px, 3vw, 34px)', lineHeight: 1.12, letterSpacing: '-0.02em', textWrap: 'balance' as any, background: `linear-gradient(120deg, ${TEXT} 0%, ${PINK} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {markee.message || 'No message yet'}
          </div>

          {/* bottom-right: author */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, fontSize: 13, color: TEXT2, flexWrap: 'wrap' }}>
            <span style={{ color: MUTED }}>-</span>
            {markee.name && <span style={{ color: TEXT }}>{markee.name}</span>}
            <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11 }}>{fmtAddr(markee.owner)}</span>
          </div>

          {/* hover price pill */}
          <span style={{ position: 'absolute', bottom: -15, left: '50%', transform: `translateX(-50%) ${hover ? 'translateY(0)' : 'translateY(4px)'}`, display: 'inline-flex', alignItems: 'center', gap: 6, background: PINK, color: BG, fontFamily: MONO, fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 8, whiteSpace: 'nowrap' as const, boxShadow: '0 8px 28px rgba(248,151,254,0.42)', opacity: hover ? 1 : 0, transition: 'opacity 180ms, transform 180ms', pointerEvents: 'none', zIndex: 3 }}>
            {priceLabel} to change
          </span>
        </button>
      </ModeratedContent>
    </div>
  )
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ markee }: { markee: LeaderboardMarkee }) {
  return (
    <div style={{ gridColumn: '1 / -1', background: BG, borderTop: `1px solid ${BORDER}`, padding: '12px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <ExternalLink size={13} style={{ color: MUTED, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: TEXT2 }}>View full transaction history on</span>
      <a href={getAddressUrl(CANONICAL_CHAIN_ID, markee.address)} target="_blank" rel="noopener noreferrer"
        style={{ fontFamily: MONO, fontSize: 13, color: PINK, textDecoration: 'none', borderBottom: `1px dotted ${PINK}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        Basescan {fmtAddr(markee.address)} <ExternalLink size={10} />
      </a>
    </div>
  )
}

// ── Leaderboard row ───────────────────────────────────────────────────────────
const LB_COLS = '150px 120px 1fr 70px 200px'

function LeaderRow({ markee, views, ethPrice, featured, isOwner, onAddFunds, onEdit }: {
  markee: LeaderboardMarkee
  views: number
  ethPrice: number | null
  featured: boolean
  isOwner: boolean
  onAddFunds: (m: LeaderboardMarkee) => void
  onEdit: (m: LeaderboardMarkee) => void
}) {
  const [open, setOpen] = useState(false)
  const fundsEth = parseFloat(formatEther(markee.totalFundsAdded))
  const fundsLabel = ethPrice ? formatUsd(fundsEth * ethPrice) : `${fundsEth.toFixed(3)} ETH`
  const displayWho = markee.name || fmtAddr(markee.owner)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: LB_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, alignItems: 'center', background: featured ? `${PINK}0A` : 'transparent', borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent', transition: 'background 120ms' }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{displayWho}</span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: BLUE, fontWeight: 600 }}>{fundsLabel}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{markee.message || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message</span>}</span>
        <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Eye size={10} style={{ opacity: 0.6 }} /> {views > 0 ? formatViews(views) : '—'}
        </span>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const }}
          >
            History <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
          </button>
          {isOwner && (
            <button
              onClick={() => onEdit(markee)}
              style={{ background: 'transparent', color: PINK, border: `1px solid ${PINK}44`, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onAddFunds(markee)}
            style={{ background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}
          >
            Add Funds
          </button>
        </div>
      </div>
      {open && <HistoryPanel markee={markee} />}
    </>
  )
}

// ── Embed panel ───────────────────────────────────────────────────────────────
type EmbedTab = 'snippet' | 'script' | 'iframe' | 'terminal'

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    }).catch(() => {})
  }
  return (
    <button
      onClick={copy}
      style={{
        background: done ? `${GREEN}22` : 'rgba(138,143,191,0.1)',
        color: done ? GREEN : MUTED,
        border: `1px solid ${done ? GREEN + '44' : 'rgba(138,143,191,0.15)'}`,
        borderRadius: 6, padding: '4px 10px',
        fontFamily: MONO, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'all 140ms', whiteSpace: 'nowrap' as const,
      }}
    >
      {done ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      {label && (
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, marginBottom: 8 }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', background: '#030714', border: `1px solid rgba(138,143,191,0.15)`, borderRadius: 10, padding: '14px 16px' }}>
        <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, color: TEXT2, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, lineHeight: 1.65 }}>
          {code}
        </pre>
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <CopyButton text={code} />
        </div>
      </div>
    </div>
  )
}

function EmbedPanel({ address }: { address: string }) {
  const [tab, setTab]       = useState<EmbedTab>('snippet')
  const [open, setOpen]     = useState(false)
  const [btnHover, setBtnHover] = useState(false)

  const origin  = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin) : 'https://markee.xyz'
  const apiUrl  = `${origin}/api/embed/${address}`
  const pageUrl = `${origin}/markee/${address}`
  const iframeUrl = `${origin}/embed/${address}`

  const snippetCode = `<!-- Insert where you want the message to appear -->
<span data-markee="${address}"></span>

<!-- Add before </body> -->
<script>
(function(){
  var a="${address}",e=document.querySelector('[data-markee="'+a+'"]');
  function u(){fetch("${apiUrl}").then(r=>r.json()).then(d=>{if(e&&d.message)e.textContent=d.message}).catch(()=>{})}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',u):u();
  setInterval(u,60000);
})();
</script>`.trim()

  const scriptCode = `<!-- Insert where you want the message to appear -->
<span data-markee="${address}"></span>

<!-- Hosted script — auto-updates every 60 s -->
<script src="${apiUrl}/script" defer></script>`.trim()

  const iframeCode = `<iframe
  src="${iframeUrl}"
  width="100%"
  height="52"
  frameborder="0"
  style="border:none;display:block;"
  title="Markee sponsored message"
></iframe>`.trim()

  const statuslineScript = `// ~/.markee/statusline.mjs
// Reads the cached message and prints an OSC 8 hyperlink for the terminal.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
try {
  const cache = homedir()+'/.markee/${address}.json'
  const o = JSON.parse(readFileSync(cache,'utf8'))
  if(o?.message && Date.now()-o.ts < 600_000){
    const strip=s=>s.replace(/[\\u0000-\\u001f\\u007f-\\u009f]/g,'')
    const E='\\x1b'
    process.stdout.write(E+']8;;${pageUrl}'+E+'\\\\markee\\xb7 '+strip(o.message)+E+']8;;'+E+'\\\\')
  }
}catch{}
process.exit(0)`.trim()

  const updateScript = `// ~/.markee/update.mjs
// Fetches the current top message and caches it locally.
// Run via cron: */10 * * * * node ~/.markee/update.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
const dir = homedir()+'/.markee'
mkdirSync(dir,{recursive:true})
fetch('${apiUrl}')
  .then(r=>r.json())
  .then(d=>writeFileSync(dir+'/${address}.json',JSON.stringify({...d,ts:Date.now()})))
  .catch(()=>{})`.trim()

  const settingsJson = `// Add to ~/.claude/settings.json:
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.markee/statusline.mjs",
    "padding": 0
  }
}`.trim()

  const cronLine = `# Add to crontab (run: crontab -e)
*/10 * * * * node ~/.markee/update.mjs`.trim()

  const tabs: { key: EmbedTab; label: string }[] = [
    { key: 'snippet',  label: 'JS Snippet'  },
    { key: 'script',   label: 'Script Tag'  },
    { key: 'iframe',   label: 'iframe'      },
    { key: 'terminal', label: 'Terminal'    },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 12px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: `1px solid ${btnHover ? 'rgba(248,151,254,0.35)' : BORDER}`,
          borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
          fontFamily: MONO, fontSize: 13, color: btnHover ? TEXT : TEXT2,
          transition: 'border-color 140ms, color 140ms',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        Embed this Markee
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', marginLeft: 2 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ marginTop: 14, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, background: BG, paddingLeft: 4 }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '12px 16px', fontFamily: MONO, fontSize: 12,
                  color: tab === t.key ? PINK : MUTED,
                  borderBottom: `2px solid ${tab === t.key ? PINK : 'transparent'}`,
                  marginBottom: -1, transition: 'color 120ms',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            {tab === 'snippet' && (
              <>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Drop this onto any HTML page. The snippet fetches the current top message and re-polls every 60 seconds — no server changes needed.
                </p>
                <CodeBlock code={snippetCode} />
              </>
            )}

            {tab === 'script' && (
              <>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  One element + one hosted script. The script handles polling automatically.
                </p>
                <CodeBlock code={scriptCode} />
                <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>
                  The script is served from Markee's CDN and cached for 60 seconds, so nothing extra runs on your server.
                </p>
              </>
            )}

            {tab === 'iframe' && (
              <>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Paste this anywhere that accepts HTML. The iframe handles all rendering and auto-updates.
                </p>
                <CodeBlock code={iframeCode} />
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 10px', fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Preview</p>
                  <iframe
                    src={iframeUrl}
                    width="100%"
                    height="52"
                    style={{ border: 'none', display: 'block', borderRadius: 8 }}
                    title="Markee embed preview"
                  />
                </div>
              </>
            )}

            {tab === 'terminal' && (
              <>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Show the current top message in your Claude Code terminal status bar — the same way Kickbacks works, but for your Markee.
                </p>
                <CodeBlock code={statuslineScript} label="~/.markee/statusline.mjs — prints the ad line" />
                <CodeBlock code={updateScript}    label="~/.markee/update.mjs — fetches & caches the message" />
                <CodeBlock code={settingsJson}    label="~/.claude/settings.json — wires the status line" />
                <CodeBlock code={cronLine}        label="crontab — keeps the cache fresh" />
                <p style={{ margin: 0, color: MUTED, fontSize: 12.5, lineHeight: 1.6 }}>
                  The status line script never makes network requests — it only reads the local cache file. All traffic from your machine is the 10-minute cron fetch to the embed API.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div>
      {/* Hero skeleton */}
      <section style={{ background: HERO_GRAD, padding: '44px 40px 30px', borderBottom: `1px solid ${BORDER}`, position: 'relative', overflow: 'hidden' }}>
        <HeroBackground />
        <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ height: 18, width: 180, background: 'rgba(138,143,191,0.12)', borderRadius: 4, marginBottom: 16 }} />
          <div style={{ height: 200, background: 'rgba(138,143,191,0.07)', borderRadius: 16 }} />
        </div>
        <div style={{ maxWidth: 1100, margin: '28px auto 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 24, paddingTop: 26, borderTop: `1px solid ${BORDER}` }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 52, background: 'rgba(138,143,191,0.07)', borderRadius: 6 }} />
          ))}
        </div>
      </section>
      {/* Table skeleton */}
      <section style={{ padding: '8px 40px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '40px auto 0' }}>
          <div style={{ height: 30, width: 200, background: 'rgba(138,143,191,0.1)', borderRadius: 4, marginBottom: 20 }} />
          <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: LB_COLS, gap: 16, padding: '13px 16px', borderBottom: `1px solid ${BORDER}` }}>
                {[...Array(5)].map((_, j) => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MarkeeDetailPage() {
  const params = useParams()
  const leaderboardAddress = params.address as string
  const ethPrice = useEthPrice()
  const { address: connectedAddress } = useAccount()

  const { meta, markees: allMarkees, isLoading } = useLeaderboardDetail(leaderboardAddress)
  const markees = allMarkees.filter(m => m.totalFundsAdded > 0n)
  const ecoEntry = useServedOn(leaderboardAddress)

  // Views for all markees
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (!markees.length) return
    const addrs = markees.map(m => m.address.toLowerCase()).join(',')
    fetch(`/api/views?addresses=${addrs}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const map = new Map<string, number>()
        for (const [k, v] of Object.entries(data as Record<string, { totalViews: number }>)) {
          map.set(k.toLowerCase(), v.totalViews)
        }
        setViewsMap(map)
      })
      .catch(() => {})
  }, [markees.map(m => m.address).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  // Track + increment view for top markee
  useEffect(() => {
    const top = markees[0]
    if (!top?.message) return
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: top.address, message: top.message }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.totalViews !== undefined) setViewsMap(m => new Map(m).set(top.address.toLowerCase(), data.totalViews)) })
      .catch(() => {})
  }, [markees[0]?.address])  // eslint-disable-line react-hooks/exhaustive-deps

  // Modal state
  const [buyOpen,      setBuyOpen]      = useState(false)
  const [addFundsOpen, setAddFundsOpen] = useState(false)
  const [editOpen,     setEditOpen]     = useState(false)
  const [modalTarget,  setModalTarget]  = useState<LeaderboardMarkee | null>(null)

  const openBuy = useCallback(() => setBuyOpen(true), [])
  const openAddFunds = useCallback((m: LeaderboardMarkee) => { setModalTarget(m); setAddFundsOpen(true) }, [])
  const openEdit = useCallback((m: LeaderboardMarkee) => { setModalTarget(m); setEditOpen(true) }, [])

  const topMarkee  = markees[0] ?? null
  const topViews   = topMarkee ? (viewsMap.get(topMarkee.address.toLowerCase()) ?? 0) : 0
  const totalFunds = meta?.totalLeaderboardFunds ?? 0n

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="marketplace" useRegularLinks />

      {isLoading ? (
        <Skeleton />
      ) : !meta ? (
        // Truly not found
        <section style={{ maxWidth: 700, margin: '0 auto', padding: '120px 40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>Leaderboard not found</h1>
          <p style={{ color: TEXT2, fontSize: 16, margin: '14px 0 30px' }}>We couldn't find a Markee leaderboard at that address.</p>
          <a href="/marketplace" style={{ display: 'inline-block', background: PINK, color: BG, fontWeight: 700, padding: '12px 22px', borderRadius: 10, textDecoration: 'none', fontFamily: MONO, fontSize: 14 }}>← Back to Marketplace</a>
        </section>
      ) : !topMarkee ? (
        // Leaderboard exists but no messages yet
        <section style={{ maxWidth: 700, margin: '0 auto', padding: '120px 40px', textAlign: 'center' }}>
          {meta.leaderboardName && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>{meta.leaderboardName}</div>
          )}
          <h1 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>No messages yet</h1>
          <p style={{ color: TEXT2, fontSize: 16, margin: '14px 0 30px' }}>Be the first to buy a message and take the top spot.</p>
          <button
            onClick={openBuy}
            style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '13px 26px', fontWeight: 700, fontSize: 15, fontFamily: MONO, cursor: 'pointer', boxShadow: '0 4px 18px rgba(248,151,254,0.3)' }}
          >
            Buy First Message
          </button>
          <div style={{ marginTop: 20 }}>
            <a href="/marketplace" style={{ color: MUTED, fontSize: 14, textDecoration: 'none', fontFamily: MONO }}>← Back to Marketplace</a>
          </div>
        </section>
      ) : (
        <>
          {/* ── Hero ── */}
          <section style={{ position: 'relative', zIndex: 2, borderBottom: `1px solid ${BORDER}`, background: HERO_GRAD, padding: '44px 40px 30px', overflow: 'hidden' }}>
            <HeroBackground />
            {/* scanlines */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'overlay' }} />

            <FeaturedCard markee={topMarkee} topViews={topViews} ethPrice={ethPrice} onBuy={openBuy} />
            <div style={{ height: 28 }} />
            <MetricsBar meta={{ totalLeaderboardFunds: totalFunds, address: leaderboardAddress }} topViews={topViews} markeeCount={markees.length} entry={ecoEntry} ethPrice={ethPrice} />
          </section>

          {/* ── Leaderboard table ── */}
          <section style={{ padding: '8px 40px 20px' }}>
            <div style={{ maxWidth: 1100, margin: '40px auto 0' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: -0.6, color: TEXT }}>Leaderboard</h2>
              <p style={{ margin: '0 0 20px', color: TEXT2, fontSize: 15 }}>The message with the most funds added takes the top spot.</p>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ minWidth: 720, background: BG2 }}>
                  {/* column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: LB_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center', borderLeft: '3px solid transparent' }}>
                    {['Bought by', 'Funds added', 'Current message', 'Views', ''].map((h, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{h}</span>
                    ))}
                  </div>
                  {markees.map((m, i) => (
                    <LeaderRow
                      key={m.address}
                      markee={m}
                      views={viewsMap.get(m.address.toLowerCase()) ?? 0}
                      ethPrice={ethPrice}
                      featured={i === 0}
                      isOwner={!!connectedAddress && m.owner.toLowerCase() === connectedAddress.toLowerCase()}
                      onAddFunds={openAddFunds}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Embed panel ── */}
          <section style={{ padding: '0 40px 8px' }}>
            <EmbedPanel address={leaderboardAddress} />
          </section>

          {/* ── Bottom CTAs ── */}
          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 40px 96px', display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={openBuy}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '13px 24px', fontWeight: 700, fontSize: 15, fontFamily: MONO, cursor: 'pointer', letterSpacing: 0.3, transition: 'transform 120ms, box-shadow 120ms', boxShadow: '0 4px 18px rgba(248,151,254,0.3)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(248,151,254,0.45)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 18px rgba(248,151,254,0.3)' }}
            >
              Buy a New Message
            </button>
            <a
              href="/create-a-markee"
              style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '13px 24px', fontWeight: 600, fontSize: 15, fontFamily: MONO, textDecoration: 'none', letterSpacing: 0.3, transition: 'border-color 120ms, color 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
            >
              Create Your Own Markee
            </a>
          </section>
        </>
      )}

      <Footer />

      {/* Buy modal — works even when leaderboard is empty */}
      {meta && (
        <BuyMessageModal
          isOpen={buyOpen}
          onClose={() => setBuyOpen(false)}
          onSuccess={() => setBuyOpen(false)}
          initialMode="create"
          strategyAddress={leaderboardAddress as `0x${string}`}
          topFundsAdded={topMarkee?.totalFundsAdded ?? 0n}
        />
      )}

      {/* Add Funds modal */}
      {modalTarget && (
        <BuyMessageModal
          isOpen={addFundsOpen}
          onClose={() => { setAddFundsOpen(false); setModalTarget(null) }}
          onSuccess={() => { setAddFundsOpen(false); setModalTarget(null) }}
          userMarkee={modalTarget as any}
          initialMode="addFunds"
          strategyAddress={modalTarget.pricingStrategy as `0x${string}`}
          topFundsAdded={topMarkee?.totalFundsAdded ?? 0n}
        />
      )}

      {/* Edit modal */}
      {modalTarget && (
        <BuyMessageModal
          isOpen={editOpen}
          onClose={() => { setEditOpen(false); setModalTarget(null) }}
          onSuccess={() => { setEditOpen(false); setModalTarget(null) }}
          userMarkee={modalTarget as any}
          initialMode="updateMessage"
          strategyAddress={modalTarget.pricingStrategy as `0x${string}`}
        />
      )}
    </div>
  )
}
