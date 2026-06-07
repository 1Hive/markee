'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Globe2, Github, Zap, ExternalLink, Trophy, CheckCircle, Eye } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { CreateOpenInternetModal } from '@/components/modals/CreateOpenInternetModal'
import { NETWORK_PAUSED } from '@/lib/paused'
import { ModerationProvider } from '@/components/moderation'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'

const INITIAL_SHOW = 9

// ─── Types ────────────────────────────────────────────────────────────────────

interface EcosystemLeaderboard {
  address: string
  name: string
  platform: 'website' | 'github' | 'superfluid'
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  topMessage: string | null
  topMessageOwner: string | null
  creator: string | null
  admin: string | null
  minimumPrice: string
  minimumPriceRaw: string
  topFundsAddedRaw: string
  logoUrl?: string | null
  siteUrl?: string | null
  verifiedUrl?: string | null
  verifiedUrls?: string[]
  topMarkeeAddress?: string | null
  status?: 'pending' | 'verified'
  isLegacy?: boolean
  isCooperative?: boolean
  percentToBeneficiary?: number
  slug?: string
  repoAvatarUrl?: string | null
  repoFullName?: string | null
  repoHtmlUrl?: string | null
  repoVerified?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFunds(eth: string) {
  const n = parseFloat(eth)
  if (n === 0) return '0 ETH'
  if (n < 0.001) return '< 0.001 ETH'
  return `${n.toFixed(3)} ETH`
}

function hasRealPurchase(lb: EcosystemLeaderboard) {
  return BigInt(lb.topFundsAddedRaw ?? '0') > 0n
}

function platformIcon(platform: string, size = 14) {
  if (platform === 'github') return <Github size={size} className="text-[#8A8FBF]" />
  if (platform === 'superfluid') return <Zap size={size} className="text-[#1DB227]" />
  return <Globe2 size={size} className="text-[#F897FE]" />
}

function platformLabel(platform: string) {
  if (platform === 'github') return 'GitHub'
  if (platform === 'superfluid') return 'Superfluid'
  return 'Website'
}

function getDisplayPlatform(lb: EcosystemLeaderboard): 'website' | 'github' | 'superfluid' {
  if (lb.slug === 'superfluid') return 'superfluid'
  return lb.platform
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-[#0A0F3D] rounded-lg p-6 border border-[#8A8FBF]/20 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg bg-[#1A1F4D] flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#1A1F4D] rounded w-3/4" />
          <div className="h-3 bg-[#1A1F4D] rounded w-1/2" />
        </div>
      </div>
      <div className="h-24 bg-[#060A2A] rounded-lg mb-4" />
      <div className="h-8 bg-[#1A1F4D] rounded-lg" />
    </div>
  )
}

// ─── Ecosystem Card ───────────────────────────────────────────────────────────

function EcosystemCard({
  lb,
  onBuyLegacy,
  viewCount,
}: {
  lb: EcosystemLeaderboard
  onBuyLegacy?: (lb: EcosystemLeaderboard) => void
  viewCount?: number
}) {
  const router = useRouter()

  const logoSrc = lb.logoUrl ?? (lb.platform === 'github' ? lb.repoAvatarUrl : null)

  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const topFunds = BigInt(lb.topFundsAddedRaw ?? '0')
  const minPriceRaw = BigInt(lb.minimumPriceRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = (Number(buyPrice) / 1e18).toFixed(3)
  const messageCount = lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1)

  const displayPlatform = getDisplayPlatform(lb)

  const detailHref =
    lb.platform === 'superfluid' ? `/ecosystem/platforms/superfluid/${lb.address}` :
    lb.platform === 'github' ? `/ecosystem/platforms/github/${lb.address}` :
    lb.isLegacy && lb.slug ? `/ecosystem/${lb.slug}` :
    !lb.isLegacy ? `/ecosystem/website/${lb.address}` :
    null

  function handleCardClick() {
    if (detailHref) router.push(detailHref)
  }

  function handleBuyClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (lb.isLegacy && onBuyLegacy) onBuyLegacy(lb)
    else if (detailHref) router.push(detailHref)
  }

