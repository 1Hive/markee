'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { formatEther, type Address, type Hex } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StreamSignModal } from '@/components/modals/StreamSignModal'
import { ClaimModal } from '@/components/modals/ClaimModal'
import { StreamActivateModal } from '@/components/modals/StreamActivateModal'
import { EmbedModal } from '@/components/modals/EmbedModal'
import { useStreamingMarkees, type StreamingMarkee, type StreamingBoardMeta } from '@/lib/contracts/useStreamingMarkees'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { STREAMING_BASE, CFA_FORWARDER_ABI, ratePerSecToMonthly } from '@/lib/superfluid/streaming'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { useStreamingBoardTotal } from '@/hooks/useStreamingBoardTotal'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { usePendingMarkee } from '@/hooks/usePendingMarkee'
import { useTopSince } from '@/hooks/useTopSince'
import { estimateStreamingSettlementMarkeeTokens } from '@/lib/tokenPhases'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { NETWORK_PAUSED } from '@/lib/paused'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'
import { Pencil } from 'lucide-react'
import {
  MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER, HERO_GRAD,
  formatViews, fmtAddr, formatDuration, useServedOn, MetricsBar, MetricValue, FeaturedCard, BoardDetailSkeleton,
  TxHistoryToggle, TxHistoryPanel, useTxHistory,
} from '@/components/board-detail/shared'

const GOLD = '#FFD700'
// Streaming's leaderboard needs one more column ("Total Streamed") than the shared BOARD_LB_COLS
// (For Sale) layout, so it defines its own grid instead of reusing that constant.
const STREAM_LB_COLS = '42px 150px 110px 120px minmax(220px,1fr) 70px 170px'

const ETHX = STREAMING_BASE.ethx as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address
const ZERO = '0x0000000000000000000000000000000000000000'

