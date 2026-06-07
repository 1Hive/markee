'use client'

/**
 * Markee Detail Page
 *
 * Route: /markee/[address]
 */

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkeeDetail } from '@/lib/contracts/useMarkeeDetail'
import { formatEth, formatAddress } from '@/lib/utils'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(ts: bigint | number): string {
  const date = new Date(Number(ts) * 1000)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(ts: bigint | number): string {
  const seconds = Math.floor(Date.now() / 1000 - Number(ts))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return `${Math.floor(seconds / 2592000)}mo ago`
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-[#8A8FBF]/20 rounded" />
      <div className="bg-[#0A0F3D] rounded-xl p-8 border border-[#8A8FBF]/20">
        <div className="h-10 w-3/4 bg-[#8A8FBF]/20 rounded mb-4" />
        <div className="h-5 w-1/4 bg-[#8A8FBF]/20 rounded ml-auto" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20">
            <div className="h-3 w-16 bg-[#8A8FBF]/20 rounded mb-2" />
            <div className="h-6 w-24 bg-[#8A8FBF]/20 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20" />
        ))}
      </div>
    </div>
  )
}

// ── FeaturedCard ─────────────────────────────────────────────────────

function FeaturedCard({ message, owner, ownerAddress, totalFundsAdded, totalViews, onBid }: {
  message: string
  owner: string
  ownerAddress: string
  totalFundsAdded: bigint
  totalViews: number | null
  onBid: () => void
}) {
  const [hover, setHover] = useState(false)
  const ethPrice = parseFloat(formatEth(totalFundsAdded))
  return (
    <button onClick={onBid} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="relative w-full text-left cursor-pointer rounded-[16px] p-[18px_26px_22px] backdrop-blur-sm transition-[border-color,transform,box-shadow] duration-[180ms]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
      }}>
      {/* view count top-right */}
      <div className="flex items-center justify-end mb-3 font-mono text-[10.5px] tracking-[1.5px] uppercase">
        <span className="inline-flex items-center gap-1 text-[#7C9CFF]">
          <Eye size={11} />
          {totalViews !== null ? formatViewCount(totalViews) : '—'}
        </span>
      </div>
      {/* message */}
      <div className="font-mono font-bold leading-[1.12] tracking-[-0.02em]"
        style={{ fontSize: 'clamp(20px,3vw,34px)', background: 'linear-gradient(120deg, #EDEEFF 0%, #F897FE 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {message || <span className="opacity-40 italic">No message yet</span>}
      </div>
      {/* owner bottom-right */}
      <div className="mt-[14px] flex items-center justify-end gap-2 text-[13px] flex-wrap">
        <span className="text-[#8A8FBF]">—</span>
        <span className="text-[#EDEEFF]">{owner}</span>
        <span className="text-[#8A8FBF] font-mono text-[11px]">{formatAddress(ownerAddress)}</span>
      </div>
      {/* price pill */}
      <span className="absolute bottom-[-15px] left-1/2 inline-flex items-center gap-1.5 bg-[#F897FE] text-[#060A2A] font-mono font-bold text-[13px] px-[18px] py-2 rounded-lg whitespace-nowrap shadow-[0_8px_28px_rgba(248,151,254,0.42)] pointer-events-none z-[3] transition-[opacity,transform] duration-[180ms]"
        style={{ transform: `translateX(-50%) translateY(${hover ? '0' : '4px'})`, opacity: hover ? 1 : 0 }}>
        {totalFundsAdded > 0n ? `${formatEth(totalFundsAdded + BigInt('1000000000000000'))} ETH to change` : 'Buy a Message'}
      </span>
    </button>
  )
}

// ── MetricsBar ────────────────────────────────────────────────────────

