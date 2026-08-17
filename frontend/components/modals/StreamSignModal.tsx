'use client'

// Streaming ("For Rent") analog of MarkeeSignModal.tsx — same "Change the Markee Sign" list+fund
// UI, but backed by the working Superfluid write flows (useCreateStreamFlow/useOpenStreamFlow/
// useUpdateStreamRateFlow), not a re-implementation of them. Keeps only the genuinely
// streaming-specific UX: the monthly-rate unit, the 1/2/3-month duration selector + ETH total, and
// "Manage" (rate change) in place of "Edit" (message text) for the connected wallet's own backing,
// since there's no message-text-edit capability for streaming markees.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount, useReadContract, useSwitchChain, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, erc20Abi, type Address, type Hex } from 'viem'
import { Eye, Pencil } from 'lucide-react'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI, MarkeeABI } from '@/lib/contracts/abis'
import {
  monthlyToRatePerSec, ratePerSecToMonthly, bufferFor, openStreamValue, runwaySeconds,
  STREAMING_BASE, CFA_FORWARDER_ABI, ETHX_WRAP_ABI,
} from '@/lib/superfluid/streaming'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { estimateLeaderboardPurchaseMarkeeTokens, estimateStreamingSettlementMarkeeTokens } from '@/lib/tokenPhases'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { TxProgress, InfoTip, sanitizeDecimalInput, parseEthInput, retryUntilLoaded } from '@/components/modals/StreamUI'
import { useStreamingMarkees, type StreamingMarkee } from '@/lib/contracts/useStreamingMarkees'
import { useCreateStreamFlow, type CreateStreamCalc } from '@/hooks/useCreateStreamFlow'
import { useOpenStreamFlow } from '@/hooks/useOpenStreamFlow'
import { useMoveStreamFlow } from '@/hooks/useMoveStreamFlow'
import { useUpdateStreamRateFlow } from '@/hooks/useUpdateStreamRateFlow'
import { usePendingMarkee } from '@/hooks/usePendingMarkee'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { useTopSince } from '@/hooks/useTopSince'
import { formatDuration, streamStatusOf, StreamStatusIcon, STREAM_STATUS_META } from '@/components/board-detail/shared'

const ETHX = STREAMING_BASE.ethx as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

// ── Design tokens (matches MarkeeSignModal's theme) ─────────────────────────────
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BG   = '#060A2A'
const BG2  = '#0A0F3D'
const PINK = '#F897FE'
const BLUE = '#7C9CFF'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED  = '#8A8FBF'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'
const PURP   = '#7B6AF4'
const GOLD   = '#FFD700'
const FAST_TX_GAS_RESERVE = BigInt('200000000000000') // 0.0002 ETH
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function fmtAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