// Effective rate (wei/sec) → human "X ETH/mo".
function formatRate(weiPerSec: bigint): string {
  const eth = parseFloat(formatEther(ratePerSecToMonthly(weiPerSec)))
  if (eth === 0) return '0 ETH/mo'
  if (eth < 0.00005) return '< 0.0001 ETH/mo' // would round to 0.0000 at 4 dp
  return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function StreamingBoardDetail({ board }: { board: Address }) {
  const { meta, markees, isLoading, refetch } = useStreamingMarkees(board)
  const { address } = useAccount()
  const ethPrice = useEthPrice()
  const ecoEntry = useServedOn(board)
  const topSince = useTopSince(board)

  // Live cumulative total: API snapshot ticking forward at the board's aggregate inflow rate.
  const boardTotal = useStreamingBoardTotal(board)
  const liveStreamedWei = useFlowingAmount(
    boardTotal?.totalRaw ?? 0n,
    boardTotal?.streamedAt ?? 0,
    boardTotal?.rateRaw ?? 0n,
  )
  const streamedEth = parseFloat(formatEther(liveStreamedWei))

  const canStream = !NETWORK_PAUSED && meta.version !== undefined

  const messageCount = meta.markeeCount !== undefined
    ? Number(meta.markeeCount > 0n ? meta.markeeCount - 1n : 0n)
    : 0

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [signOpen, setSignOpen] = useState(false)
  const [signTargetAddress, setSignTargetAddress] = useState<string | null>(null)
  const [signInitialView, setSignInitialView] = useState<'fund' | 'manage'>('fund')
  const [activateOpen, setActivateOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [messageEditTarget, setMessageEditTarget] = useState<StreamingMarkee | null>(null)

  // Routes to the Fund sub-view for a message you don't yet back, or Manage for the one you do.
  const openSign = (m: StreamingMarkee, view: 'fund' | 'manage') => {
    setSignTargetAddress(m.address); setSignInitialView(view); setSignOpen(true)
  }

  // ── Your position on this board ─────────────────────────────────────────────
  const { data: backedMarkee, refetch: refetchBacked } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerMarkee', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN_ID,
    query: { enabled: !!address },
  })
  const { data: myRate, refetch: refetchMyRate } = useReadContract({
    address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate', args: address ? [ETHX, address, board] : undefined, chainId: CANONICAL_CHAIN_ID,
    query: { enabled: !!address },
  })
  const { data: myDeposit, refetch: refetchDeposit } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN_ID,
    query: { enabled: !!address },
  })
  const hasPosition = (!!backedMarkee && backedMarkee !== ZERO) || (myDeposit ?? 0n) > 0n

  const pending = usePendingMarkee(hasPosition ? board : undefined, address)
  const pendingEthWei = useFlowingAmount(pending.pendingWei, pending.snapshotAt, pending.ratePerSec)
  const earnedMarkee = estimateStreamingSettlementMarkeeTokens(Number(formatEther(pendingEthWei)), pending.feeBps)

  const backedEntry = backedMarkee && backedMarkee !== ZERO
    ? markees.find(m => m.address.toLowerCase() === backedMarkee.toLowerCase()) ?? null
    : null

  const { refetch: refetchPending } = pending
  const refetchAll = useCallback(() => {
    refetch(); refetchBacked(); refetchMyRate(); refetchDeposit(); refetchPending()
  }, [refetch, refetchBacked, refetchMyRate, refetchDeposit, refetchPending])

  // ── Views ───────────────────────────────────────────────────────────────────
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  const [viewsFetching, setViewsFetching] = useState(true)
  const viewsLoading = isLoading || viewsFetching
  const markeeAddrKey = markees.map(m => m.address.toLowerCase()).join(',')
  useEffect(() => {
    if (!markeeAddrKey) { setViewsFetching(false); return }
    fetch(`/api/views?addresses=${markeeAddrKey}`)
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
      .finally(() => setViewsFetching(false))
  }, [markeeAddrKey])

  // Track + increment a view for the top message, mirroring the fixed reader. The POST both
  // increments (rate-limited per IP server-side) and returns the current total for display.
  const topAddress = markees[0]?.address
  const topMessage = markees[0]?.message
  useEffect(() => {
    if (!topAddress || !topMessage) return
    fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: topAddress, message: topMessage }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (typeof data?.totalViews === 'number') {
          setViewsMap(m => new Map(m).set(topAddress.toLowerCase(), data.totalViews))
        }
      })
      .catch(() => {})
  }, [topAddress, topMessage])

  const topMarkee = markees[0] ?? null
  const topViews = topMarkee ? (viewsMap.get(topMarkee.address.toLowerCase()) ?? 0) : 0
  const topMonthlyWei = markees[0]?.rate ? ratePerSecToMonthly(markees[0].rate) : undefined

  const streamedEthLabel = `${streamedEth.toFixed(6)} ETH`
  const totalStreamedNode = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
      <MetricValue
        text={ethPrice ? formatUsd(streamedEth * ethPrice) : streamedEthLabel}
        color={GREEN}
        title={ethPrice ? streamedEthLabel : undefined}
      />
    </span>
  )

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="marketplace" />

      {isLoading ? (
        <BoardDetailSkeleton />
      ) : !topMarkee ? (
        // Board exists but nothing is backed yet
        <section style={{ maxWidth: 700, margin: '0 auto', padding: '120px 40px', textAlign: 'center' }}>
          {meta.name && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>{meta.name}</div>
          )}
          <h1 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>Activate your Markee</h1>
          <p style={{ color: TEXT2, fontSize: 16, margin: '14px 0 30px' }}>Buy the first message to activate your Markee.</p>
          {canStream && (
            <button
              onClick={() => setActivateOpen(true)}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '13px 26px', fontWeight: 700, fontSize: 15, fontFamily: MONO, cursor: 'pointer', boxShadow: '0 4px 18px rgba(248,151,254,0.3)' }}
            >
              Activate Markee →
            </button>
          )}
          <div style={{ marginTop: 20 }}>
            <Link href="/account" style={{ color: MUTED, fontSize: 14, textDecoration: 'none', fontFamily: MONO }}>← Back to Your Dashboard</Link>
          </div>
        </section>
      ) : (
        <>
          {/* ── Hero ── */}
          <section style={{ position: 'relative', zIndex: 2, borderBottom: `1px solid ${BORDER}`, background: HERO_GRAD, padding: '44px 40px 30px', overflow: 'hidden' }}>
            <HeroBackground />
            {/* scanlines */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'overlay' }} />

            <FeaturedCard
              markeeAddress={topMarkee.address}
              message={topMarkee.message || 'No message set'}
              displayName={topMarkee.name || undefined}
              ownerAddress={topMarkee.owner}
              views={topViews}
              viewsLoading={viewsLoading}
              pillLabel={canStream ? `${formatRate(topMarkee.rate)} to rent` : undefined}
              onClick={() => canStream && openSign(topMarkee, backedMarkee && backedMarkee.toLowerCase() === topMarkee.address.toLowerCase() ? 'manage' : 'fund')}
              strategy="streaming"
            />
            <div style={{ height: 28 }} />
            <MetricsBar
              address={board}
              entry={ecoEntry}
              topViews={topViews}
              viewsLoading={viewsLoading}
              markeeCount={messageCount}
              totalLabel="Total streamed"
              totalNode={totalStreamedNode}
              messagesLabel="Messages"
              topMarkeeAddress={topMarkee.address}
              onAddToSite={() => setEmbedOpen(true)}
            />
          </section>

          {/* ── Leaderboard table ── */}
          <section style={{ padding: '8px 40px 20px' }}>
            <div style={{ maxWidth: 1100, margin: '40px auto 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' as const, marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: -0.6, color: TEXT }}>Leaderboard</h2>
                  <p style={{ margin: 0, color: TEXT2, fontSize: 15 }}>The message with the highest stream rate takes the top spot.</p>
                </div>
                {(pendingEthWei > 0n || pending.accruing) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
                    borderRadius: 12, padding: '16px 20px', minWidth: 260,
                    background: 'linear-gradient(135deg, rgba(123,106,244,0.22), rgba(248,151,254,0.14))',
                    border: '1px solid rgba(248,151,254,0.3)',
                  }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT2, letterSpacing: 0.5 }}>
                        {pending.mintsMarkee ? 'MARKEE accrued' : 'ETH accrued'}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: PINK, marginTop: 2 }}>
                        {pending.mintsMarkee
                          ? earnedMarkee.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : Number(formatEther(pendingEthWei)).toFixed(6)}
                      </div>
                    </div>
                    <button onClick={() => setClaimOpen(true)} style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '10px 18px', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Claim
                    </button>
                  </div>
                )}
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ minWidth: 900, background: BG2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: STREAM_LB_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center', borderLeft: '3px solid transparent' }}>
                    {['', 'Bought by', 'Total streamed', 'Bid rate', 'Current message', 'Views', ''].map((h, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{h}</span>
                    ))}
                  </div>
                  {markees.map((m, i) => (
                    <StreamingRow
                      key={m.address}
                      markee={m}
                      rank={i + 1}
                      featured={i === 0}
                      board={board}
                      topSince={topSince}
                      viewCount={viewsMap.get(m.address.toLowerCase()) ?? 0}
                      viewsLoading={viewsLoading}
                      isBackedByYou={!!backedMarkee && backedMarkee.toLowerCase() === m.address.toLowerCase()}
                      isOwner={!!address && m.owner.toLowerCase() === address.toLowerCase()}
                      onEditMessage={() => setMessageEditTarget(m)}
                      onStream={canStream ? () => openSign(m, backedMarkee && backedMarkee.toLowerCase() === m.address.toLowerCase() ? 'manage' : 'fund') : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Bottom CTAs ── */}
          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 40px 96px', display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            {canStream && (
              <button
                onClick={() => setCreateOpen(true)}
                style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '13px 24px', fontWeight: 700, fontSize: 15, fontFamily: MONO, cursor: 'pointer', letterSpacing: 0.3, transition: 'transform 120ms, box-shadow 120ms', boxShadow: '0 4px 18px rgba(248,151,254,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(248,151,254,0.45)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 18px rgba(248,151,254,0.3)' }}
              >
                Buy a New Message
              </button>
            )}
            <Link
              href="/create-a-markee"
              style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '13px 24px', fontWeight: 600, fontSize: 15, fontFamily: MONO, textDecoration: 'none', letterSpacing: 0.3, transition: 'border-color 120ms, color 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
            >
              Create Your Own Markee
            </Link>
          </section>
        </>
      )}

      <Footer />

      <StreamSignModal
        isOpen={signOpen}
        board={board}
        initialView={signInitialView}
        initialTargetAddress={signTargetAddress ?? undefined}
        onClose={() => setSignOpen(false)}
        onSuccess={refetchAll}
      />

      <ClaimModal
        isOpen={claimOpen}
        board={board}
        onClose={() => setClaimOpen(false)}
        onSuccess={refetchAll}
      />

      <StreamActivateModal
        isOpen={activateOpen}
        board={board}
        topMonthlyWei={topMonthlyWei}
        onClose={() => setActivateOpen(false)}
        onSuccess={() => { setActivateOpen(false); refetchAll() }}
        messageLabel="SET FIRST MESSAGE"
        messagePlaceholder="Your message here..."
      />

      <StreamSignModal
        isOpen={createOpen}
        board={board}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); refetchAll() }}
      />

      <EmbedModal
        isOpen={embedOpen}
        onClose={() => setEmbedOpen(false)}
        leaderboard={{ address: board, name: meta?.name, strategy: 'streaming' }}
      />

      <StreamMessageEditModal
        isOpen={!!messageEditTarget}
        onClose={() => setMessageEditTarget(null)}
        markeeAddress={messageEditTarget?.address as Address | undefined}
        currentMessage={messageEditTarget?.message ?? ''}
        onSuccess={() => { setMessageEditTarget(null); refetchAll() }}
      />
    </div>
  )
}

