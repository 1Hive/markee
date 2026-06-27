'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useStreamingBoards, type StreamingBoardSummary } from '@/lib/contracts/useStreamingBoards'
import { ratePerSecToMonthly } from '@/lib/superfluid/streaming'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK   = '#F897FE'
const BLUE   = '#7C9CFF'
const GREEN  = '#1DB227'
const BG     = '#060A2A'
const BG2    = '#0A0F3D'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'
const MUTED  = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

function formatRate(weiPerSec: bigint): string {
  if (weiPerSec <= 0n) return '—'
  const eth = parseFloat(formatEther(ratePerSecToMonthly(weiPerSec)))
  if (eth < 0.00005) return '< 0.0001 ETH/mo'
  return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
}

function LightningIcon({ size = 12, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

const GRID = '1fr 2fr 150px'

function TableHeaders() {
  const cell: React.CSSProperties = { fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center' }}>
      <span style={cell}>Board</span>
      <span style={cell}>Top Message</span>
      <span style={{ ...cell, textAlign: 'right' }}>Top Rate</span>
    </div>
  )
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}` }}>
          {[1, 2, 3].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
        </div>
      ))}
    </>
  )
}

function BoardRow({ board }: { board: StreamingBoardSummary }) {
  const [hover, setHover] = useState(false)
  return (
    <Link
      href={`/ecosystem/platforms/streaming/${board.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '13px 14px',
        textDecoration: 'none', borderBottom: `1px solid ${BORDER}`,
        background: hover ? 'rgba(248,151,254,0.04)' : 'transparent', transition: 'background 120ms', alignItems: 'center',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: TEXT, minWidth: 0 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BORDER}`, background: 'rgba(29,178,39,0.14)' }}>
          <LightningIcon />
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {board.name || `${board.address.slice(0, 8)}…`}
        </span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {board.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
      </span>
      <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600, textAlign: 'right' }}>
        {formatRate(board.topRate)}
      </span>
    </Link>
  )
}

export default function StreamingPlatformPage() {
  const { boards, enabled, isLoading } = useStreamingBoards()
  const activeBoards = boards.filter(b => b.topRate > 0n)

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="raise" useRegularLinks />

      {/* Hero */}
      <section style={{ position: 'relative', padding: '72px 40px 56px', borderBottom: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <HeroBackground />
        <div style={{ maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flex: 1, minWidth: 280 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: BG2, border: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LightningIcon size={24} color={GREEN} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 800, color: TEXT, letterSpacing: -0.6, lineHeight: 1.1 }}>
                    Streaming
                  </h1>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(29,178,39,0.12)', border: `1px solid rgba(29,178,39,0.35)`, color: GREEN, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: GREEN, display: 'inline-block', animation: 'glowPulse 1.5s ease-in-out infinite' }} />
                    Live by the second
                  </span>
                </div>
                <p style={{ margin: 0, color: TEXT2, fontSize: 15, maxWidth: '60ch', lineHeight: 1.55 }}>
                  Boards where backers stream ETH by the second to hold the #1 message. The highest active
                  stream rate owns the top spot, and losing backers are refunded as they fall behind.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
              <Link href="/create-a-markee?platform=streaming" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: PINK, color: BG, borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 18px rgba(248,151,254,0.35)' }}>
                Create a streaming board →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Boards */}
      <section style={{ padding: '44px 40px 80px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <LightningIcon size={16} color={GREEN} />
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Streaming Boards</span>
          </div>

          <div style={{ background: BG2, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <TableHeaders />
            {!enabled ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                Streaming boards aren&apos;t live on this network yet.
              </div>
            ) : isLoading ? (
              <SkeletonRows count={4} />
            ) : activeBoards.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: MUTED, fontSize: 14 }}>
                No streamed messages yet. Create a board and open the first stream to claim #1.
              </div>
            ) : (
              activeBoards.map(b => <BoardRow key={b.address} board={b} />)
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