function formatViewsShort(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function formatMarkeeAmount(n: number): string {
  if (n >= 999_999e12) return '>999,999T'
  if (n >= 1e12) return `${(n / 1e12).toFixed(3)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(3)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)}M`
  if (n > 0 && n < 10) {
    let decimals = 3
    while (decimals < 12 && Number(n.toFixed(decimals)) === 0) decimals++
    if (decimals > 3) decimals = Math.min(decimals + 2, 12)
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function BtnTooltip({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => reason && setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && reason && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
          background: BG2, border: `1px solid ${BORDER}`,
          borderRadius: 8, padding: '7px 12px',
          fontFamily: MONO, fontSize: 11, color: MUTED,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 10,
        }}>
          {reason}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
  fontFamily: MONO, fontSize: 14.5, outline: 'none',
}

// The message field is the emphasized input now (was the rate card) — same glow RateCard used to
// carry, moved here so attention lands on what you're saying before what you're paying.
const messageBoxStyle = {
  ...inputStyle,
  border: `1.5px solid ${PINK}`,
  boxShadow: '0 0 24px rgba(248,151,254,0.08)',
}

// ── Rate card ────────────────────────────────────────────────────────────────
// Matches AmountCard's exact chrome, with ETH/mo unit plus the two streaming-specific pieces kept
// from the old RatePriceCard: the 1/2/3-month duration pills and the "X.XXXX ETH total" line.
function RateCard({
  monthly, setMonthly, fundMonths, setFundMonths, lastPreset, setLastPreset, setHasUserEdited,
  minMonthlyWei, minMonthlyEth, minLoaded, spendableBalance, topMonthlyWei,
  ethPrice, balanceData, busy, calc,
}: {
  monthly: string
  setMonthly: (v: string) => void
  fundMonths: string
  setFundMonths: (v: string) => void
  lastPreset: 'min' | 'max' | 'win' | null
  setLastPreset: (v: 'min' | 'max' | 'win' | null) => void
  setHasUserEdited: (v: boolean) => void
  minMonthlyWei: bigint | undefined
  minMonthlyEth: string
  minLoaded: boolean
  spendableBalance: bigint
  topMonthlyWei: bigint | undefined
  ethPrice: number | null
  balanceData: { value: bigint } | undefined
  busy: boolean
  calc: { monthlyWei: bigint; prefund: bigint; value: bigint }
}) {
  const bidNum = parseFloat(monthly || '0')
  const presetBtnStyle = (active: boolean, activeColor: string, disabled: boolean) => ({
    border: `1px solid ${active ? activeColor : BORDER}`, background: 'transparent',
    color: active ? activeColor : TEXT2, borderRadius: 6, padding: '3px 9px',
    fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1, transition: 'border-color 120ms, color 120ms',
  } as const)
  return (
    <div style={{
      border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px',
      background: BG,
    }}>
      {/* Line 1: monthly rate (left) / presets (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', width: 'max-content' }}>
            <input
              inputMode="decimal"
              value={monthly}
              onChange={e => { setHasUserEdited(true); setMonthly(sanitizeDecimalInput(e.target.value)); setLastPreset(null) }}
              placeholder={minLoaded && minMonthlyWei ? minMonthlyEth : '0.001'}
              disabled={busy}
              style={{
                background: 'transparent', border: 'none', outline: 'none', textAlign: 'left',
                color: TEXT, fontFamily: MONO, fontSize: 22, fontWeight: 800, padding: 0,
                width: `${Math.max(5, (monthly || (minLoaded && minMonthlyWei ? minMonthlyEth : '0.001')).length + 0.5)}ch`,
              }}
            />
            <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETH/mo</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => { if (minMonthlyWei) { setHasUserEdited(true); setMonthly(minMonthlyEth); setLastPreset('min') } }}
            disabled={!minLoaded || busy}
            style={presetBtnStyle(lastPreset === 'min', PINK, !minLoaded || busy)}
          >
            MIN
          </button>
          <button
            type="button"
            onClick={() => {
              const months = BigInt(Math.max(1, Number(fundMonths) || 1))
              if (spendableBalance > 0n) { setHasUserEdited(true); setMonthly(formatEther(spendableBalance / months)); setLastPreset('max') }
            }}
            disabled={spendableBalance <= 0n || busy}
            style={presetBtnStyle(lastPreset === 'max', PINK, spendableBalance <= 0n || busy)}
          >
            MAX
          </button>
          {topMonthlyWei && topMonthlyWei > 0n && minMonthlyWei && (
            <button
              type="button"
              onClick={() => {
                const winWei = (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei
                setHasUserEdited(true); setMonthly(formatEther(winWei)); setLastPreset('win')
              }}
              disabled={busy}
              style={presetBtnStyle(lastPreset === 'win', GOLD, busy)}
            >
              WIN
            </button>
          )}
        </div>
      </div>

      {/* Line 2: USD equiv (left) / balance (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: MONO, fontSize: 11.5, color: MUTED }}>
        <span>{ethPrice && bidNum > 0 ? `≈ ${formatUsd(bidNum * ethPrice)}/mo` : ' '}</span>
        <span>{balanceData ? `Balance ${parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH` : ''}</span>
      </div>

      {/* Line 3: month duration pills (streaming-specific, kept) */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {(['1', '2', '3'] as const).map(mo => {
          const sel = fundMonths === mo
          return (
            <button
              key={mo}
              type="button"
              onClick={() => { setHasUserEdited(true); setFundMonths(mo) }}
              disabled={busy}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${sel ? PINK : BORDER}`,
                background: sel ? PINK : 'transparent',
                color: sel ? BG : TEXT2,
                fontFamily: MONO, fontSize: 12.5, fontWeight: 700,
                opacity: busy ? 0.6 : 1,
                transition: 'border-color 140ms, background 140ms, color 140ms',
              }}
            >
              {mo} mo
            </button>
          )
        })}
      </div>

      {/* Line 4: ETH total (streaming-specific, kept) */}
      {calc.prefund > 0n && (
        <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12 }}>
          <span style={{ color: TEXT, fontWeight: 700 }}>{parseFloat(formatEther(calc.value)).toFixed(4)} ETH</span>
          <span style={{ color: MUTED }}> total</span>
        </div>
      )}
    </div>
  )
}

// Compact 2-line layout: line 1 is [label | MARKEE amount], line 2 is the "earned/mo" caption —
// the "/mo" framing is the other streaming-specific piece kept, matching StreamActivateModal's
// existing MARKEE-earned convention (per-month, not per-transaction total).
function ReceiveCard({ monthly, compact = true }: { monthly: string; compact?: boolean }) {
  const parsed = parseFloat(monthly || '0')
  const bidNum = Number.isFinite(parsed) ? parsed : 0
  const markeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Math.max(0, bidNum))
  return (
    <div style={{
      boxSizing: 'border-box',
      borderRadius: 12, padding: '10px 16px',
      background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))',
      border: '1px solid rgba(248,151,254,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    }}>
      <div style={{ overflowX: 'auto' }}>
        <span style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: -0.5, whiteSpace: 'nowrap' }}>
          {formatMarkeeAmount(markeeEarned)}
        </span>
      </div>
      {compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.1, flexShrink: 0 }}>
          <span style={{ color: PINK, fontSize: 11.5, fontWeight: 400, fontFamily: 'Manrope, system-ui, sans-serif' }}>MARKEE</span>
          <span style={{ color: PINK, fontSize: 11.5, fontWeight: 400, fontFamily: 'Manrope, system-ui, sans-serif' }}>earned/mo</span>
        </div>
      ) : (
        <span style={{ color: PINK, fontSize: 11.5, fontWeight: 400, fontFamily: 'Manrope, system-ui, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>MARKEE earned/mo</span>
      )}
    </div>
  )
}

// Views (left) / "- author" + YOU badge (right). Shared by the leaderboard row and the
// current-message preview box in the Fund sub-view.
function MessageMeta({ views, isOwner, authorLabel }: { views: number; isOwner: boolean; authorLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: MUTED, fontSize: 11.5, flexShrink: 0 }}>
        <Eye size={10} style={{ opacity: 0.7 }} /> {views > 0 ? formatViewsShort(views) : '0'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: MUTED, fontSize: 11.5, minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>- {authorLabel}</span>
        {isOwner && (
          <span style={{ background: `${PURP}33`, color: PURP, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>
            YOU
          </span>
        )}
      </span>
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────
function SignRow({
  markee, rank, views, isOwner, isBacking, onFund, onManage,
}: {
  markee: StreamingMarkee
  rank: number
  views: number
  isOwner: boolean
  isBacking: boolean
  onFund: () => void
  onManage: () => void
}) {
  const isTop = rank === 1
  const subtitle = markee.name || fmtAddr(markee.owner)
  const monthlyEth = Number(formatEther(ratePerSecToMonthly(markee.rate))).toFixed(3)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px',
      margin: '0 0 2px', borderRadius: 10,
      background: isTop ? 'rgba(248,151,254,0.06)' : 'transparent',
      border: `1px solid ${isTop ? 'rgba(248,151,254,0.25)' : 'transparent'}`,
      borderBottom: isTop ? undefined : `1px solid ${BORDER}`,
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 99, flexShrink: 0,
        background: isTop ? PINK : 'rgba(138,143,191,0.12)',
        color: isTop ? BG : MUTED,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: 11, fontWeight: 700,
      }}>
        {rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 14, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {markee.message || '—'}
        </div>
        <div style={{ marginTop: 2 }}>
          <MessageMeta views={views} isOwner={isOwner} authorLabel={subtitle} />
        </div>
      </div>
      <span style={{ color: BLUE, fontFamily: MONO, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{monthlyEth} ETH/mo</span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {isBacking ? (
          <button
            onClick={onManage}
            style={{ background: 'rgba(138,143,191,0.1)', border: `1px solid ${BORDER}`, color: TEXT2, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Manage
          </button>
        ) : (
          <button
            onClick={onFund}
            style={{ background: 'rgba(248,151,254,0.12)', border: `1px solid ${PINK}`, color: PINK, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            + Fund
          </button>
        )}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface StreamSignModalProps {
  isOpen: boolean
  onClose: () => void
  board: string
  initialView?: 'fund' | 'manage'
  initialTargetAddress?: string
  onSuccess?: () => void
}

type View = 'list' | 'fund' | 'manage'

export function StreamSignModal({ isOpen, onClose, board, initialView, initialTargetAddress, onSuccess }: StreamSignModalProps) {
  const boardAddress = board as Address
  const { activeAddress, hasWallet, hasActiveWalletConnection, isWalletConnectionPending } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { meta, markees, refetch: refetchBoard } = useStreamingMarkees(isOpen ? boardAddress : undefined)

  const [view, setView] = useState<View>('list')
  const [target, setTarget] = useState<StreamingMarkee | null>(null)
  const [message, setMessage] = useState('')
  const [monthly, setMonthly] = useState('')
  const [fundMonths, setFundMonths] = useState('1')
  const [newMonthly, setNewMonthly] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [lastPreset, setLastPreset] = useState<'min' | 'max' | 'win' | null>(null)
  const [manageLastPreset, setManageLastPreset] = useState<'current' | 'min' | 'win' | null>(null)

  const { data: balanceData } = useBalance({ address: activeAddress as Address | undefined, chainId: CANONICAL_CHAIN.id })

  const { data: minMonthlyWei } = useReadContract({
    address: boardAddress, abi: StreamingLeaderboardABI, functionName: 'minimumMonthlyRate', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: maxMessageLength } = useReadContract({
    address: boardAddress, abi: StreamingLeaderboardABI, functionName: 'maxMessageLength', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const maxLen = Number(maxMessageLength || 223)

  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const topMarkee = markees[0] ?? null
  const topMonthlyWei = topMarkee ? ratePerSecToMonthly(topMarkee.rate) : undefined
  const minLoaded = minMonthlyWei !== undefined
  const minMonthlyEth = minMonthlyWei ? formatEther(minMonthlyWei) : '0'

  // ── Write flows (called unconditionally; only one is active per view) ──────
  const createFlow = useCreateStreamFlow(boardAddress, isOpen)
  const openFlow = useOpenStreamFlow(boardAddress, target?.address, isOpen)
  const moveFlow = useMoveStreamFlow(boardAddress, target?.address, isOpen)
  const rateFlow = useUpdateStreamRateFlow(boardAddress, isOpen)

  // Which row (if any) the connected wallet currently backs — drives the row-level Manage/Fund
  // choice and the "already backing something else" guard, same signal StreamModal already reads.
  const backedMarkee = rateFlow.backedMarkee as Address | undefined
  const backsOther = !!backedMarkee && backedMarkee !== ZERO_ADDRESS &&
    !(target && backedMarkee.toLowerCase() === target.address.toLowerCase())

  // ── "Manage Your Stream" status header data (view === 'manage') ────────────────
  const { data: ethxBalance, refetch: refetchEthx } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'balanceOf', args: activeAddress ? [activeAddress as Address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen && view === 'manage' && !!activeAddress, refetchInterval: retryUntilLoaded },
  })
  const manageRank = target ? markees.findIndex(m => m.address.toLowerCase() === target.address.toLowerCase()) + 1 : 0
  const fundTargetRank = manageRank
  const manageIsTop = manageRank === 1
  const manageStatus = streamStatusOf(manageIsTop, rateFlow.currentRate ?? 0n)
  const manageRunwayDays = rateFlow.currentRate && rateFlow.currentRate > 0n
    ? Number(runwaySeconds(ethxBalance ?? 0n, rateFlow.currentRate)) / 86400
    : 0
  const manageLowRunway = (rateFlow.currentRate ?? 0n) > 0n && ethxBalance !== undefined && manageRunwayDays < 7

  const topSince = useTopSince(view === 'manage' ? boardAddress : undefined)
  const managePending = usePendingMarkee(view === 'manage' ? boardAddress : undefined, view === 'manage' ? (activeAddress as Address | undefined) : undefined)
  const managePendingEthWei = useFlowingAmount(managePending.pendingWei, managePending.snapshotAt, managePending.ratePerSec)
  const manageEarnedMarkee = estimateStreamingSettlementMarkeeTokens(Number(formatEther(managePendingEthWei)), managePending.feeBps)
  const manageTopSinceMine = manageIsTop && topSince?.address.toLowerCase() === target?.address.toLowerCase()
  const manageStreamedWei = useFlowingAmount(0n, manageTopSinceMine ? topSince!.since : 0, manageTopSinceMine ? (rateFlow.currentRate ?? 0n) : 0n)

  // Cancels the stream/bid outright (view === 'manage' only) — same setFlowrate(...,0) call
  // ManageStreamModal already uses to stop a stream, exposed here so it's reachable without leaving
  // this modal.
  const [cancelTxHash, setCancelTxHash] = useState<Hex | undefined>(undefined)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const { writeContractAsync: writeCancel, isPending: cancelPending } = useWriteContract()
  const { isLoading: cancelConfirming, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelTxHash, chainId: CANONICAL_CHAIN.id })
  async function handleCancel() {
    setCancelError(null)
    try {
      const hash = await writeCancel({
        address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'setFlowrate', args: [ETHX, boardAddress, 0n], chainId: CANONICAL_CHAIN.id,
      })
      setCancelTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'StreamSignModal.cancelStream')
      setCancelError(formatTransactionError(e))
    }
  }
  const cancelBusy = cancelPending || cancelConfirming
  // A deleted flow can't be updateFlow'd -- gate Change Bid the moment the cancel lands, before the
  // rate refetch flips manageStatus.
  const manageStreamGone = manageStatus === 'cancelled' || cancelSuccess
  useEffect(() => {
    if (cancelSuccess && isOpen) {
      rateFlow.refetchRate(); rateFlow.refetchDeposit(); rateFlow.refetchBacked(); refetchBoard()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelSuccess, isOpen])

  // Wraps more ETH into the backer's own ETHx so the live stream keeps running -- the top-up path
  // the deleted ManageStreamModal provided, without which a draining stream gets liquidated and part
  // of the deposit is slashed.
  const [topUp, setTopUp] = useState('')
  const [topUpError, setTopUpError] = useState<string | null>(null)
  const [topUpTxHash, setTopUpTxHash] = useState<Hex | undefined>(undefined)
  const { writeContractAsync: writeTopUp, isPending: topUpPending } = useWriteContract()
  const { isLoading: topUpConfirming, isSuccess: topUpSuccess } = useWaitForTransactionReceipt({ hash: topUpTxHash, chainId: CANONICAL_CHAIN.id })
  const topUpBusy = topUpPending || topUpConfirming
  const topUpWei = parseEthInput(topUp)
  async function handleTopUp() {
    setTopUpError(null)
    if (topUpWei <= 0n) { setTopUpError('Enter an amount to add.'); return }
    if (balanceData && balanceData.value < topUpWei) { setTopUpError('Not enough ETH in your wallet.'); return }
    try {
      const hash = await writeTopUp({
        address: ETHX, abi: ETHX_WRAP_ABI, functionName: 'upgradeByETH', value: topUpWei, chainId: CANONICAL_CHAIN.id,
      })
      setTopUpTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'StreamSignModal.topUp')
      setTopUpError(formatTransactionError(e))
    }
  }
  useEffect(() => {
    if (topUpSuccess && isOpen) {
      refetchEthx()
      const t = setTimeout(() => { setTopUp(''); setTopUpTxHash(undefined) }, 1800)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topUpSuccess, isOpen])

  // Once cancelled, the deposit that secured the stream is free to withdraw -- same withdrawDeposit()
  // call ManageStreamModal used to make, kept reachable here instead of a second modal.
  const [withdrawTxHash, setWithdrawTxHash] = useState<Hex | undefined>(undefined)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const { writeContractAsync: writeWithdraw, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawTxHash, chainId: CANONICAL_CHAIN.id })
  const withdrawBusy = withdrawPending || withdrawConfirming
  async function handleWithdraw() {
    setWithdrawError(null)
    try {
      const hash = await writeWithdraw({
        address: boardAddress, abi: StreamingLeaderboardABI, functionName: 'withdrawDeposit', args: [], chainId: CANONICAL_CHAIN.id,
      })
      setWithdrawTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'StreamSignModal.withdrawDeposit')
      setWithdrawError(formatTransactionError(e))
    }
  }
  useEffect(() => {
    if (withdrawSuccess && isOpen) {
      rateFlow.refetchDeposit()
      const t = setTimeout(() => { onSuccess?.(); onClose() }, 1800)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawSuccess, isOpen])

  // Inline message edit (pencil next to "Message You're Funding") — MarkeeABI.setMessage direct on
  // the markee's own address, same call StreamingBoardDetail's StreamMessageEditModal makes.
  const [editingMessage, setEditingMessage] = useState(false)
  const [editMessageText, setEditMessageText] = useState('')
  const [editMessageError, setEditMessageError] = useState<string | null>(null)
  const { writeContractAsync: writeEditMessage, isPending: editMessagePending } = useWriteContract()
  const [editMessageTxHash, setEditMessageTxHash] = useState<Hex | undefined>(undefined)
  const { isLoading: editMessageConfirming, isSuccess: editMessageSuccess } = useWaitForTransactionReceipt({ hash: editMessageTxHash, chainId: CANONICAL_CHAIN.id })
  const editMessageBusy = editMessagePending || editMessageConfirming
  async function handleSaveMessage() {
    if (!target || !editMessageText.trim()) return
    setEditMessageError(null)
    try {
      const hash = await writeEditMessage({
        address: target.address as Address, abi: MarkeeABI, functionName: 'setMessage', args: [editMessageText], chainId: CANONICAL_CHAIN.id,
      })
      setEditMessageTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'StreamSignModal.editMessage')
      setEditMessageError(formatTransactionError(e))
    }
  }
  useEffect(() => {
    if (editMessageSuccess) {
      const t = setTimeout(() => { setEditingMessage(false); setEditMessageTxHash(undefined); refetchBoard() }, 1400)
      return () => clearTimeout(t)
    }
  }, [editMessageSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Views (batched, per-markee + summed for the header) ────────────────────
  const [viewsMap, setViewsMap] = useState<Map<string, number>>(new Map())
  const markeeAddrKey = markees.map(m => m.address.toLowerCase()).join(',')
  useEffect(() => {
    if (!isOpen || !markeeAddrKey) return
    fetch(`/api/views?addresses=${markeeAddrKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const m = new Map<string, number>()
        for (const [addr, v] of Object.entries(data as Record<string, { totalViews: number }>)) m.set(addr.toLowerCase(), v.totalViews)
        setViewsMap(m)
      })
      .catch(() => {})
  }, [isOpen, markeeAddrKey])
  const totalViews = useMemo(() => Array.from(viewsMap.values()).reduce((a, b) => a + b, 0), [viewsMap])

  // ── Amount derivations ───────────────────────────────────────────────────────
  const calc: CreateStreamCalc = useMemo(() => {
    const monthlyWei = parseEthInput(monthly)
    const ratePerSec = monthlyToRatePerSec(monthlyWei)
    const buffer = bufferFor(ratePerSec)
    const monthsMilli = BigInt(Math.max(0, Math.round((Number(fundMonths) || 0) * 1000)))
    const prefund = (monthlyWei * monthsMilli) / 1000n
    const value = openStreamValue(buffer, prefund)
    return { monthlyWei, ratePerSec, buffer, prefund, value }
  }, [monthly, fundMonths])

  const belowMin = calc.monthlyWei > 0n && !!minMonthlyWei && calc.monthlyWei < minMonthlyWei

  // Moving an existing stream reuses the deposit the board already holds for this backer, so the
  // batch only charges the top-up over it (mirrors useMoveStreamFlow's own math for the tx).
  const moveHeldDeposit = moveFlow.deposit ?? 0n
  const moveDepositTopUp = calc.buffer > moveHeldDeposit ? calc.buffer - moveHeldDeposit : 0n
  const fundCalc = view === 'fund' && backsOther ? { ...calc, value: moveDepositTopUp + calc.prefund } : calc

  const insufficientBalance = !!balanceData && fundCalc.value > 0n && balanceData.value < fundCalc.value
  const spendableBalance = balanceData && balanceData.value > FAST_TX_GAS_RESERVE ? balanceData.value - FAST_TX_GAS_RESERVE : 0n

  // A deleted flow (cancelled or liquidated) clears backerMarkee on-chain, so no row reads as
  // "backed by you" and every entry point lands on list/fund -- surface the reclaimable deposit
  // here too, not only behind the manage view.
  const strandedDeposit = (rateFlow.deposit ?? 0n) > 0n && rateFlow.currentRate === 0n

  const live = useMemo(() => {
    const rate = rateFlow.currentRate && rateFlow.currentRate > 0n ? rateFlow.currentRate : 0n
    const nextMonthlyWei = parseEthInput(newMonthly)
    const nextRate = monthlyToRatePerSec(nextMonthlyWei)
    const required = bufferFor(nextRate)
    const held = rateFlow.deposit ?? 0n
    const depositTopUp = required > held ? required - held : 0n
    return { rate, nextRate, nextMonthlyWei, depositTopUp, changed: nextRate > 0n && nextRate !== rate }
  }, [rateFlow.currentRate, newMonthly, rateFlow.deposit])
  const nextBelowMin = live.nextMonthlyWei > 0n && !!minMonthlyWei && live.nextMonthlyWei < minMonthlyWei
  const currentMonthlyEth = rateFlow.currentRate && rateFlow.currentRate > 0n ? formatEther(ratePerSecToMonthly(rateFlow.currentRate)) : '0'

  // Default the "buy a new message" rate to whatever it takes to win #1, falling back to the
  // floor rate when there's no competition yet. Only runs while the user hasn't touched the field.
  useEffect(() => {
    if (!isOpen || view !== 'list' || hasUserEdited || !minMonthlyWei) return
    if (topMonthlyWei && topMonthlyWei > 0n) {
      const winWei = (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei
      setMonthly(formatEther(winWei)); setLastPreset('win')
    } else {
      setMonthly(minMonthlyEth); setLastPreset('min')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view, hasUserEdited, minMonthlyWei, minMonthlyEth, topMonthlyWei])

  // Pre-selects "Your bid" (the current rate) the moment it loads, so Manage Your Stream opens with
  // a concrete, highlighted starting point instead of an empty field.
  useEffect(() => {
    if (!isOpen || view !== 'manage' || hasUserEdited) return
    if (rateFlow.currentRate && rateFlow.currentRate > 0n) {
      setNewMonthly(formatEther(ratePerSecToMonthly(rateFlow.currentRate))); setManageLastPreset('current')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view, hasUserEdited, rateFlow.currentRate])

  // ── Reset on open/close ──────────────────────────────────────────────────────
  const appliedInitialTargetRef = useRef(false)
  useEffect(() => {
    if (!isOpen) return
    appliedInitialTargetRef.current = false
    setView('list'); setTarget(null); setMessage(''); setMonthly(''); setFundMonths('1'); setNewMonthly('')
    setError(null); setHasUserEdited(false); setLastPreset(null)
    setCancelTxHash(undefined); setCancelError(null)
    setWithdrawTxHash(undefined); setWithdrawError(null)
    setTopUp(''); setTopUpError(null); setTopUpTxHash(undefined)
    setEditingMessage(false); setEditMessageText(''); setEditMessageError(null); setEditMessageTxHash(undefined)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleBuyNew = () => createFlow.activate(message, calc, { maxLen, belowMin, minMonthlyEth })
  const handleFund = () => backsOther
    ? moveFlow.moveStream(calc, { belowMin, minMonthlyEth })
    : openFlow.openStream(calc, { belowMin, minMonthlyEth })
  const handleUpdateRate = () => rateFlow.updateRate(
    { nextRate: live.nextRate, depositTopUp: live.depositTopUp },
    { nextBelowMin, minMonthlyEth, balanceValue: balanceData?.value },
  )

  const openFund = (m: StreamingMarkee) => {
    setTarget(m); setView('fund'); setMonthly(''); setFundMonths('1'); setLastPreset(null)
    setError(null); setHasUserEdited(false)
  }
  const openManage = (m: StreamingMarkee) => {
    setTarget(m); setView('manage'); setNewMonthly(''); setError(null); setHasUserEdited(false)
  }

  // Jump straight into a specific message's fund/manage sub-view, same pattern as MarkeeSignModal.
  useEffect(() => {
    if (!isOpen || !initialTargetAddress || !initialView || appliedInitialTargetRef.current) return
    const m = markees.find(x => x.address.toLowerCase() === initialTargetAddress.toLowerCase())
    if (!m) return
    appliedInitialTargetRef.current = true
    if (initialView === 'fund') openFund(m)
    else openManage(m)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTargetAddress, initialView, markees])

  const backToList = () => {
    setView('list'); setTarget(null); setMessage(''); setError(null); setHasUserEdited(false)
  }

  // ── Success → refetch + close ────────────────────────────────────────────────
  const activeIsSuccess = view === 'list' ? createFlow.isSuccess : view === 'fund' ? (backsOther ? moveFlow.isSuccess : openFlow.isSuccess) : rateFlow.isSuccess
  useEffect(() => {
    if (activeIsSuccess && isOpen) {
      const t = setTimeout(() => {
        refetchBoard()
        backToList()
        onSuccess?.()
      }, 2200)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIsSuccess, isOpen])

  if (!isOpen) return null

  const busy = view === 'list'
    ? createFlow.phase !== 'idle'
    : view === 'fund'
      ? (backsOther
          ? (moveFlow.approving || moveFlow.submitting || moveFlow.isPending || moveFlow.isConfirming)
          : (openFlow.approving || openFlow.submitting || openFlow.isPending || openFlow.isConfirming))
      : (rateFlow.approving || rateFlow.submitting || rateFlow.isPending || rateFlow.isConfirming)
  const activeError = view === 'list' ? createFlow.error : view === 'fund' ? (backsOther ? moveFlow.error : openFlow.error) : rateFlow.error

  const blocksOnBalance = view === 'fund' ? insufficientBalance : view === 'list' ? insufficientBalance : false
  const fundReadsLoading = view === 'fund' && !(backsOther ? moveFlow.readsReady : openFlow.readsReady)
  const btnDisabled = busy || activeIsSuccess || blocksOnBalance || fundReadsLoading
  const btnDisabledReason = busy ? 'Transaction in progress'
    : fundReadsLoading ? 'Loading on-chain data…'
    : blocksOnBalance ? "You don't have enough ETH for this"
    : null

  const stepLabel = view === 'fund' ? 'FUND MESSAGE' : view === 'manage' ? 'MANAGE YOUR STREAM' : 'CHANGE THE MARKEE SIGN'

  const createSteps = [
    { label: 'Create Markee Message', done: createFlow.phase !== 'creating' && createFlow.phase !== 'idle', active: createFlow.phase === 'creating' },
    { label: 'Approve Deposit', done: createFlow.phase === 'streaming' || createFlow.isSuccess, active: createFlow.phase === 'approving' },
    { label: 'Start Stream', done: createFlow.isSuccess, active: createFlow.phase === 'streaming' },
  ]

  const txHeadline = view === 'list'
    ? (createFlow.isSuccess ? 'Success! Your message is live'
      : createFlow.phase === 'creating' ? (createFlow.isPending ? 'Waiting for wallet…' : 'Creating your message…')
      : createFlow.phase === 'approving' ? (createFlow.isPending ? 'Waiting for wallet…' : 'Approving the deposit…')
      : createFlow.isPending ? 'Waiting for wallet…' : 'Starting your stream…')
    : view === 'fund'
      ? (backsOther
          ? (moveFlow.isSuccess ? 'Success! Your stream moved to this message'
            : moveFlow.approving ? (moveFlow.isPending ? 'Waiting for wallet…' : 'Approving the deposit…')
            : moveFlow.isPending ? 'Waiting for wallet…' : 'Confirming on Base')
          : (openFlow.isSuccess ? 'Success! Funds added to the sign'
            : openFlow.approving ? (openFlow.isPending ? 'Waiting for wallet…' : 'Approving the deposit…')
            : openFlow.isPending ? 'Waiting for wallet…' : 'Confirming on Base'))
      : (rateFlow.isSuccess ? 'Success! Your rate is updated'
        : rateFlow.approving ? (rateFlow.isPending ? 'Waiting for wallet…' : 'Approving the deposit…')
        : rateFlow.isPending ? 'Waiting for wallet…' : 'Confirming on Base')

  return (
    <div
      onClick={() => { if ((!hasUserEdited || busy || activeIsSuccess) && !cancelBusy && !editMessageBusy && !withdrawBusy && !topUpBusy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeIn 180ms ease forwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: BG2, borderRadius: 16,
          border: `1px solid ${BORDER}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'Manrope, system-ui, sans-serif', color: TEXT, overflow: 'hidden',
          animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 16, color: TEXT, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            {stepLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {view === 'list' && totalViews > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: MUTED, fontFamily: MONO, fontSize: 12 }}>
                <Eye size={13} /> {totalViews.toLocaleString()}
              </span>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}>×</button>
          </div>
        </div>

        {/* ── Tx state panel ── */}
        {busy || activeIsSuccess ? (
          <TxProgress
            isSuccess={activeIsSuccess}
            headline={txHeadline}
            detail={activeIsSuccess ? 'The sign will refresh in a moment.' : 'Usually under 2 seconds on Base.'}
            steps={view === 'list' ? createSteps : undefined}
          />

        ) : isWalletConnectionPending ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Preparing your wallet connection...</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : !hasWallet || !hasActiveWalletConnection ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>

        ) : isWrongChain ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to use Markee.</p>
            <button
              onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              Switch to Base
            </button>
          </div>

        ) : (
          <>
            <div style={{ padding: '22px 22px 0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {view !== 'list' && (
                <button
                  onClick={backToList}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: PINK, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 18 }}
                >
                  ← Back
                </button>
              )}

              {view !== 'manage' && (strandedDeposit || withdrawSuccess) && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)',
                  padding: '10px 14px', marginBottom: 16, flexShrink: 0,
                }}>
                  {withdrawSuccess ? (
                    <span style={{ fontFamily: MONO, fontSize: 12, color: '#7EE787' }}>✓ Deposit withdrawn</span>
                  ) : (
                    <>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>
                        Your stream on this board is stopped, so your {formatEther(rateFlow.deposit ?? 0n)} ETH deposit is free to withdraw.
                      </span>
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        disabled={withdrawBusy}
                        style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: withdrawBusy ? 0.5 : 1 }}
                      >
                        {withdrawBusy ? 'Withdrawing…' : 'Withdraw Deposit'}
                      </button>
                    </>
                  )}
                  {withdrawError && !withdrawSuccess && (
                    <span style={{ fontFamily: MONO, fontSize: 11, color: '#FF8E8E' }}>{withdrawError}</span>
                  )}
                </div>
              )}

              {view === 'list' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>Set your message</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{message.length}/{maxLen}</span>
                    </div>
                    <textarea
                      value={message}
                      onChange={e => { setHasUserEdited(true); setMessage(e.target.value.slice(0, maxLen)); if (error) setError(null) }}
                      placeholder={`Your message here... (${maxLen} max)`}
                      rows={2}
                      style={{ ...messageBoxStyle, resize: 'vertical' }}
                      disabled={busy}
                    />
                  </div>

                  <div style={{ marginBottom: 10, flexShrink: 0 }}>
                    <RateCard
                      monthly={monthly} setMonthly={setMonthly} fundMonths={fundMonths} setFundMonths={setFundMonths}
                      lastPreset={lastPreset} setLastPreset={setLastPreset} setHasUserEdited={setHasUserEdited}
                      minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded}
                      spendableBalance={spendableBalance} topMonthlyWei={topMonthlyWei}
                      ethPrice={ethPrice} balanceData={balanceData} busy={busy} calc={calc}
                    />
                  </div>

                  {activeError && (
                    <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px', flexShrink: 0 }}>{activeError}</p>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8, flexShrink: 0 }}>
                    <ReceiveCard monthly={monthly} />
                    <BtnTooltip reason={btnDisabledReason}>
                      <button
                        onClick={handleBuyNew}
                        disabled={btnDisabled}
                        style={{
                          width: '100%', height: '100%', boxSizing: 'border-box',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: PINK, color: BG, border: 'none', borderRadius: 10,
                          fontFamily: 'inherit', fontWeight: 800, fontSize: 17,
                          cursor: btnDisabled ? 'not-allowed' : 'pointer',
                          opacity: btnDisabled ? 0.4 : 1, transition: 'opacity 140ms',
                        }}
                      >
                        Buy Message
                      </button>
                    </BtnTooltip>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, flexShrink: 0, fontFamily: MONO, fontSize: 12.5, color: MUTED }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      62/38 split
                      <InfoTip align="right">
                        62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
                      </InfoTip>
                    </span>
                  </div>

                  {markees.length > 0 && (
                    <>
                      <div style={{ textAlign: 'center', margin: '10px 0 0', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: BORDER }} />
                        <span style={{ position: 'relative', background: BG2, padding: '0 12px', fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>
                          Or add funds to an existing message
                        </span>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10, marginBottom: 18 }}>
                        {markees.map((m, i) => (
                          <SignRow
                            key={m.address}
                            markee={m}
                            rank={i + 1}
                            views={viewsMap.get(m.address.toLowerCase()) ?? 0}
                            isOwner={!!activeAddress && m.owner.toLowerCase() === activeAddress.toLowerCase()}
                            isBacking={!!backedMarkee && backedMarkee.toLowerCase() === m.address.toLowerCase()}
                            onFund={() => openFund(m)}
                            onManage={() => openManage(m)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {view === 'fund' && target && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: `1.5px solid ${fundTargetRank === 1 ? GOLD : BORDER}`, color: fundTargetRank === 1 ? GOLD : MUTED,
                      fontFamily: MONO, fontSize: 10.5, fontWeight: 800,
                    }}>
                      {fundTargetRank || '—'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase() && (
                          <Pencil size={12} style={{ color: MUTED, flexShrink: 0 }} />
                        )}
                        <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>{target.message || '—'}</div>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <MessageMeta
                          views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                          isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                          authorLabel={target.name || fmtAddr(target.owner)}
                        />
                      </div>
                    </div>
                  </div>
                  {backsOther && (
                    <p style={{ fontSize: 12.5, color: TEXT2, lineHeight: 1.6, margin: '0 0 14px' }}>
                      You already stream to another message on this board. Funding this one moves your
                      existing stream here in a single transaction — no need to cancel it first.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <RateCard
                      monthly={monthly} setMonthly={setMonthly} fundMonths={fundMonths} setFundMonths={setFundMonths}
                      lastPreset={lastPreset} setLastPreset={setLastPreset} setHasUserEdited={setHasUserEdited}
                      minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded}
                      spendableBalance={spendableBalance} topMonthlyWei={topMonthlyWei}
                      ethPrice={ethPrice} balanceData={balanceData} busy={busy} calc={fundCalc}
                    />
                    <ReceiveCard monthly={monthly} compact={false} />
                  </div>
                </div>
              )}

              {view === 'manage' && target && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
                  {/* ── Status header ── */}
                  <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                      <StreamStatusIcon status={manageStatus} />
                      <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: STREAM_STATUS_META[manageStatus].color }}>
                        {STREAM_STATUS_META[manageStatus].label}
                      </span>
                      <span style={{
                        width: 20, height: 20, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${manageIsTop ? GOLD : BORDER}`, color: manageIsTop ? GOLD : MUTED,
                        fontFamily: MONO, fontSize: 10.5, fontWeight: 800,
                      }}>
                        {manageRank || '—'}
                      </span>
                      {manageTopSinceMine && (
                        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>
                          featured {formatDuration(Date.now() / 1000 - topSince!.since)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>Total streamed</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, marginTop: 2 }}>
                          {manageTopSinceMine ? `${parseFloat(formatEther(manageStreamedWei)).toFixed(5)} ETH` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>ETHx balance</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, marginTop: 2 }}>{Number(formatEther(ethxBalance ?? 0n)).toFixed(5)} ETH</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>Runs for</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: manageLowRunway ? '#FF8E8E' : TEXT, fontWeight: manageLowRunway ? 700 : 400, marginTop: 2 }}>
                          {manageStatus !== 'cancelled' ? `~${manageRunwayDays.toFixed(1)} days` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {managePending.mintsMarkee ? 'MARKEE earned' : 'ETH earned'}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, marginTop: 2 }}>
                          {managePending.mintsMarkee
                            ? manageEarnedMarkee.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : `${Number(formatEther(managePendingEthWei)).toFixed(5)} ETH`}
                        </div>
                      </div>
                    </div>
                    {manageLowRunway && (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: '#FF8E8E', lineHeight: 1.5 }}>
                        Your funding runs out in ~{manageRunwayDays.toFixed(1)} days. If it runs dry the stream is
                        force-closed and part of your deposit is lost, so add funding to keep it running.
                      </div>
                    )}
                    {!manageStreamGone && (
                      topUpSuccess ? (
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#7EE787' }}>✓ Funding added</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              inputMode="decimal"
                              value={topUp}
                              onChange={e => { setTopUp(sanitizeDecimalInput(e.target.value)); if (topUpError) setTopUpError(null) }}
                              placeholder="Add funding (ETH)"
                              disabled={topUpBusy}
                              style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '7px 10px' }}
                            />
                            <button
                              type="button"
                              onClick={handleTopUp}
                              disabled={topUpBusy || topUpWei <= 0n}
                              style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap', opacity: topUpBusy || topUpWei <= 0n ? 0.5 : 1 }}
                            >
                              {topUpBusy ? 'Adding…' : 'Add Funding'}
                            </button>
                          </div>
                          {topUpError && <span style={{ fontFamily: MONO, fontSize: 11, color: '#FF8E8E' }}>{topUpError}</span>}
                        </div>
                      )
                    )}
                  </div>

                  {/* ── Message you're funding ── */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>Message you&apos;re funding</span>
                      {!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase() && !editingMessage && (
                        <button
                          type="button"
                          onClick={() => { setEditingMessage(true); setEditMessageText(target.message || '') }}
                          title="Edit message"
                          style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: MUTED, lineHeight: 0 }}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                    {editingMessage ? (
                      <div>
                        <textarea
                          value={editMessageText}
                          onChange={e => setEditMessageText(e.target.value.slice(0, maxLen))}
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical' as const }}
                          disabled={editMessageBusy}
                        />
                        {editMessageError && <p style={{ fontSize: 11, color: '#FF8E8E', margin: '6px 0 0' }}>{editMessageError}</p>}
                        {editMessageSuccess ? (
                          <p style={{ fontSize: 11, color: '#7EE787', margin: '6px 0 0' }}>✓ Message updated</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button onClick={handleSaveMessage} disabled={editMessageBusy || !editMessageText.trim()} style={{ background: PINK, color: BG, border: 'none', borderRadius: 6, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', opacity: editMessageBusy || !editMessageText.trim() ? 0.5 : 1 }}>
                              {editMessageBusy ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingMessage(false)} disabled={editMessageBusy} style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45 }}>
                        {target.message || '—'}
                        <div style={{ marginTop: 6 }}>
                          <MessageMeta
                            views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                            isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                            authorLabel={target.name || fmtAddr(target.owner)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Bid amount ── */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>New monthly rate</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => { setHasUserEdited(true); setNewMonthly(currentMonthlyEth); setManageLastPreset('current') }}
                          disabled={busy}
                          style={{ border: `1px solid ${manageLastPreset === 'current' ? PINK : BORDER}`, background: 'transparent', color: manageLastPreset === 'current' ? PINK : TEXT2, borderRadius: 6, padding: '3px 9px', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          YOUR BID
                        </button>
                        {minMonthlyWei && (
                          <button
                            type="button"
                            onClick={() => { setHasUserEdited(true); setNewMonthly(minMonthlyEth); setManageLastPreset('min') }}
                            disabled={busy}
                            style={{ border: `1px solid ${manageLastPreset === 'min' ? PINK : BORDER}`, background: 'transparent', color: manageLastPreset === 'min' ? PINK : TEXT2, borderRadius: 6, padding: '3px 9px', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                          >
                            MIN
                          </button>
                        )}
                        {topMonthlyWei && topMonthlyWei > 0n && minMonthlyWei && !manageIsTop && (
                          <button
                            type="button"
                            onClick={() => {
                              const winWei = (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei
                              setHasUserEdited(true); setNewMonthly(formatEther(winWei)); setManageLastPreset('win')
                            }}
                            disabled={busy}
                            style={{ border: `1px solid ${manageLastPreset === 'win' ? GOLD : BORDER}`, background: 'transparent', color: manageLastPreset === 'win' ? GOLD : TEXT2, borderRadius: 6, padding: '3px 9px', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}
                          >
                            WIN
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      inputMode="decimal"
                      value={newMonthly}
                      onChange={e => { setHasUserEdited(true); setNewMonthly(sanitizeDecimalInput(e.target.value)); setManageLastPreset(null); if (error) setError(null) }}
                      placeholder={currentMonthlyEth}
                      style={inputStyle}
                      disabled={busy}
                    />
                    {nextBelowMin ? (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: PINK, marginTop: 6 }}>
                        The minimum on this board is {minMonthlyEth} ETH / month.
                      </div>
                    ) : minLoaded && (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 6 }}>
                        Minimum {minMonthlyEth} ETH / month
                      </div>
                    )}
                    {live.depositTopUp > 0n && !nextBelowMin && (
                      <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 6, display: 'flex', alignItems: 'center' }}>
                        Adds {formatEther(live.depositTopUp)} ETH to your deposit
                        <InfoTip>
                          A higher rate needs a larger security deposit, taken with this transaction.
                          The whole deposit is returned when you stop the stream.
                        </InfoTip>
                      </div>
                    )}
                  </div>

                  {/* ── Cancel / withdraw ── */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                    {withdrawSuccess ? (
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#7EE787' }}>✓ Deposit withdrawn</span>
                    ) : manageStreamGone && (rateFlow.deposit ?? 0n) > 0n ? (
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        disabled={withdrawBusy || busy}
                        style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', opacity: withdrawBusy || busy ? 0.5 : 1 }}
                      >
                        {withdrawBusy ? 'Withdrawing…' : 'Withdraw Deposit'}
                      </button>
                    ) : cancelSuccess ? (
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#7EE787' }}>✓ Cancelled</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelBusy || busy}
                        style={{ background: 'transparent', color: '#FF8E8E', border: '1px solid rgba(255,142,142,0.4)', borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', opacity: cancelBusy || busy ? 0.5 : 1 }}
                      >
                        {cancelBusy ? 'Cancelling…' : manageStatus === 'active' ? 'Cancel Stream' : 'Cancel Bid'}
                      </button>
                    )}
                  </div>
                  {(cancelError || withdrawError) && <p style={{ fontSize: 12, color: '#FF8E8E', margin: 0, textAlign: 'right' as const }}>{cancelError || withdrawError}</p>}
                </div>
              )}

              {view !== 'list' && activeError && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>{activeError}</p>
              )}
            </div>

            {/* ── Footer (fund / manage only — list inlines its own CTA above the leaderboard) ── */}
            {view !== 'list' && (
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                {view === 'manage'
                  ? 'As the current backer, only you can change your rate.'
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      62/38 split
                      <InfoTip>
                        62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
                      </InfoTip>
                    </span>}
              </div>
              <BtnTooltip reason={view === 'manage' ? (rateFlow.approving || rateFlow.submitting ? 'Transaction in progress' : manageStreamGone ? 'This stream is cancelled' : !live.changed ? 'Enter a different rate' : nextBelowMin ? `Minimum is ${minMonthlyEth} ETH/mo` : null) : btnDisabledReason}>
                <button
                  onClick={() => { if (view === 'fund') handleFund(); else handleUpdateRate() }}
                  disabled={view === 'manage' ? (busy || !live.changed || nextBelowMin || manageStreamGone) : btnDisabled}
                  style={{
                    background: PINK, color: BG, border: 'none', borderRadius: 8,
                    padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: (view === 'manage' ? (busy || !live.changed || nextBelowMin || manageStreamGone) : btnDisabled) ? 0.4 : 1,
                    transition: 'opacity 140ms',
                  }}
                >
                  {view === 'fund' ? (fundReadsLoading ? 'Loading…' : backsOther ? 'Move Your Stream' : 'Fund Message') : 'Change Bid'}
                </button>
              </BtnTooltip>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