// ── Message edit (streaming markees have no on-chain message-edit path through the leaderboard
// contract -- MarkeeABI.setMessage is called directly on the markee's own address, gated to its
// owner by the contract itself) ──────────────────────────────────────────────────────────────────
function StreamMessageEditModal({ isOpen, onClose, markeeAddress, currentMessage, onSuccess }: {
  isOpen: boolean
  onClose: () => void
  markeeAddress?: Address
  currentMessage: string
  onSuccess?: () => void
}) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { writeContractAsync, isPending, reset } = useWriteContract()
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN_ID })
  const MAX_LEN = 222

  useEffect(() => {
    if (!isOpen) { setMessage(''); setError(null); setTxHash(undefined); reset() }
  }, [isOpen, reset])

  // The parent re-renders ~10x/sec (useFlowingAmount tick) with a fresh inline onSuccess each time;
  // depending on it would clear this timer every tick and the callback would never fire.
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  useEffect(() => {
    if (isSuccess && isOpen) {
      const t = setTimeout(() => onSuccessRef.current?.(), 1500)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isOpen])

  if (!isOpen || !markeeAddress) return null

  const busy = isPending || isConfirming
  const canSubmit = message.trim().length > 0 && !busy && !isSuccess

  async function handleSubmit() {
    if (!canSubmit || !markeeAddress) return
    setError(null)
    try {
      const hash = await writeContractAsync({
        address: markeeAddress, abi: MarkeeABI, functionName: 'setMessage', args: [message], chainId: CANONICAL_CHAIN_ID,
      })
      setTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'StreamMessageEditModal.setMessage')
      setError(formatTransactionError(e))
    }
  }

  return (
    <div onClick={() => { if (!busy) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 180ms ease forwards' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, background: BG2, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', color: TEXT, fontFamily: 'Manrope, system-ui, sans-serif', animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            EDIT MESSAGE
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {busy || isSuccess ? (
          <div style={{ padding: '48px 22px', textAlign: 'center' }}>
            <p style={{ color: isSuccess ? GREEN : TEXT2, fontSize: 15 }}>
              {isSuccess ? '✓ Message updated!' : isPending ? 'Waiting for wallet…' : 'Confirming on Base…'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ padding: '22px 22px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Current Message</div>
                <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {currentMessage || <span style={{ color: MUTED, fontStyle: 'italic' }}>No message set</span>}
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Your Message</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MAX_LEN))}
                  placeholder="Enter your new message..."
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontFamily: MONO, fontSize: 13, outline: 'none', resize: 'vertical' }}
                  disabled={busy}
                />
                <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 4, fontFamily: MONO }}>{message.length}/{MAX_LEN}</div>
              </div>
              {error && <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>{error}</p>}
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>As the message owner, only you can update.</span>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', flexShrink: 0, opacity: canSubmit ? 1 : 0.4, transition: 'opacity 140ms' }}
              >
                Update Message
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Leaderboard row ────────────────────────────────────────────────────────────