  const isClickable = !!detailHref

  return (
    <div
      onClick={isClickable ? handleCardClick : undefined}
      className={`bg-[#0A0F3D] p-6 rounded-lg border border-[#8A8FBF]/20 transition-colors
        ${isClickable ? 'cursor-pointer hover:border-[#F897FE]' : ''}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0 overflow-hidden">
          {logoSrc ? (
            <img src={logoSrc} alt={lb.name} className="w-9 h-9 object-contain" />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              {platformIcon(lb.platform, 22)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-[#EDEEFF] text-lg truncate">{lb.name}</h3>
            {lb.status === 'verified' && lb.verifiedUrl && (
              <a
                href={lb.verifiedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-[#1DB227] hover:text-[#1DB227]/80 transition-colors"
                title="Verified website"
              >
                <CheckCircle size={12} />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#8A8FBF] mt-0.5">
            {platformIcon(displayPlatform, 11)}
            <span>{platformLabel(displayPlatform)}</span>
          </div>
        </div>
      </div>

      <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 flex flex-col min-h-[100px]">
        <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2 flex-1">
          {lb.topMessage}
        </p>
        {lb.topMessageOwner && (
          <p className="text-[#8A8FBF] text-xs text-right mt-auto">
            {lb.topMessageOwner.startsWith('0x')
              ? `${lb.topMessageOwner.slice(0, 6)}…${lb.topMessageOwner.slice(-4)}`
              : lb.topMessageOwner}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs mb-4 text-[#8A8FBF]">
        <span className="text-[#7C9CFF] font-medium">{formatFunds(lb.totalFunds)}</span>
        <div className="flex items-center gap-3">
          {viewCount != null && (
            <span className="flex items-center gap-1">
              <Eye size={11} className="opacity-60" />
              {viewCount.toLocaleString()}
            </span>
          )}
          <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
        </div>
      </div>

      <button
        onClick={handleBuyClick}
        className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors"
      >
        {buyPriceFormatted} ETH to change
      </button>
    </div>
  )
}

// ─── Show-more section ────────────────────────────────────────────────────────

function LeaderboardSection({
  title,
  showAllLabel,
  subtitle,
  badge,
  items,
  renderCard,
  withUrlBar,
}: {
  title: string
  showAllLabel: string
  subtitle?: React.ReactNode
  badge: React.ReactNode
  items: EcosystemLeaderboard[]
  renderCard: (lb: EcosystemLeaderboard) => React.ReactNode
  withUrlBar?: (lb: EcosystemLeaderboard) => string | null
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, INITIAL_SHOW)
  const hasMore = items.length > INITIAL_SHOW

  return (
    <div className="mb-16">
      <div className="flex items-center gap-3 mb-2">
        {badge}
        <h2 className="text-2xl font-bold text-[#EDEEFF]">{title}</h2>
        <span className="text-[#8A8FBF] text-sm">{items.length}</span>
      </div>
      {subtitle}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${subtitle ? '' : 'mt-4'}`}>
        {visible.map(lb => {
          const url = withUrlBar?.(lb)
          if (url) {
            return (
              <div key={lb.address} className="relative">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 hover:bg-[#F897FE]/5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-medium px-4 py-2 rounded-t-lg transition-all"
                >
                  <ExternalLink size={12} />
                  {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
                <div className="rounded-t-none rounded-b-lg overflow-hidden border border-t-0 border-[#F897FE]/20">
                  {renderCard(lb)}
                </div>
              </div>
            )
          }
          return <div key={lb.address}>{renderCard(lb)}</div>
        })}
      </div>
      {hasMore && !showAll && (
        <div className="text-center mt-6">
          <button
            onClick={() => setShowAll(true)}
            className="text-[#8A8FBF] hover:text-[#EDEEFF] text-sm font-medium border border-[#8A8FBF]/30 hover:border-[#8A8FBF]/60 px-6 py-2 rounded-lg transition-colors"
          >
            Show all {items.length} {showAllLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Platform Picker ──────────────────────────────────────────────────────────

type PlatformKey = 'website' | 'github' | 'superfluid'

interface PlatformDef {
  key: PlatformKey
  name: string
  tagline: string
  summary: string
  icon: React.ReactNode
  iconColor: string
  staticCount: string
  staticRaised: string
}

function PlatformPicker({
  leaderboards,
  isLoading,
  onCreateWebsite,
}: {
  leaderboards: EcosystemLeaderboard[]
  isLoading: boolean
  onCreateWebsite: () => void
}) {
  const [selected, setSelected] = useState<PlatformKey | null>(null)

  const websiteCount = !isLoading && leaderboards.length > 0
    ? leaderboards.filter(lb => lb.platform === 'website').length
    : null
  const githubCount = !isLoading && leaderboards.length > 0
    ? leaderboards.filter(lb => lb.platform === 'github').length
    : null
  const superfluidCount = !isLoading && leaderboards.length > 0
    ? leaderboards.filter(lb => lb.platform === 'superfluid').length
    : null

  const platforms: PlatformDef[] = [
    {
      key: 'website',
      name: 'Website',
      tagline: 'Any site you own',
      summary: 'Add a paid message slot to any website you control.',
      icon: <Globe2 size={26} className="text-[#F897FE]" />,
      iconColor: '#F897FE',
      staticCount: websiteCount !== null ? `${websiteCount} Markees` : '142 Markees',
      staticRaised: 'active signs',
    },
    {
      key: 'github',
      name: 'GitHub Repo',
      tagline: 'README, docs, any markdown',
      summary: 'Turn your repo README or docs into a monetizable ad slot.',
      icon: <Github size={26} className="text-[#EDEEFF]" />,
      iconColor: '#EDEEFF',
      staticCount: githubCount !== null ? `${githubCount} Markees` : '68 Markees',
      staticRaised: 'active signs',
    },
    {
      key: 'superfluid',
      name: 'Superfluid Project',
      tagline: 'Earn SUP incentives',
      summary: 'Attach a paid message to your Superfluid project and earn SUP.',
      icon: <Zap size={26} className="text-[#1DB227]" />,
      iconColor: '#1DB227',
      staticCount: superfluidCount !== null ? `${superfluidCount} Markees` : '37 Markees',
      staticRaised: 'active signs',
    },
  ]

  function handleCreate(key: PlatformKey) {
    if (key === 'website') {
      onCreateWebsite()
    } else if (key === 'github') {
      window.location.href = '/ecosystem/platforms/github'
    } else {
      window.location.href = '/ecosystem/platforms/superfluid'
    }
  }

  return (
    <div
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(252px, 1fr))' }}
      className="grid gap-4"
    >
      {platforms.map(p => {
        const isSelected = selected === p.key
        return (
          <div
            key={p.key}
            onClick={() => setSelected(isSelected ? null : p.key)}
            className="flex flex-col gap-4 rounded-lg border p-5 cursor-pointer transition-all duration-200"
            style={{
              background: isSelected ? 'rgba(248,151,254,0.06)' : '#0A0F3D',
              borderColor: isSelected ? 'rgba(248,151,254,0.35)' : 'rgba(138,143,191,0.2)',
            }}
          >
            {/* Icon + name + tagline */}
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-lg border border-[#8A8FBF]/20"
                style={{ width: 50, height: 50, background: '#060A2A' }}
              >
                {p.icon}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[#EDEEFF] font-semibold text-sm leading-tight">{p.name}</p>
                <p className="text-[#8A8FBF] text-xs mt-0.5">{p.tagline}</p>
              </div>
            </div>

            {/* Summary */}
            <p className="text-[#B8B6D9] text-sm leading-relaxed">{p.summary}</p>

            {/* Stats row */}
            <div className="flex items-center justify-between text-xs text-[#8A8FBF] mt-auto pt-2 border-t border-[#8A8FBF]/10">
              <span className="font-medium" style={{ color: p.iconColor }}>{p.staticCount}</span>
              <span>{p.staticRaised}</span>
            </div>

            {/* Create button — only when selected */}
            {isSelected && !NETWORK_PAUSED && (
              <button
                onClick={e => { e.stopPropagation(); handleCreate(p.key) }}
                className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2.5 rounded-lg font-bold text-sm shadow-[0_8px_32px_rgba(248,151,254,0.3)] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px] transition-all duration-[120ms]"
              >
                Create a Markee →
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Integration Request Form ─────────────────────────────────────────────────

function IntegrationForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [form, setForm] = useState({ website: '', name: '', email: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? '',
          website: form.website,
          name: form.name,
          email: form.email,
        }),
      })
      if (res.ok) {
        setStatus('success')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-[#0A0F3D] rounded-xl border border-[#8A8FBF]/20 p-8 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#1DB227]/15 border border-[#1DB227]/40 flex items-center justify-center">
          <CheckCircle size={24} className="text-[#1DB227]" />
        </div>
        <p className="text-[#EDEEFF] font-semibold">Thanks — we'll be in touch.</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#0A0F3D] rounded-xl border border-[#8A8FBF]/20 p-8 flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-[#B8B6D9] text-xs font-medium uppercase tracking-wide">
          Website name <span className="text-[#F897FE]">*</span>
        </label>
        <input
          required
          type="text"
          placeholder="e.g. mycoolapp.xyz"
          value={form.website}
          onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
          className="bg-[#060A2A] border border-[#8A8FBF]/20 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm placeholder:text-[#8A8FBF] focus:outline-none focus:border-[#F897FE]/50 transition-colors"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[#B8B6D9] text-xs font-medium uppercase tracking-wide">
          Your name
        </label>
        <input
          type="text"
          placeholder="Jane Doe"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="bg-[#060A2A] border border-[#8A8FBF]/20 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm placeholder:text-[#8A8FBF] focus:outline-none focus:border-[#F897FE]/50 transition-colors"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[#B8B6D9] text-xs font-medium uppercase tracking-wide">
          Email <span className="text-[#F897FE]">*</span>
        </label>
        <input
          required
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          className="bg-[#060A2A] border border-[#8A8FBF]/20 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm placeholder:text-[#8A8FBF] focus:outline-none focus:border-[#F897FE]/50 transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-2 w-full bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-bold text-sm shadow-[0_8px_32px_rgba(248,151,254,0.3)] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px] transition-all duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {status === 'submitting' ? 'Sending…' : 'Send request'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-center text-red-400">Something went wrong — please try again.</p>
      )}
      <p className="text-[#8A8FBF] text-xs text-center mt-1">
        Or email us at{' '}
        <a href="mailto:hello@markee.xyz" className="text-[#7C9CFF] hover:underline">
          hello@markee.xyz
        </a>
      </p>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EcosystemPage() {
  const ethPrice = useEthPrice()
  const [leaderboards, setLeaderboards] = useState<EcosystemLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoading, setIsLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [topDawgModalData, setTopDawgModalData] = useState<EcosystemLeaderboard | null>(null)
  const [viewCounts, setViewCounts] = useState<Map<string, number>>(new Map())

  const fetchLeaderboards = async (bust = false) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ t: Date.now().toString() })
      if (bust) params.set('bust', '1')
      const res = await fetch(`/api/ecosystem/leaderboards?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const lbs: EcosystemLeaderboard[] = data.leaderboards ?? []
        setLeaderboards(lbs)
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')

        // Fetch view counts using the top markee address for each active leaderboard
        const active = lbs.filter(l => BigInt(l.topFundsAddedRaw ?? '0') > 0n)
        const markeeAddrs = active
          .map(l => l.topMarkeeAddress?.toLowerCase())
          .filter((a): a is string => !!a)
        if (markeeAddrs.length > 0) {
          fetch(`/api/views?addresses=${markeeAddrs.join(',')}`)
            .then(r => r.ok ? r.json() : {})
            .then((data: Record<string, { totalViews: number }>) => {
              const map = new Map<string, number>()
              for (const lb of active) {
                const key = lb.topMarkeeAddress?.toLowerCase()
                if (key && data[key] != null) map.set(lb.address.toLowerCase(), data[key].totalViews)
              }
              setViewCounts(map)
            })
            .catch(() => {})
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchLeaderboards() }, [])

  // Only show boards where a real purchase has been made
  const active = leaderboards.filter(hasRealPurchase)
  const verified = active.filter(l =>
    (l.platform === 'website' && l.status === 'verified') ||
    (l.platform === 'github' && l.repoVerified)
  )
  const verifiedAddresses = new Set(verified.map(l => l.address))
  const unverified = active.filter(l => !verifiedAddresses.has(l.address))

  // Hero stats
  const totalMessages = active.reduce((sum, lb) => {
    return sum + (lb.isLegacy ? lb.markeeCount : Math.max(0, lb.markeeCount - 1))
  }, 0)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="raise" />

      {/* ── 1. Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative py-24 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-5">
            <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0" />
            Raise Funding
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-[#EDEEFF] mb-5 leading-tight">
            Add Markee to your site and start{' '}
            <span style={{ color: '#F897FE' }}>earning</span>
          </h1>

          <p className="text-lg text-[#B8B6D9] mb-10 max-w-xl mx-auto">
            Connect your audience to our global network of buyers.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a
              href="#platform-picker"
              className="inline-flex items-center gap-[10px] bg-[#F897FE] text-[#060A2A] rounded-lg px-[26px] py-[14px] font-bold text-[15px] no-underline shadow-[0_8px_32px_rgba(248,151,254,0.3)] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px] transition-[transform,box-shadow] duration-[120ms]"
            >
              Create a Markee →
            </a>
            <a
              href="#how"
              className="inline-flex items-center gap-2 bg-transparent text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-lg px-[22px] py-[13px] font-sans text-[15px] no-underline transition-[border-color,color] duration-[160ms] hover:border-[rgba(248,151,254,0.35)] hover:text-[#EDEEFF]"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* ── 2. Platform Picker ──────────────────────────────────────────────── */}
      <section id="platform-picker" className="py-20 bg-[#060A2A]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-4">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0" />
              Choose your platform
            </div>
            <h2 className="text-3xl font-bold text-[#EDEEFF]">Where do you want to add a Markee?</h2>
          </div>

          <PlatformPicker
            leaderboards={leaderboards}
            isLoading={isLoading}
            onCreateWebsite={() => setCreateModalOpen(true)}
          />
        </div>
      </section>

      {/* ── 3. How It Works ─────────────────────────────────────────────────── */}
      <section id="how" className="py-20 bg-[#0A0F3D] border-t border-[#8A8FBF]/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-5">
            <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE] flex-shrink-0" />
            How it works
          </div>

          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-4">
            Embed a paid message to any digital space
          </h2>
          <p className="text-[#B8B6D9] text-base max-w-2xl mx-auto mb-14">
            Markee is a cross-platform marketplace for digital real estate and a sustainable revenue source for any website.
          </p>

          {/* Step cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
            {[
              {
                num: '01',
                title: 'Choose your platform',
                body: 'Pick where your Markee will be embedded.',
              },
              {
                num: '02',
                title: 'Set up your sign',
                body: 'Add your info and a wallet to receive funds.',
              },
              {
                num: '03',
                title: 'Activate your Markee',
                body: 'Embed to your site in just a few clicks.',
              },
            ].map(step => (
              <div
                key={step.num}
                className="bg-[#060A2A] rounded-xl border border-[#8A8FBF]/15 p-6 text-left"
              >
                <p className="font-mono text-[#F897FE] text-xs font-bold tracking-widest mb-3">
                  {step.num}
                </p>
                <h3 className="text-[#EDEEFF] font-semibold text-base mb-2">{step.title}</h3>
                <p className="text-[#8A8FBF] text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>

          <a
            href="#platform-picker"
            className="inline-flex items-center gap-[10px] bg-[#F897FE] text-[#060A2A] rounded-lg px-[26px] py-[14px] font-bold text-[15px] no-underline shadow-[0_8px_32px_rgba(248,151,254,0.3)] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)] hover:-translate-y-[1px] transition-[transform,box-shadow] duration-[120ms]"
          >
            Create a Markee →
          </a>
        </div>
      </section>

      {/* ── 4. Integration Request Form ─────────────────────────────────────── */}
      <section className="py-20 bg-[#060A2A] border-t border-[#8A8FBF]/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            {/* Left column */}
            <div>
              <div className="inline-flex items-center gap-[10px] font-mono text-[12px] font-medium tracking-[2px] uppercase text-[#8A8FBF] mb-5">
                <span className="w-2 h-2 rounded-full bg-[#7C9CFF] shadow-[0_0_12px_#7C9CFF] flex-shrink-0" />
                For platforms
              </div>
              <h2 className="text-3xl font-bold text-[#EDEEFF] mb-4">
                Looking for a deeper integration?
              </h2>
              <p className="text-[#B8B6D9] text-base mb-8 leading-relaxed">
                We'll work with you 1-on-1 to build embeddable messages your platform's users will love.
              </p>
              <ul className="flex flex-col gap-4">
                {[
                  'Give your users an easy way to raise funds',
                  'Earn fees on all your platform\'s Markees',
                  'Drive engagement and make it fun for people to come back!',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3 text-[#B8B6D9] text-sm">
                    <span className="w-2 h-2 rounded-full bg-[#7C9CFF] shadow-[0_0_8px_#7C9CFF] flex-shrink-0 mt-1.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right column — form */}
            <IntegrationForm />
          </div>
        </div>
      </section>

      {/* ── 5. Existing creation wizard ─────────────────────────────────────── */}
      <section id="create" className="py-16 bg-[#060A2A] border-t border-[#8A8FBF]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Platform cards (existing) */}
          <div className="mb-16">
            <h2 className="text-lg font-semibold text-[#8A8FBF] mb-5">Raise Funding for Your:</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Website */}
              <div className="flex flex-col gap-4 bg-[#0A0F3D] rounded-lg border border-[#F897FE]/30 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                    <Globe2 size={26} className="text-[#F897FE]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm">Website</h3>
                    <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                      Add a Markee message to any website you own, we'll help with the integration.
                    </p>
                  </div>
                </div>
                {!NETWORK_PAUSED && (
                  <button
                    onClick={() => setCreateModalOpen(true)}
                    className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors"
                  >
                    Create a Markee for your Website
                  </button>
                )}
              </div>

              {/* GitHub */}
              <div className="flex flex-col gap-4 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                    <Github size={26} className="text-[#EDEEFF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm">GitHub Repo</h3>
                    <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                      Add a Markee to your README, SKILL file, or any markdown in your project.
                    </p>
                  </div>
                </div>
                <Link
                  href="/ecosystem/platforms/github"
                  className="w-full flex items-center justify-center bg-[#0A0F3D] text-[#F897FE] border border-[#F897FE]/40 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#F897FE]/10 transition-colors"
                >
                  See Github Markees and Create
                </Link>
              </div>

              {/* Superfluid */}
              <div className="flex flex-col gap-4 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20 overflow-hidden">
                    <Image src="/partners/superfluid.png" alt="Superfluid" width={36} height={36} className="object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm">Superfluid Project</h3>
                    <p className="text-[#8A8FBF] text-xs leading-relaxed mt-0.5">
                      Builders in the Superfluid ecosystem can create a Markee and earn SUP rewards.
                    </p>
                  </div>
                </div>
                <Link
                  href="/ecosystem/platforms/superfluid"
                  className="w-full flex items-center justify-center bg-[#0A0F3D] text-[#F897FE] border border-[#F897FE]/40 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#F897FE]/10 transition-colors"
                >
                  See Superfluid Markees and Create
                </Link>
              </div>

            </div>
          </div>

          {/* Hero stats */}
          {!isLoading && active.length > 0 && (
            <div className="flex items-center justify-center gap-8 mb-12 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{active.length}</span>
                <span className="text-[#8A8FBF]">active Markees</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#EDEEFF] font-semibold">{totalMessages.toLocaleString()}</span>
                <span className="text-[#8A8FBF]">messages bought</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                {ethPrice ? (
                  <span className="text-[#7C9CFF] font-semibold">
                    {formatUsd(parseFloat(totalPlatformFunds) * ethPrice)}
                    <span className="text-[#8A8FBF] font-normal ml-1 text-xs">({formatFunds(totalPlatformFunds)})</span>
                  </span>
                ) : (
                  <span className="text-[#7C9CFF] font-semibold">{formatFunds(totalPlatformFunds)}</span>
                )}
                <span className="text-[#8A8FBF]">total raised</span>
              </div>
            </div>
          )}

          {/* Leaderboard sections */}
          <ModerationProvider>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <>
                {verified.length > 0 && (
                  <LeaderboardSection
                    title="Top Verified Markees"
                    showAllLabel="Verified Markees"
                    badge={
                      <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-3 py-1 rounded-full">
                        <CheckCircle size={11} />
                        Verified
                      </span>
                    }
                    items={verified}
                    withUrlBar={lb => {
                      if (lb.platform === 'github') return lb.repoHtmlUrl ?? null
                      return lb.verifiedUrls?.[0] ?? lb.verifiedUrl ?? null
                    }}
                    renderCard={lb => (
                      <EcosystemCard
                        lb={lb}
                        onBuyLegacy={NETWORK_PAUSED ? undefined : l => setTopDawgModalData(l)}
                        viewCount={viewCounts.get(lb.address.toLowerCase())}
                      />
                    )}
                  />
                )}

                {unverified.length > 0 && (
                  <LeaderboardSection
                    title="Unverified Markees"
                    showAllLabel="Unverified Markees"
                    subtitle={
                      <p className="text-[#8A8FBF] text-sm mb-6 ml-1">
                        These messages haven&apos;t been linked to a website yet.{' '}
                        <Link href="/account" className="text-[#F897FE] hover:underline">
                          Go to Your Account
                        </Link>{' '}
                        to verify your Markees.
                      </p>
                    }
                    badge={
                      <Trophy size={20} className="text-[#F897FE]" />
                    }
                    items={unverified}
                    renderCard={lb => (
                      <EcosystemCard
                        lb={lb}
                        onBuyLegacy={NETWORK_PAUSED ? undefined : l => setTopDawgModalData(l)}
                        viewCount={viewCounts.get(lb.address.toLowerCase())}
                      />
                    )}
                  />
                )}
              </>
            )}
          </ModerationProvider>
        </div>
      </section>

      <Footer />

      <CreateOpenInternetModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => { setCreateModalOpen(false); fetchLeaderboards(true) }}
      />

      {topDawgModalData && (
        <TopDawgModal
          isOpen={!!topDawgModalData}
          onClose={() => setTopDawgModalData(null)}
          onSuccess={() => { setTopDawgModalData(null); fetchLeaderboards(true) }}
          strategyAddress={topDawgModalData.address as `0x${string}`}
          partnerName={topDawgModalData.isCooperative ? undefined : topDawgModalData.name}
          partnerSplitPercentage={
            topDawgModalData.isCooperative ? undefined :
            (topDawgModalData.percentToBeneficiary ?? 6200) / 100
          }
          topFundsAdded={
            topDawgModalData.topFundsAddedRaw
              ? BigInt(topDawgModalData.topFundsAddedRaw)
              : undefined
          }
        />
      )}
    </div>
  )
}
