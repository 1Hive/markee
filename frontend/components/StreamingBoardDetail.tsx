'use client'

import { useState, useEffect, useCallback } from 'react'
import { Eye } from 'lucide-react'
import { formatEther, parseEther, type Address, type Hex } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StreamSignModal } from '@/components/modals/StreamSignModal'
import { ManageStreamModal } from '@/components/modals/ManageStreamModal'
import { ClaimModal } from '@/components/modals/ClaimModal'
import { StreamActivateModal } from '@/components/modals/StreamActivateModal'
import { useStreamingMarkees, type StreamingMarkee, type StreamingBoardMeta } from '@/lib/contracts/useStreamingMarkees'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { STREAMING_BASE, CFA_FORWARDER_ABI, ratePerSecToMonthly } from '@/lib/superfluid/streaming'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { useStreamingBoardTotal } from '@/hooks/useStreamingBoardTotal'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { usePendingMarkee } from '@/hooks/usePendingMarkee'
import { estimateStreamingSettlementMarkeeTokens } from '@/lib/tokenPhases'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { NETWORK_PAUSED } from '@/lib/paused'
import {
  MONO, PINK, BLUE, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER, BOARD_LB_COLS, HERO_GRAD,
  formatViews, fmtAddr, useServedOn, MetricsBar, MetricValue, FeaturedCard, BoardDetailSkeleton,
} from '@/components/board-detail/shared'

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
  const [manageOpen, setManageOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)

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
  const markeeAddrKey = markees.map(m => m.address.toLowerCase()).join(',')
  useEffect(() => {
    if (!markeeAddrKey) return
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

  const isBoardAdmin = !!address && !!meta.admin && address.toLowerCase() === meta.admin.toLowerCase()

  const totalStreamedNode = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
      <MetricValue text={`${streamedEth.toFixed(6)} ETH`} color={GREEN} />
      {ethPrice && streamedEth > 0 ? (
        <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>≈ {formatUsd(streamedEth * ethPrice)}</span>
      ) : null}
    </span>
  )

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <Header activePage="marketplace" useRegularLinks />

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
            <a href="/account" style={{ color: MUTED, fontSize: 14, textDecoration: 'none', fontFamily: MONO }}>← Back to Your Dashboard</a>
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
              pillLabel={canStream ? `${formatRate(topMarkee.rate)} to back` : undefined}
              onClick={() => canStream && openSign(topMarkee, backedMarkee && backedMarkee.toLowerCase() === topMarkee.address.toLowerCase() ? 'manage' : 'fund')}
            />
            <div style={{ height: 28 }} />
            <MetricsBar
              address={board}
              entry={ecoEntry}
              strategy="streaming"
              topViews={topViews}
              markeeCount={messageCount}
              totalLabel="Total streamed"
              totalNode={totalStreamedNode}
              messagesLabel="Messages"
            />
          </section>

          {/* ── Your position ── */}
          {hasPosition && (
            <section style={{ padding: '16px 40px', borderBottom: `1px solid ${BORDER}`, background: BG2 }}>
              <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: myRate && myRate > 0n ? GREEN : MUTED, flexShrink: 0, animation: myRate && myRate > 0n ? 'glowPulse 1.5s ease-in-out infinite' : 'none' }} />
                  <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT2 }}>
                    {myRate && myRate > 0n ? (
                      <>You stream <span style={{ color: TEXT }}>{formatRate(myRate)}</span>{' '}
                        to <span style={{ color: PINK }}>{backedEntry?.name || backedEntry?.message || (backedMarkee ? fmtAddr(backedMarkee) : '')}</span></>
                    ) : (
                      <>Your stream is stopped{(myDeposit ?? 0n) > 0n ? ', your deposit is ready to withdraw' : ''}</>
                    )}
                    {(pendingEthWei > 0n || pending.accruing) && (
                      <> · earning <span style={{ color: GREEN }}>
                        {pending.mintsMarkee
                          ? `~${earnedMarkee.toLocaleString(undefined, { maximumFractionDigits: 2 })} MARKEE`
                          : `${Number(formatEther(pendingEthWei)).toFixed(6)} ETH`}
                      </span></>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {(pendingEthWei > 0n || pending.accruing) && (
                    <button onClick={() => setClaimOpen(true)} style={posBtn(true)}>Claim</button>
                  )}
                  {myRate && myRate > 0n && backedEntry && (
                    <button onClick={() => openSign(backedEntry, 'manage')} style={posBtn(false)}>Change rate</button>
                  )}
                  <button onClick={() => setManageOpen(true)} style={posBtn(false)}>Manage stream</button>
                </div>
              </div>
            </section>
          )}

          {/* ── Leaderboard table ── */}
          <section style={{ padding: '8px 40px 20px' }}>
            <div style={{ maxWidth: 1100, margin: '40px auto 0' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: -0.6, color: TEXT }}>Leaderboard</h2>
              <p style={{ margin: '0 0 20px', color: TEXT2, fontSize: 15 }}>The message with the highest stream rate takes the top spot.</p>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${BORDER}` }}>
                <div style={{ minWidth: 760, background: BG2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: BOARD_LB_COLS, gap: 16, padding: '11px 16px', borderBottom: `1px solid ${BORDER}`, background: BG, alignItems: 'center', borderLeft: '3px solid transparent' }}>
                    {['', 'Backed by', 'Stream rate', 'Current message', 'Views', ''].map((h, i) => (
                      <span key={i} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: MUTED }}>{h}</span>
                    ))}
                  </div>
                  {markees.map((m, i) => (
                    <StreamingRow
                      key={m.address}
                      markee={m}
                      rank={i + 1}
                      featured={i === 0}
                      viewCount={viewsMap.get(m.address.toLowerCase()) ?? 0}
                      isBackedByYou={!!backedMarkee && backedMarkee.toLowerCase() === m.address.toLowerCase()}
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
                Add a New Message
              </button>
            )}
            <a
              href="/create-a-markee"
              style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '13px 24px', fontWeight: 600, fontSize: 15, fontFamily: MONO, textDecoration: 'none', letterSpacing: 0.3, transition: 'border-color 120ms, color 120ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,151,254,0.35)'; (e.currentTarget as HTMLElement).style.color = TEXT }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.color = TEXT2 }}
            >
              Create Your Own Markee
            </a>
          </section>

          {isBoardAdmin && <BoardAdminPanel board={board} meta={meta} onUpdated={refetch} />}
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

      <ManageStreamModal
        isOpen={manageOpen}
        board={board}
        onClose={() => setManageOpen(false)}
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
    </div>
  )
}

function posBtn(primary: boolean): React.CSSProperties {
  return {
    background: primary ? PINK : 'transparent',
    color: primary ? BG : TEXT2,
    border: primary ? 'none' : `1px solid ${BORDER}`,
    borderRadius: 7, padding: '8px 14px',
    fontFamily: MONO, fontWeight: 700, fontSize: 12.5,
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  }
}

// ── Leaderboard row ────────────────────────────────────────────────────────────

function StreamingRow({ markee, rank, featured, viewCount, isBackedByYou, onStream }: {
  markee: StreamingMarkee
  rank: number
  featured: boolean
  viewCount: number
  isBackedByYou: boolean
  onStream?: () => void
}) {
  const { address } = useAccount()
  const isOwner = !!address && markee.owner.toLowerCase() === address.toLowerCase()
  const displayName = markee.name || fmtAddr(markee.owner)

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, background: featured ? `${PINK}0A` : 'transparent' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: BOARD_LB_COLS,
          gap: 16,
          padding: '13px 16px',
          alignItems: 'center',
          borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent',
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 99, border: `1px solid ${featured ? 'rgba(248,151,254,0.4)' : BORDER}`,
          color: featured ? PINK : MUTED, background: featured ? 'rgba(248,151,254,0.08)' : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 11, fontWeight: 700,
        }}>
          {rank}
        </span>

        <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
          {isOwner && <span style={{ color: PINK }}> · yours</span>}
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

        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {markee.message || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No message</span>}
          </p>
        </div>

        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Eye size={10} style={{ opacity: 0.7 }} />
          {viewCount > 0 ? formatViews(viewCount) : '-'}
        </span>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          {onStream && (
            <button
              type="button"
              onClick={onStream}
              style={{
                background: isBackedByYou ? 'transparent' : PINK,
                color: isBackedByYou ? TEXT2 : BG,
                border: isBackedByYou ? `1px solid ${BORDER}` : 'none',
                borderRadius: 7,
                padding: '8px 14px',
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isBackedByYou ? 'Change rate' : 'Stream'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Board settings (admin only) ────────────────────────────────────────────────

function BoardAdminPanel({ board, meta, onUpdated }: {
  board: Address
  meta: StreamingBoardMeta
  onUpdated: () => void
}) {
  const [minMonthly, setMinMonthly] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [newAdmin, setNewAdmin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN_ID })
  const busy = isPending || isConfirming

  useEffect(() => {
    if (!isSuccess) return
    setMinMonthly(''); setBeneficiary(''); setNewAdmin(''); setTxHash(undefined)
    onUpdated()
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitMinimum() {
    setError(null)
    let wei: bigint
    try { wei = parseEther(minMonthly) } catch { setError('Enter a valid amount in ETH.'); return }
    try {
      setTxHash(await writeContractAsync({
        address: board, abi: StreamingLeaderboardABI, functionName: 'setMinimumMonthlyRate', args: [wei], chainId: CANONICAL_CHAIN_ID,
      }))
    } catch (e: unknown) {
      logTransactionError(e, 'BoardAdminPanel.setMinimumMonthlyRate')
      setError(formatTransactionError(e))
    }
  }

  // A zero beneficiary is legal on-chain: it credits backers the full top rate instead of streaming a
  // share out, so it is a real choice rather than an unset field, and the input asks for it explicitly.
  async function submitBeneficiary() {
    setError(null)
    const v = beneficiary.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) { setError('Enter a valid address.'); return }
    try {
      setTxHash(await writeContractAsync({
        address: board, abi: StreamingLeaderboardABI, functionName: 'setBeneficiaryAddress', args: [v as Address], chainId: CANONICAL_CHAIN_ID,
      }))
    } catch (e: unknown) {
      logTransactionError(e, 'BoardAdminPanel.setBeneficiaryAddress')
      setError(formatTransactionError(e))
    }
  }

  async function submitAdmin() {
    setError(null)
    const v = newAdmin.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) { setError('Enter a valid address.'); return }
    if (/^0x0{40}$/.test(v)) { setError('The board rejects a zero admin.'); return }
    try {
      setTxHash(await writeContractAsync({
        address: board, abi: StreamingLeaderboardABI, functionName: 'setAdmin', args: [v as Address], chainId: CANONICAL_CHAIN_ID,
      }))
    } catch (e: unknown) {
      logTransactionError(e, 'BoardAdminPanel.setAdmin')
      setError(formatTransactionError(e))
    }
  }

  const field = 'w-full bg-[#060A2A] border border-[#8A8FBF]/20 rounded-lg px-3 py-2.5 text-[#EDEEFF] text-sm outline-none focus:border-[#F897FE]/40'
  const label = 'block text-[10px] uppercase tracking-wider text-[#8A8FBF] mb-2'
  const action = 'px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <section className="py-10 border-t border-[#8A8FBF]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-[#EDEEFF] font-semibold mb-1">Board settings</h2>
        <p className="text-[#8A8FBF] text-sm mb-6">Only you, the board admin, see this.</p>

        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <span className={label}>
              Minimum monthly rate
              {meta.minimumMonthlyRate !== undefined && ` (now ${formatEther(meta.minimumMonthlyRate)} ETH)`}
            </span>
            <div className="flex gap-2">
              <input value={minMonthly} onChange={e => setMinMonthly(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.001" className={field} />
              <button onClick={submitMinimum} disabled={busy || !minMonthly} className={`${action} bg-[#F897FE] text-[#060A2A] hover:bg-[#7C9CFF]`}>Set</button>
            </div>
          </div>

          <div>
            <span className={label}>Beneficiary{meta.beneficiary && ` (${meta.beneficiary.slice(0, 6)}…${meta.beneficiary.slice(-4)})`}</span>
            <div className="flex gap-2">
              <input value={beneficiary} onChange={e => setBeneficiary(e.target.value)} placeholder="0x…" className={`${field} font-mono`} />
              <button onClick={submitBeneficiary} disabled={busy || !beneficiary} className={`${action} bg-[#F897FE] text-[#060A2A] hover:bg-[#7C9CFF]`}>Set</button>
            </div>
            <p className="text-[10px] text-[#8A8FBF] mt-2 leading-relaxed">Moves the live outflow: the old stream closes and the new beneficiary starts receiving at the same rate.</p>
          </div>

          <div>
            <span className={label}>Transfer admin</span>
            <div className="flex gap-2">
              <input value={newAdmin} onChange={e => setNewAdmin(e.target.value)} placeholder="0x…" className={`${field} font-mono`} />
              <button onClick={submitAdmin} disabled={busy || !newAdmin} className={`${action} border border-[#8A8FBF]/30 text-[#EDEEFF] hover:border-[#F897FE]/40`}>Transfer</button>
            </div>
            <p className="text-[10px] text-[#8A8FBF] mt-2 leading-relaxed">One way: after this, only the new address can change these settings.</p>
          </div>
        </div>

        {error && <p className="text-[#F897FE] text-sm mt-4">{error}</p>}
        {busy && <p className="text-[#8A8FBF] text-sm mt-4">Confirming on Base…</p>}
      </div>
    </section>
  )
}
