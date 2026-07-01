'use client'

import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { StrategyBadge } from '@/components/StrategyBadge'
import { imputeEffectiveRate, type Strategy } from '@/lib/strategy'

// ── Design tokens ─────────────────────────────────────────────────────────────
const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK   = '#F897FE'
const BLUE   = '#7C9CFF'
const BG     = '#060A2A'
const BG2    = '#0A0F3D'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'
const MUTED  = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

// ── Types ─────────────────────────────────────────────────────────────────────
interface GithubLeaderboard {
  address: string
  name: string
  totalFundsRaw: string
  markeeCount: number
  topFundsAddedRaw: string
  topMessage: string | null
  topMessageOwner: string | null
  topMarkeeAddress: string | null
  repoVerified: boolean
  repoFullName: string | null
  repoAvatarUrl: string | null
  githubTrafficViews: number | null
  strategy?: Strategy
  effectiveRateRaw?: string
}

function rowEffectiveRate(lb: GithubLeaderboard): bigint {
  return lb.strategy === 'streaming'
    ? BigInt(lb.effectiveRateRaw || '0')
    : imputeEffectiveRate(BigInt(lb.totalFundsRaw || '0'))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatViews(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function priceToChange(lb: GithubLeaderboard): bigint {
  return BigInt(lb.topFundsAddedRaw || '0') + BigInt('1000000000000000')
}

// ── GitHub octocat SVG ────────────────────────────────────────────────────────
function GithubIcon({ size = 13, color = TEXT2 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  )
}

// ── Eye SVG ───────────────────────────────────────────────────────────────────
function EyeIcon({ size = 10, color = MUTED }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

// ── Table row ─────────────────────────────────────────────────────────────────
function TableRow({
  lb,
  ethPrice,
  onBuy,
}: {
  lb: GithubLeaderboard
  ethPrice: number | null
  onBuy: () => void
}) {
  const [hover, setHover] = useState(false)
  const views = lb.githubTrafficViews ?? 0
  const isStreaming = lb.strategy === 'streaming'

  const totalEth = parseFloat(formatEther(BigInt(lb.totalFundsRaw || '0')))
  const totalLabel = ethPrice ? formatUsd(totalEth * ethPrice) : `${totalEth.toFixed(3)} ETH`

  const priceEth = parseFloat(formatEther(priceToChange(lb)))
  const priceLabel = ethPrice ? formatUsd(priceEth * ethPrice) : `${priceEth.toFixed(3)} ETH`

  const hasTopFunds = BigInt(lb.topFundsAddedRaw || '0') > 0n

  const boxStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 6,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${BORDER}`,
    overflow: 'hidden',
  }

  return (
    <a
      href={`/markee/${lb.address}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '190px 110px 1fr 74px 120px',
        gap: 16,
        padding: '11px 14px',
        textDecoration: 'none',
        borderBottom: `1px solid ${BORDER}`,
        background: hover ? 'rgba(248,151,254,0.04)' : 'transparent',
        transition: 'background 120ms',
        cursor: 'pointer',
        alignItems: 'center',
      }}
    >
      {/* SERVED ON */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: TEXT2, minWidth: 0 }}>
        {lb.repoAvatarUrl ? (
          <span style={boxStyle}>
            <img src={lb.repoAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
        ) : (
          <span style={{ ...boxStyle, background: 'rgba(237,238,255,0.08)' }}>
            <GithubIcon />
          </span>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lb.repoFullName || lb.name}
        </span>
      </span>

      {/* TOTAL RAISED */}
      <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {totalLabel}
      </span>

      {/* CURRENT MESSAGE */}
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <StrategyBadge strategy={lb.strategy ?? 'fixed'} size="xs" />
        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {lb.topMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</span>}
        </div>
      </div>

      {/* VIEWS */}
      <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        <EyeIcon />
        {views > 0 ? formatViews(views) : '—'}
      </span>

      {/* PRICE TO CHANGE */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {isStreaming ? (
          <span style={{ width: '100%', textAlign: 'center', background: 'transparent', color: PINK, border: `1px solid ${PINK}`, borderRadius: 7, padding: '8px 10px', fontFamily: MONO, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>
            Stream →
          </span>
        ) : hasTopFunds ? (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onBuy() }}
            style={{
              width: '100%',
              textAlign: 'center',
              background: PINK,
              color: BG,
              border: 'none',
              borderRadius: 7,
              padding: '8px 10px',
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 10px rgba(248,151,254,0.28)',
              transition: 'transform 120ms, box-shadow 120ms',
            }}
            onMouseEnter={e => {
              e.stopPropagation()
              const el = e.currentTarget as HTMLElement
              el.style.transform = 'translateY(-1px)'
              el.style.boxShadow = '0 6px 18px rgba(248,151,254,0.45)'
            }}
            onMouseLeave={e => {
              e.stopPropagation()
              const el = e.currentTarget as HTMLElement
              el.style.transform = 'none'
              el.style.boxShadow = '0 2px 10px rgba(248,151,254,0.28)'
            }}
          >
            {priceLabel}
          </button>
        ) : (
          <span style={{ color: MUTED, fontFamily: MONO, fontSize: 12, textAlign: 'right', width: '100%', display: 'block' }}>—</span>
        )}
      </div>
    </a>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GithubPlatformPage() {
  const ethPrice = useEthPrice()
  const [leaderboards, setLeaderboards] = useState<GithubLeaderboard[]>([])
  const [streamRows, setStreamRows] = useState<GithubLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [loading, setLoading] = useState(true)
  const [buyModal, setBuyModal] = useState<{ address: string; topFundsAdded: bigint } | null>(null)

  useEffect(() => {
    fetch(`/api/github/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setLeaderboards(data.leaderboards ?? [])
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Streaming boards placed on the GitHub vertical (empty unless the streaming factory is configured).
  useEffect(() => {
    fetch(`/api/streaming/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const rows: GithubLeaderboard[] = (data.leaderboards ?? [])
          .filter((l: any) => l.platform === 'github')
          .map((l: any) => ({
            address: l.address,
            name: l.name,
            totalFundsRaw: l.totalFundsRaw ?? '0',
            markeeCount: l.markeeCount ?? 0,
            topFundsAddedRaw: l.topFundsAddedRaw ?? '0',
            topMessage: l.topMessage ?? null,
            topMessageOwner: l.topMessageOwner ?? null,
            topMarkeeAddress: l.topMarkeeAddress ?? null,
            repoVerified: false,
            repoFullName: null,
            repoAvatarUrl: null,
            githubTrafficViews: null,
            strategy: 'streaming' as const,
            effectiveRateRaw: l.effectiveRateRaw ?? '0',
          }))
        setStreamRows(rows)
      })
      .catch(() => {})
  }, [])

  // Fixed-price and streaming rank together on effectiveRate (imputed for fixed, on-chain for streaming).
  const tableRows = [...leaderboards.map(lb => ({ ...lb, strategy: lb.strategy ?? ('fixed' as const) })), ...streamRows]
    .filter(lb => BigInt(lb.topFundsAddedRaw || '0') > 0n && lb.topMessage)
    .sort((a, b) => {
      const ar = rowEffectiveRate(a)
      const br = rowEffectiveRate(b)
      return br > ar ? 1 : br < ar ? -1 : 0
    })

  const totalEth = parseFloat(totalPlatformFunds)
  const totalLabel = ethPrice
    ? formatUsd(totalEth * ethPrice)
    : `${totalEth.toFixed(3)} ETH`

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="raise" useRegularLinks />

      {/* ── Hero ── */}
      <section style={{ position: 'relative', padding: '72px 40px 56px', borderBottom: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <HeroBackground />
        <div style={{ maxWidth: 1240, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
            {/* Left */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flex: 1, minWidth: 280 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: BG2,
                border: `1px solid ${BORDER}`,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <GithubIcon size={22} color={TEXT} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 800, color: TEXT, letterSpacing: -0.6, lineHeight: 1.1 }}>
                  GitHub Repos
                </h1>
                <p style={{ margin: '10px 0 0', color: TEXT2, fontSize: 16, maxWidth: '54ch', lineHeight: 1.55 }}>
                  Raise funds for your open source project by adding a Markee message to any markdown file in your repository.
                </p>
              </div>
            </div>

            {/* Right CTAs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Link
                href="/create-a-markee?platform=github"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: PINK,
                  color: BG,
                  borderRadius: 8,
                  padding: '11px 20px',
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 18px rgba(248,151,254,0.35)',
                }}
              >
                Create a GitHub Markee →
              </Link>
              <Link
                href="/marketplace"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'transparent',
                  color: TEXT2,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                See All Markees →
              </Link>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 32, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
              <span style={{ color: PINK, fontWeight: 700, fontFamily: MONO }}>{leaderboards.length}</span>
              <span style={{ color: MUTED }}>active signs</span>
            </div>
            <span style={{ color: BORDER, userSelect: 'none' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
              <span style={{ color: BLUE, fontWeight: 700, fontFamily: MONO }}>{totalLabel}</span>
              <span style={{ color: MUTED }}>total raised</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ background: BG2, padding: '52px 40px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 36 }}>
            {[
              {
                step: '1',
                title: 'Connect GitHub & Create a Markee',
                body: 'Link your repo via OAuth so Markee can verify ownership, then deploy your sign onchain.',
              },
              {
                step: '2',
                title: 'Add Tags to a File',
                body: "Drop your sign's address-specific tags into any markdown file. Place them anywhere you want the sponsored message to appear.",
              },
              {
                step: '3',
                title: 'Start Earning',
                body: 'Buyers compete to set the message that everyone viewing your file will see — human or agent.',
              },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ display: 'flex', gap: 16 }}>
                <div style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 99,
                  background: 'rgba(248,151,254,0.12)',
                  border: `1px solid rgba(248,151,254,0.35)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: PINK,
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: MONO,
                }}>
                  {step}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</h3>
                  <p style={{ margin: 0, color: MUTED, fontSize: 13.5, lineHeight: 1.6 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Table section ── */}
      <section style={{ padding: '44px 40px 80px', maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: PINK, marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, display: 'inline-block', flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            GitHub Markees
          </div>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px,2.8vw,30px)', fontWeight: 800, color: TEXT, letterSpacing: -0.4 }}>
            Active Signs
          </h2>
        </div>

        <div style={{ background: BG2, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '190px 110px 1fr 74px 120px',
            gap: 16,
            padding: '11px 14px',
            borderBottom: `1px solid ${BORDER}`,
            background: BG,
            alignItems: 'center',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Served On</span>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Total Raised</span>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Current Message</span>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>Views</span>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED, textAlign: 'right' as const }}>Price to Change</span>
          </div>

          {/* Rows */}
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '190px 110px 1fr 74px 120px', gap: 16, padding: '11px 14px', borderBottom: `1px solid ${BORDER}` }}>
                {[1, 2, 3, 4, 5].map(j => (
                  <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />
                ))}
              </div>
            ))
          ) : tableRows.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{
                display: 'inline-block',
                padding: '32px 40px',
                background: BG,
                borderRadius: 14,
                border: `1px solid ${BORDER}`,
              }}>
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                  <GithubIcon size={32} color={MUTED} />
                </div>
                <p style={{ margin: 0, color: TEXT, fontWeight: 600, fontSize: 15, marginBottom: 6 }}>No signs yet</p>
                <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>Be the first to create a Markee for your repo.</p>
              </div>
            </div>
          ) : (
            tableRows.map(lb => (
              <TableRow
                key={lb.address}
                lb={lb}
                ethPrice={ethPrice}
                onBuy={() => setBuyModal({ address: lb.address, topFundsAdded: BigInt(lb.topFundsAddedRaw || '0') })}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Raise Funding CTA ── */}
      <section style={{
        background: 'linear-gradient(135deg, rgba(124,156,255,0.12), rgba(124,156,255,0.06))',
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        padding: '64px 40px',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px,3vw,34px)', fontWeight: 800, color: TEXT, letterSpacing: -0.5, marginBottom: 10 }}>
            Add a Markee to your GitHub repo
          </h2>
          <p style={{ margin: '0 0 28px', color: TEXT2, fontSize: 15, maxWidth: '48ch', lineHeight: 1.55 }}>
            Turn your repo README into a revenue stream. Buyers compete to post their message where your readers are.
          </p>
          <Link
            href="/create-a-markee?platform=github"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: PINK,
              color: BG,
              borderRadius: 8,
              padding: '13px 26px',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 20px rgba(248,151,254,0.35)',
            }}
          >
            Create a GitHub Markee →
          </Link>
        </div>
      </section>

      <Footer />

      {buyModal && (
        <BuyMessageModal
          isOpen={true}
          initialMode="create"
          strategyAddress={buyModal.address as `0x${string}`}
          topFundsAdded={buyModal.topFundsAdded}
          platformId="github"
          onClose={() => setBuyModal(null)}
          onSuccess={() => setBuyModal(null)}
        />
      )}
    </div>
  )
}
