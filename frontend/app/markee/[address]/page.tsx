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
import { VerifyIntegrationModal } from '@/components/modals/VerifyIntegrationModal'
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

function CodeBlock({ code, label, hideCopy }: { code: string; label?: string; hideCopy?: boolean }) {
  const showHeader = label || !hideCopy
  return (
    <div>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>
            {label ?? ''}
          </span>
          {!hideCopy && <CopyButton text={code} />}
        </div>
      )}
      <div style={{ background: '#030714', border: `1px solid rgba(138,143,191,0.15)`, borderRadius: 10, padding: '14px 16px', maxHeight: 220, overflowY: 'auto' as const }}>
        <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, color: TEXT2, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, lineHeight: 1.65 }}>
          {code}
        </pre>
      </div>
    </div>
  )
}

function EmbedPanel({ address, name, platform }: { address: string; name?: string; platform?: string }) {
  const [open, setOpen]           = useState(false)
  const [btnHover, setBtnHover]   = useState(false)
  const [websiteOpen, setWebsiteOpen] = useState(false)

  const isGithub    = platform === 'github'
  const displayName = name || address
  const buyUrl      = `https://markee.xyz/markee/${address}`
  const apiUrl      = `https://markee.xyz/api/ecosystem/leaderboards`
  const dataAttr    = `data-markee-address="${address}"`
  const addrLower   = address.toLowerCase()

  const delimiterSnippet = `<!-- MARKEE:START:${addrLower} -->
<!-- MARKEE:END:${addrLower} -->`

  const githubExtension = `
## GitHub markdown integration

This leaderboard is linked to a GitHub repo. In addition to the buy-flow modal above, implement the following two server-side routes so that the markdown file stays in sync with the current top message and view counts are tracked.

### 1. Delimiter

The markdown file must contain these two HTML comments to mark where the Markee block is rendered. Everything between them is replaced automatically when a new message is purchased:

\`\`\`
<!-- MARKEE:START:${addrLower} -->
<!-- MARKEE:END:${addrLower} -->
\`\`\`

Place them anywhere in a markdown file in the repo (README.md is typical). Commit the empty delimiters first, then register the file in the Markee dashboard.

### 2. Message sync route

Create app/api/markee/sync/route.ts. Call POST /api/markee/sync after every successful purchase to update the markdown file on GitHub.

\`\`\`ts
// app/api/markee/sync/route.ts
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'

const LEADERBOARD_ADDRESS = '${addrLower}'
const REPO_FULL_NAME      = '' // e.g. 'acme/my-repo'
const FILE_PATH           = '' // e.g. 'README.md'
const GITHUB_TOKEN        = process.env.GITHUB_TOKEN ?? ''
const LEADERBOARD_URL     = '${buyUrl}'

const client = createPublicClient({ chain: base, transport: http() })

const LEADERBOARD_ABI = [
  { inputs: [{ name: 'limit', type: 'uint256' }], name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view', type: 'function' },
] as const
const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name',    outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

// Counts display columns for Unicode/emoji (emoji = 2 cols, ASCII = 1 col)
function wcwidth(str: string): number {
  let w = 0
  for (const cp of [...str]) {
    const c = cp.codePointAt(0) ?? 0
    if ((c >= 0x1F300 && c <= 0x1F9FF) || (c >= 0x2E80 && c <= 0x303E) ||
        (c >= 0x3040 && c <= 0x33FF)   || (c >= 0x4E00 && c <= 0xA4CF) ||
        (c >= 0xAC00 && c <= 0xD7FF)   || (c >= 0xFF00 && c <= 0xFF60)) {
      w += 2
    } else { w += 1 }
  }
  return w
}

function padToWidth(str: string, width: number) {
  return str + ' '.repeat(Math.max(0, width - wcwidth(str)))
}

function centerPad(str: string, width: number) {
  const tot  = Math.max(0, width - wcwidth(str))
  const left = Math.floor(tot / 2)
  return ' '.repeat(left) + str + ' '.repeat(tot - left)
}

function wrapMessage(str: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = '', currentWidth = 0
  for (const word of str.split(' ')) {
    const ww = wcwidth(word)
    if (currentWidth === 0) { current = word; currentWidth = ww }
    else if (currentWidth + 1 + ww <= maxWidth) { current += ' ' + word; currentWidth += 1 + ww }
    else { lines.push(current); current = word; currentWidth = ww }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function buildBlock(message: string, footerText: string): string {
  const INNER     = 54
  const MSG_WIDTH = INNER - 6
  const border    = '═'.repeat(INNER)
  const blank     = \`  ║ \${''.padStart(INNER - 2)} ║\`
  const HDR       = ['⡷⢾ ⣎⣱ ⣏⡱ ⣇⠜ ⣏⡉ ⣏⡉', '⠇⠸ ⠇⠸ ⠇⠱ ⠇⠱ ⠧⠤ ⠧⠤']
    .map(h => \`  ║                  \${h}                 ║\`).join('\\n')
  const msgLines  = wrapMessage(message, MSG_WIDTH)
    .map(l => \`  ║   \${padToWidth(l, MSG_WIDTH)}   ║\`).join('\\n')
  return \`<!-- MARKEE:START:${addrLower} -->
\\\`\\\`\\\`
  ╔\${border}╗
\${HDR}
  ╠\${border}╣
\${blank}
\${msgLines}
\${blank}
  ╠\${border}╣
  ║ \${centerPad(footerText, INNER - 2)} ║
  ╚\${border}╝
                 ││                      ││
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
\\\`\\\`\\\`
*Show the world you support this repo! [Change this message at markee.xyz](\${LEADERBOARD_URL}) ^*
<!-- MARKEE:END:${addrLower} -->\`
}

export async function POST() {
  const [topAddresses, topFunds] = await client.readContract({
    address: LEADERBOARD_ADDRESS as \`0x\${string}\`,
    abi: LEADERBOARD_ABI,
    functionName: 'getTopMarkees',
    args: [1n],
  })
  const topAddr = topAddresses[0]
  const topFund = topFunds[0] ?? 0n
  let markeeBlock: string
  if (topAddr) {
    const [msg] = await Promise.all([
      client.readContract({ address: topAddr as \`0x\${string}\`, abi: MARKEE_ABI, functionName: 'message' }),
    ])
    const nextEth = formatEther(topFund + BigInt('1000000000000000'))
    markeeBlock = buildBlock(msg ?? '', \`\${nextEth} ETH to change\`)
  } else {
    const minEth = formatEther(topFund + BigInt('1000000000000000'))
    markeeBlock = buildBlock('This space is available!', \`Add your message for \${minEth} ETH\`)
  }

  const START = \`<!-- MARKEE:START:${addrLower} -->\`
  const END   = \`<!-- MARKEE:END:${addrLower} -->\`

  const fileRes = await fetch(
    \`https://api.github.com/repos/\${REPO_FULL_NAME}/contents/\${encodeURIComponent(FILE_PATH)}\`,
    { headers: { Authorization: \`Bearer \${GITHUB_TOKEN}\`, Accept: 'application/vnd.github+json' } }
  )
  if (!fileRes.ok) return Response.json({ error: 'Fetch failed' }, { status: fileRes.status })

  const fileData = await fileRes.json()
  const current  = Buffer.from(fileData.content, 'base64').toString('utf-8')
  const si = current.indexOf(START), ei = current.indexOf(END)
  if (si === -1 || ei === -1 || ei <= si) return Response.json({ error: 'Delimiters not found' }, { status: 400 })

  const updated = current.slice(0, si) + markeeBlock + current.slice(ei + END.length)
  const putRes  = await fetch(
    \`https://api.github.com/repos/\${REPO_FULL_NAME}/contents/\${encodeURIComponent(FILE_PATH)}\`,
    {
      method: 'PUT',
      headers: { Authorization: \`Bearer \${GITHUB_TOKEN}\`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'markee: update sponsored message', content: Buffer.from(updated).toString('base64'), sha: fileData.sha }),
    }
  )
  return Response.json({ ok: putRes.ok }, { status: putRes.ok ? 200 : putRes.status })
}
\`\`\`

Call POST /api/markee/sync from the onSuccess callback in MarkeeSign after a confirmed transaction.

Fill in REPO_FULL_NAME (e.g. "acme/my-repo"), FILE_PATH (e.g. "README.md"), and set GITHUB_TOKEN in your environment (a fine-grained PAT with Contents: read & write on this repo). GITHUB_TOKEN must be a server-side env var (no NEXT_PUBLIC_ prefix).

### 3. View tracking route

Create app/api/markee/views/route.ts to surface GitHub traffic data for this repo:

\`\`\`ts
// app/api/markee/views/route.ts
const REPO_FULL_NAME = '' // e.g. 'acme/my-repo'
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN ?? ''

export async function GET() {
  const res = await fetch(
    \`https://api.github.com/repos/\${REPO_FULL_NAME}/traffic/views\`,
    {
      headers: {
        Authorization: \`Bearer \${GITHUB_TOKEN}\`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 3600 },
    }
  )
  if (!res.ok) return Response.json({ count: 0, uniques: 0, views: [] }, { status: res.status })
  return Response.json(await res.json())
}
\`\`\`

Fetch GET /api/markee/views in MarkeeSign to show a view count badge alongside the current message. The response shape is { count: number, uniques: number, views: [{ timestamp, count, uniques }] }. Display count (total views over the past 14 days) next to the message. GitHub's traffic API requires the token owner to have push access to the repo.`

  // Extract the two TypeScript code blocks from githubExtension for display as separate steps
  const ghCodeBlocks = [...githubExtension.matchAll(/```ts\n([\s\S]*?)\n```/g)]
  const syncCode         = ghCodeBlocks[0]?.[1] ?? ''
  const githubViewsCode  = ghCodeBlocks[1]?.[1] ?? ''

  const llmPrompt = `I want to add a full Markee buy-flow modal to my Next.js site -- not just a display widget, but an embedded modal where visitors can buy or boost a message without leaving my site.

My leaderboard:
- Name: ${displayName}
- Address: ${address}
- Buy page (fallback for non-Next.js sites): ${buyUrl}

## What to build

Two components:

1. A trigger component (e.g. MarkeeSign) that:
   - Fetches and displays the current top message from /api/markee/leaderboards (see proxy route below)
   - Shows the owner name below the message (truncate 0x addresses to 0x1234...abcd, show plain names as-is)
   - On hover reveals a price badge: "X.XXX ETH to change" or "be first!" if no messages yet
   - Opens the modal when clicked
   - Is disabled only while loading (never on fetch error -- fall back to default message and let the modal open)
   - Wraps its container with ${dataAttr} for integration verification
   - After a successful transaction, waits 3 seconds then re-fetches to show the new message

2. A modal component (e.g. MarkeeModal) that is a full buy flow with:
   - A header with the site logo, title, and close button
   - The current top message displayed above the tabs
   - Two tabs: "Buy a Message" and "Boost Existing Message"
   - A footer: "You'll receive MARKEE tokens with your purchase and co-own the Markee Network." (link "Markee Network" to the Gardens community for this leaderboard if applicable)

### Buy a Message tab
- Textarea for the message (left-aligned, monospace, char counter, maxLength from contract)
- Optional name input
- ETH amount section:
  - "Take top spot" preset button (shows only when there is an existing top message)
  - "Minimum" preset button
  - Custom number input, capped at 8 total digit characters (before + after decimal)
  - Clickable balance label that fills the field with the user's full balance, floored to fit within the 8-digit cap and never exceeding actual balance
  - Inline "Amount exceeds your balance" warning below the input (not just on submit)
- Wrong network banner with "Switch to Base" button (always visible when connected to wrong chain)
- Low balance banner when connected balance is below the minimum price
- Connect Wallet button (closes dialog before opening RainbowKit modal so it appears on top; dialog reopens when the connect modal closes)
- Buy Message submit button (disabled when loading, insufficient balance, or low balance)

### Boost Existing Message tab
- List of top messages read directly from the contract via getTopMarkees(10) + useReadContracts for message/name per address -- do NOT use the API for this, the API only returns the top 1
- Each entry shows: message, owner name, ETH funded, #1 badge for top entry
- Clicking an entry selects it (highlighted border)
- When an entry is selected and it already holds the top spot, show a note: "This message has the top spot. Add more funds to make it harder to reach."
- "Edit messages you own on the Markee app." link (or "See more messages and edit messages you own." if > 5 entries) shown ABOVE the payment section, linking to ${buyUrl}
- Amount to Pay section (no Minimum button, only Take Top Spot + custom input)
  - Take top spot amount for the selected entry = topFundsAdded - selectedEntryFunds + 0.001 ETH
  - If the selected entry IS already the top, HIDE the Take Top Spot button entirely -- show only the custom input and the note above it
- Destructure isError from both useReadContract (getTopMarkees) and useReadContracts (per-markee data); if either errors, show an error message in the boost tab instead of the list
- "Add Funds to this Message" submit button

### Success state
When a transaction confirms, replace the entire modal body (below the header) with:
- A large checkmark
- "Transaction confirmed!"
- "View on Basescan" link to https://basescan.org/tx/{hash}
- "Refreshing in a moment..." note
The modal stays open. The close button remains visible in the header. When the user closes the modal after a successful transaction, trigger the data refresh (call the onSuccess callback from handleClose only when isSuccess is true).

## Contract interactions

All on Base (chainId 8453).

Leaderboard contract: ${address}

ABI functions needed:
- minimumPrice() view -> uint256
- maxMessageLength() view -> uint256
- getTopMarkees(limit: uint256) view -> (address[], uint256[]) -- top markee addresses + their funds
- createMarkee(message: string, name: string) payable -> address  -- buys a new message
- addFunds(markeeAddress: address) payable  -- boosts an existing message

Per-markee ABI (call on each markee contract address returned by getTopMarkees):
- message() view -> string
- name() view -> string

## Data fetching

### Proxy route (required -- avoids CORS)
Create app/api/markee/leaderboards/route.ts:
  export async function GET() {
    const res = await fetch('${apiUrl}', { next: { revalidate: 60 } })
    if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
    return Response.json(await res.json())
  }

Then fetch /api/markee/leaderboards in the trigger component.
Find the entry where address matches "${address}" (case-insensitive).
Fields: topMessage, topMessageOwner, topFundsAddedRaw, minimumPrice, topMarkeeAddress

### On-chain reads
Use wagmi useReadContract / useReadContracts for:
- minimumPrice, maxMessageLength (in both components or passed as props)
- getTopMarkees(10n) -- in the boost tab only (enable query only when on that tab)
- Per-markee message + name via useReadContracts multicall on the returned addresses

### Network detection
Use useAccount().chainId (not useChainId()) -- it is bound to the connected account and stays accurate in multi-wallet-extension environments.
const { address, isConnected, chainId } = useAccount()
const isOnBase = isConnected && chainId === base.id

### Wallet connect and dialog z-index
The modal should use the native <dialog> element with showModal(). When opening the RainbowKit connect modal, the dialog must be closed first so RainbowKit appears on top. Handle this in the trigger component (MarkeeSign), not MarkeeModal:
  // In MarkeeSign:
  const [pendingReopenModal, setPendingReopenModal] = useState(false)
  function handleConnectWallet() {
    dialogRef.current?.close()
    setPendingReopenModal(true)
    openConnectModal?.()
  }
  // Reopen the dialog once the connect modal has closed:
  useEffect(() => {
    if (pendingReopenModal && !connectModalOpen) {
      dialogRef.current?.showModal()
      setPendingReopenModal(false)
    }
  }, [pendingReopenModal, connectModalOpen])
Pass handleConnectWallet as a prop to MarkeeModal. MarkeeModal calls it when the user clicks "Connect Wallet" -- MarkeeModal itself does not manage the dialog open/close.

## View tracking

Add a proxy route to forward view increments to Markee:

// app/api/markee/views/route.ts
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.address || !body?.message) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }
  const res = await fetch('https://markee.xyz/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return Response.json(await res.json())
}

In MarkeeSign, fire this once per session per markee when the top message is first displayed:
  const viewTracked = useRef(false)
  useEffect(() => {
    if (!topMessage || !topMarkeeAddress || viewTracked.current) return
    viewTracked.current = true
    fetch('/api/markee/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: topMarkeeAddress, message: topMessage }),
    }).catch(() => {})
  }, [topMessage, topMarkeeAddress])

The API rate-limits to 1 increment per IP per markee per hour, so calling this on every page load is safe.

## Moderation

Add a proxy route to fetch the flagged content list:

// app/api/markee/moderation/route.ts
export async function GET() {
  const res = await fetch('https://markee.xyz/api/moderation', { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ flagged: [] })
  return Response.json(await res.json())
}

In MarkeeSign (and in MarkeeModal's boost tab), fetch this once on mount and build a Set:
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/markee/moderation')
      .then(r => r.json())
      .then(d => setFlagged(new Set((d.flagged ?? []) as string[])))
      .catch(() => {})
  }, [])
  function isFlagged(markeeAddr: string) {
    return flagged.has(\`8453:\${markeeAddr.toLowerCase()}\`)
  }

Flagging behavior:
- MarkeeSign: if isFlagged(topMarkeeAddress), show "Content unavailable" instead of the message. Still allow the modal to open so users can buy a new top message.
- MarkeeModal Boost tab: omit flagged entries from the list. If all are flagged, show "No messages available."
- MarkeeModal Buy tab: always show the current top message (users can replace it by outbidding), even if flagged.

## Optional: health endpoint

Add this route so the Markee integration dashboard can verify your setup:

// app/api/markee/health/route.ts
export async function GET() {
  return Response.json({
    overall: 'ok',
    checks: {
      leaderboards: { status: 'ok' },
      views: { status: 'ok' },
      moderation: { status: 'ok' },
    },
  })
}

## Packages required
- wagmi v2
- viem v2
- @rainbow-me/rainbowkit v2
- @tanstack/react-query v5

Wrap the app in (order matters):
WagmiProvider -> QueryClientProvider -> RainbowKitProvider

wagmi config: getDefaultConfig({ appName, projectId, chains: [base], ssr: true })
Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment (get a free ID at cloud.walletconnect.com).

## Implementation notes
- The data-markee-address attribute must be in the server-rendered HTML for verification. In Next.js, placing it in JSX inside a 'use client' component is fine -- Next.js SSRs client components. Avoid setting it only via useEffect or document.setAttribute() (those run client-side only and will fail verification).
- takeTopSpot passed to the modal = topFundsAdded + 0.001 ETH (MIN_INCREMENT). If no competition yet, use minimumPrice.
- Form state (message, name, ethAmount, boostAmount) must live in MarkeeSign (parent), not MarkeeModal. The <dialog> element unmounts/remounts when closed and reopened during wallet connect, so state inside MarkeeModal will be lost. Lift all form inputs to the parent and pass them down as props.
- On fetch error from the proxy route, fall back to the default message and still allow the modal to open -- the modal works fully from on-chain data alone.
- NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required. Optionally set NEXT_PUBLIC_BASE_RPC_URL for a custom transport in the wagmi config (e.g. an Alchemy or Infura endpoint).
- Style to match your site's existing design system. The pattern works with any CSS framework.

Please look at this codebase and implement both components. Choose an appropriate location for the trigger (sidebar widget, footer, header banner). Match the existing code style.`

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
          {isGithub ? (
            <>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Add these routes to your repo to sync messages and track views. Fill in <span style={{ fontFamily: MONO, color: PINK }}>REPO_FULL_NAME</span>, <span style={{ fontFamily: MONO, color: PINK }}>FILE_PATH</span>, and set <span style={{ fontFamily: MONO, color: PINK }}>GITHUB_TOKEN</span> (a fine-grained PAT with Contents: read &amp; write).
                </p>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                <CodeBlock code={delimiterSnippet} label="Step 1 — add delimiters to your markdown file and commit" />
                <CodeBlock code={syncCode} label="Step 2 — message sync route (app/api/markee/sync/route.ts)" />
                <CodeBlock code={githubViewsCode} label="Step 3 — view tracking route (app/api/markee/views/route.ts)" />
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  <button
                    onClick={() => setWebsiteOpen(v => !v)}
                    style={{ background: 'transparent', border: 'none', color: TEXT2, fontSize: 13, fontFamily: MONO, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: websiteOpen ? 'rotate(90deg)' : 'none', transition: 'transform 140ms' }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    Also embed on a website
                  </button>
                  {websiteOpen && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Copy this prompt into any AI coding agent with access to your site</span>
                        <CopyButton text={llmPrompt} />
                      </div>
                      <CodeBlock code={llmPrompt} hideCopy />
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <p style={{ margin: 0, color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                  Copy this prompt into any AI coding agent with access to your repo.
                </p>
                <CopyButton text={llmPrompt} />
              </div>
              <div style={{ padding: 20 }}>
                <CodeBlock code={llmPrompt} hideCopy />
              </div>
            </>
          )}
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
  }, [markees[0]?.address, !!markees[0]?.message])  // eslint-disable-line react-hooks/exhaustive-deps

  // Modal state
  const [buyOpen,      setBuyOpen]      = useState(false)
  const [addFundsOpen, setAddFundsOpen] = useState(false)
  const [editOpen,     setEditOpen]     = useState(false)
  const [modalTarget,  setModalTarget]  = useState<LeaderboardMarkee | null>(null)
  const [verifyOpen,   setVerifyOpen]   = useState(false)

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
            <EmbedPanel address={leaderboardAddress} name={meta.leaderboardName} platform={ecoEntry?.platform} />
            {(!ecoEntry?.platform || ecoEntry.platform === 'openinternet') && (
              <div style={{ maxWidth: 1100, margin: '10px auto 0' }}>
                <button
                  onClick={() => setVerifyOpen(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: `1px solid ${BORDER}`,
                    borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
                    fontFamily: MONO, fontSize: 13, color: TEXT2,
                    transition: 'border-color 140ms, color 140ms',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Verify Integration
                </button>
              </div>
            )}
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

      {/* Verify integration modal */}
      {meta && (
        <VerifyIntegrationModal
          isOpen={verifyOpen}
          onClose={() => setVerifyOpen(false)}
          leaderboard={{
            address: leaderboardAddress,
            name: meta.leaderboardName ?? leaderboardAddress,
            verifiedUrls: ecoEntry?.verifiedUrls ?? (ecoEntry?.verifiedUrl ? [ecoEntry.verifiedUrl] : []),
          }}
        />
      )}
    </div>
  )
}