function MetricsBar({ markee, msgCount, totalViews }: { markee: any, msgCount: number, totalViews: number | null }) {
  const cells = [
    { label: 'Total funds added', value: `${formatEth(markee.totalFundsAdded)} ETH`, color: '#1DB227' },
    { label: 'Total views', value: totalViews !== null ? formatViewCount(totalViews) : '—', color: '#7C9CFF' },
    { label: 'Messages bought', value: msgCount.toLocaleString(), color: '#EDEEFF' },
    { label: 'Message edits', value: markee.messageUpdateCount.toString(), color: '#B8B6D9' },
    { label: 'Contract', value: formatAddress(markee.address), color: '#F897FE', href: `https://basescan.org/address/${markee.address}` },
  ]
  return (
    <div className="max-w-[1100px] grid gap-6 py-[26px] border-t border-b border-[#8A8FBF]/20"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {cells.map((c, i) => (
        <div key={i} className="flex flex-col gap-[7px] min-w-0">
          <span className="font-mono text-[10px] tracking-[1px] uppercase text-[#8A8FBF]">{c.label}</span>
          {c.href ? (
            <a href={c.href} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[18px] font-bold tracking-[-0.5px] no-underline border-b border-dotted self-start"
              style={{ color: c.color, borderColor: c.color }}>
              {c.value} ↗
            </a>
          ) : (
            <span className="font-mono text-[18px] font-bold tracking-[-0.5px]" style={{ color: c.color }}>{c.value}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── FundsLeaderboard ──────────────────────────────────────────────────

function FundsLeaderboard({ events, onAddFunds }: { events: any[], onAddFunds: () => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  if (!events || events.length === 0) return null
  const cols = '150px 120px 1fr 188px'
  return (
    <div className="max-w-[1100px] mx-auto mt-10">
      <h2 className="m-0 mb-1 text-[clamp(22px,3vw,30px)] font-extrabold tracking-[-0.6px] text-[#EDEEFF]">Leaderboard</h2>
      <p className="mt-0 mb-5 text-[#B8B6D9] text-[15px]">The message with the most funds added takes the Top Spot.</p>
      <div className="overflow-x-auto rounded-[10px] border border-[#8A8FBF]/20">
        <div className="min-w-[580px] bg-[#0A0F3D]">
          {/* Header */}
          <div className="grid gap-4 px-4 py-[11px] border-b border-[#8A8FBF]/20 bg-[#060A2A] items-center font-mono text-[10px] font-semibold tracking-[1px] uppercase text-[#8A8FBF]"
            style={{ gridTemplateColumns: cols }}>
            <span>Bought by</span><span>Funds added</span><span>Note</span><span></span>
          </div>
          {events.map((event, i) => (
            <div key={event.id || i}>
              <div className="grid gap-4 px-4 py-[13px] border-b border-[#8A8FBF]/20 items-center"
                style={{ gridTemplateColumns: cols, background: i === 0 ? 'rgba(248,151,254,0.06)' : 'transparent', borderLeft: i === 0 ? '3px solid #F897FE' : '3px solid transparent' }}>
                <span className="font-mono text-[12.5px] text-[#B8B6D9] truncate">{formatAddress(event.addedBy)}</span>
                <span className="font-mono text-[12.5px] text-[#7C9CFF] font-semibold">+{formatEth(event.amount)} ETH</span>
                <span className="font-mono text-[13px] text-[#EDEEFF] truncate">{timeAgo(event.timestamp)}</span>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="inline-flex items-center gap-1 bg-transparent text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-[7px] px-3 py-[7px] text-[12.5px] font-semibold cursor-pointer font-sans whitespace-nowrap">
                    History <span className="text-[9px]" style={{ transform: openIdx === i ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 160ms' }}>▼</span>
                  </button>
                  <button onClick={onAddFunds}
                    className="bg-[#F897FE] text-[#060A2A] border-none rounded-[7px] px-[14px] py-[7px] text-[12.5px] font-bold cursor-pointer font-sans whitespace-nowrap">
                    Add Funds
                  </button>
                </div>
              </div>
              {openIdx === i && (
                <div className="col-span-full bg-[#060A2A] border-t border-[#8A8FBF]/20 px-4 py-2">
                  <div className="flex items-center gap-3 py-[9px] font-mono text-[12px]">
                    <span>+</span>
                    <span className="text-[#EDEEFF] font-semibold min-w-[130px]">Funds added</span>
                    <span className="text-[#B8B6D9] flex-1">+{formatEth(event.amount)} ETH</span>
                    <span className="text-[#8A8FBF]">{formatTimestamp(event.timestamp)}</span>
                    <a href={`https://basescan.org/tx/${event.transactionHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-[#7C9CFF] no-underline border-b border-dotted border-[#7C9CFF]">tx ↗</a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────

export default function MarkeeDetailPage() {
  const params = useParams()
  const markeeAddress = params.address as string
  const { markee, isLoading, error } = useMarkeeDetail(markeeAddress)
  const [totalViews, setTotalViews] = useState<number | null>(null)
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const { address } = useAccount()
  const isOwner = !!(markee && address && markee.owner.toLowerCase() === address.toLowerCase())

  // Track this detail page view and fetch current count
  useEffect(() => {
    if (!markee) return

    const track = async () => {
      // Always fetch the current count first so it shows immediately
      try {
        const getRes = await fetch(`/api/views?addresses=${markee.address.toLowerCase()}`)
        if (getRes.ok) {
          const getData = await getRes.json()
          const count = getData[markee.address.toLowerCase()]?.totalViews
          if (count !== undefined) setTotalViews(count)
        }
      } catch {}

      // Then POST to increment (no-ops if message is empty or rate-limited)
      if (!markee.message) return
      try {
        const res = await fetch('/api/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: markee.address,
            message: markee.message,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setTotalViews(data.totalViews)
        }
      } catch (err) {
        console.error('[views] track failed:', err)
      }
    }

    track()
  }, [markee?.address])

  return (
    <div className="min-h-screen bg-[#060A2A] text-[#EDEEFF]">
      <Header activePage="marketplace" />

      {isLoading && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <DetailSkeleton />
        </main>
      )}

      {error && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <p className="text-red-400 mb-2">Failed to load markee details</p>
            <p className="text-[#8A8FBF] text-sm">{error.message}</p>
          </div>
        </main>
      )}

      {markee && (
        <>
          {/* Hero - featured message + metrics */}
          <section className="relative z-[2] border-b border-[#8A8FBF]/20 py-11 px-4 sm:px-10"
            style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%), linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)' }}>
            <HeroBackground />
            <div className="relative z-10 max-w-[1100px] mx-auto">
              {/* "Top Message" label */}
              <div className="flex items-center gap-2 mb-4 font-mono text-[12px] text-[#8A8FBF] tracking-[2px] uppercase">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE]" />
                Top Message
                <span className="flex-1 h-px bg-[#8A8FBF]/20 ml-2" />
              </div>
              {/* Featured card */}
              <FeaturedCard
                message={markee.message}
                owner={markee.name || formatAddress(markee.owner)}
                ownerAddress={markee.owner}
                totalFundsAdded={markee.totalFundsAdded}
                totalViews={totalViews}
                onBid={() => setIsAddFundsOpen(true)}
              />
              {/* Spacer */}
              <div className="h-7" />
              {/* MetricsBar */}
              <MetricsBar
                markee={markee}
                msgCount={markee.fundsAddedCount}
                totalViews={totalViews}
              />
            </div>
          </section>

          {/* Leaderboard */}
          <section className="px-4 sm:px-10 py-2">
            <FundsLeaderboard
              events={markee.fundsAddedEvents}
              onAddFunds={() => setIsAddFundsOpen(true)}
            />
          </section>

          {/* Bottom CTAs */}
          <section className="max-w-[1100px] mx-auto px-4 sm:px-10 py-5 pb-24 flex gap-[14px] flex-wrap justify-center">
            <button onClick={() => setIsAddFundsOpen(true)}
              className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] rounded-lg px-[26px] py-[14px] font-bold text-[15px] cursor-pointer shadow-[0_8px_32px_rgba(248,151,254,0.3)] border-none transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)]">
              Buy a New Message
            </button>
            <Link href="/create-a-markee"
              className="inline-flex items-center gap-2 bg-transparent text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-lg px-[22px] py-[13px] font-sans text-[15px] no-underline transition-[border-color,color] duration-[160ms] hover:border-[rgba(248,151,254,0.35)] hover:text-[#EDEEFF]">
              Create Your Own Markee →
            </Link>
          </section>

          {/* Owner edit button (floating, bottom-right) — only visible to owner */}
          {isOwner && (
            <div className="fixed bottom-6 right-6 z-50">
              <button
                onClick={() => setIsEditOpen(true)}
                className="flex items-center gap-2 border border-[#F897FE]/40 text-[#F897FE] bg-[#060A2A]/90 backdrop-blur-sm hover:bg-[#F897FE]/10 font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-lg">
                Edit Message
              </button>
            </div>
          )}
        </>
      )}

      <Footer />

      {/* Add Funds Modal */}
      {markee && (
        <TopDawgModal
          isOpen={isAddFundsOpen}
          onClose={() => setIsAddFundsOpen(false)}
          userMarkee={markee as any}
          initialMode="addFunds"
          onSuccess={() => setIsAddFundsOpen(false)}
          strategyAddress={markee.pricingStrategy as `0x${string}`}
          partnerName={markee.isPartnerStrategy ? markee.strategyName : undefined}
          partnerSplitPercentage={markee.isPartnerStrategy ? markee.partnerPercentage : undefined}
          topFundsAdded={markee.totalFundsAdded}
        />
      )}

      {/* Edit Message Modal — only reachable by owner via isOwner gate on the button */}
      {markee && (
        <TopDawgModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          userMarkee={markee as any}
          initialMode="updateMessage"
          onSuccess={() => setIsEditOpen(false)}
          strategyAddress={markee.pricingStrategy as `0x${string}`}
        />
      )}
    </div>
  )
}