function StreamingRow({ markee, rank, featured, board, topSince, viewCount, viewsLoading, isBackedByYou, isOwner, onStream, onEditMessage }: {
  markee: StreamingMarkee
  rank: number
  featured: boolean
  board: Address
  topSince: { address: string; since: number } | null
  viewCount: number
  viewsLoading?: boolean
  isBackedByYou: boolean
  isOwner: boolean
  onStream?: () => void
  onEditMessage: () => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const displayName = markee.name || fmtAddr(markee.owner)

  // Only the current #1 has a live, self-verified "since when" timestamp (see useTopSince) -- other
  // rows show "—" rather than a fabricated historical total, since Superfluid streams flow into the
  // board as one pooled inflow with no per-message cumulative-streamed record on-chain.
  const isCurrentTop = topSince?.address.toLowerCase() === markee.address.toLowerCase()
  const liveStreamedWei = useFlowingAmount(0n, isCurrentTop ? topSince!.since : 0, isCurrentTop ? markee.rate : 0n)

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, background: featured ? `${PINK}0A` : 'transparent' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: STREAM_LB_COLS,
          gap: 16,
          padding: '13px 16px',
          alignItems: 'center',
          borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent',
        }}
      >
        <TxHistoryToggle expanded={historyOpen} onClick={() => setHistoryOpen(v => !v)} rank={rank} />

        <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
          {isOwner && <span style={{ color: PINK }}> · yours</span>}
        </span>

        <span style={{ fontSize: 12.5, color: GREEN, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {isCurrentTop ? `${parseFloat(formatEther(liveStreamedWei)).toFixed(5)} ETH` : '—'}
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatRate(markee.rate)}
          </span>
          {markee.legacyFloor > markee.streamRate && (
            <span
              title="This Markee was funded with a lump sum before the board streamed. That sum counts as a rate that decays to zero, so the rate to overtake it keeps falling."
              style={{ fontSize: 9.5, color: MUTED, fontFamily: MONO, whiteSpace: 'nowrap', cursor: 'help', borderBottom: `1px dotted ${MUTED}`, alignSelf: 'flex-start' }}
            >
              decaying
            </span>
          )}
        </span>

        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {isOwner && (
            <button
              type="button"
              onClick={onEditMessage}
              title="Edit message"
              style={{ flexShrink: 0, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: MUTED, lineHeight: 0, transition: 'color 120ms, border-color 120ms' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = PINK; el.style.borderColor = `${PINK}66` }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = MUTED; el.style.borderColor = BORDER }}
            >
              <Pencil size={11} />
            </button>
          )}
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {markee.message || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No message</span>}
          </p>
        </div>

        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Eye size={10} style={{ opacity: 0.7 }} />
          {viewsLoading ? <ViewsSpinner size={9} /> : viewCount > 0 ? formatViews(viewCount) : '-'}
        </span>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          {onStream && (
            <button
              type="button"
              onClick={onStream}
              style={{
                background: isBackedByYou ? PINK : 'transparent',
                color: isBackedByYou ? BG : TEXT2,
                border: isBackedByYou ? 'none' : `1px solid ${BORDER}`,
                borderRadius: 7,
                padding: '8px 14px',
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isBackedByYou ? 'Manage Your Stream' : 'Fund this instead'}
            </button>
          )}
        </div>
      </div>

      <TxHistoryPanel leaderboardAddress={board} markeeAddress={markee.address} expanded={historyOpen} featured={featured} strategy="streaming" />
    </div>
  )
}

// Board settings (min rate / beneficiary / admin transfer) removed from this page -- these will be
// set up in /account instead. The admin-only reads/writes above were purely for that panel.
