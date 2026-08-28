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
  monthlyToRatePerSec, ratePerSecToMonthly, bufferFor, runwaySeconds,
  STREAMING_BASE, CFA_FORWARDER_ABI,
  computeAutoDeposit, formatRunwayShort, roundUpToNearestThousandth,
  formatEthxBalanceDisplay, cleanEthAmountInput, DISPLAY_DUST_WEI,
} from '@/lib/superfluid/streaming'
import { DepositManagerModal } from '@/components/modals/DepositManagerModal'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd, formatMarkeeAmount, VIEWS_ADDRESS_LIMIT } from '@/lib/utils'
import { estimateLeaderboardPurchaseMarkeeTokens, estimateStreamingSettlementMarkeeTokens } from '@/lib/tokenPhases'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { TxProgress, InfoTip, sanitizeDecimalInput, parseEthInput, retryUntilLoaded, PaymentReviewCard, PaymentReviewFooter, MessageLoading } from '@/components/modals/StreamUI'
import { useStreamingMarkees, type StreamingMarkee } from '@/lib/contracts/useStreamingMarkees'
import { useCreateStreamFlow, type CreateStreamCalc } from '@/hooks/useCreateStreamFlow'
import { useOpenStreamFlow } from '@/hooks/useOpenStreamFlow'
import { useMoveStreamFlow } from '@/hooks/useMoveStreamFlow'
import { useUpdateStreamRateFlow } from '@/hooks/useUpdateStreamRateFlow'
import { usePendingMarkee } from '@/hooks/usePendingMarkee'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { useTopSince } from '@/hooks/useTopSince'
import { formatDuration, decimalsForRate, decimalsForWeiRate, streamStatusOf, StreamStatusIcon, STREAM_STATUS_META } from '@/components/board-detail/shared'
import { MONO, PINK, BLUE, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'
import { formatLiveEth } from '@/hooks/useLiveBalance'

const ETHX = STREAMING_BASE.ethx as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

// ── Design tokens (matches MarkeeSignModal's theme) ─────────────────────────────
const PURP   = '#7B6AF4'
const GOLD   = '#FFD700'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function fmtAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

function formatViewsShort(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
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
// Matches AmountCard's exact chrome, with an ETH/mo unit plus the auto-deposit line that replaced
// the old 1/2/3-month picker: how much (if anything) gets wrapped to ETHx this tx, and how long the
// resulting balance sustains the bid, with a link out to the Deposit Manager.
function RateCard({
  monthly, setMonthly, lastPreset, setLastPreset, setHasUserEdited,
  minMonthlyWei, minMonthlyEth, minLoaded, topMonthlyWei,
  isAlreadyTop = false, twoXMonthlyEth = null,
  ethPrice, ethxBalance, walletEthBalance, busy, calc, runwaySecs, onOpenDepositManager,
}: {
  monthly: string
  setMonthly: (v: string) => void
  lastPreset: 'min' | 'win' | null
  setLastPreset: (v: 'min' | 'win' | null) => void
  setHasUserEdited: (v: boolean) => void
  minMonthlyWei: bigint | undefined
  minMonthlyEth: string
  minLoaded: boolean
  topMonthlyWei: bigint | undefined
  // Funding a message that's already #1: "beat the current top" is meaningless when you already are
  // it, so the WIN preset becomes "2X your own current rate" instead.
  isAlreadyTop?: boolean
  twoXMonthlyEth?: string | null
  ethPrice: number | null
  ethxBalance: bigint | undefined
  walletEthBalance: bigint | undefined
  busy: boolean
  calc: { monthlyWei: bigint; prefund: bigint; value: bigint }
  runwaySecs: bigint
  onOpenDepositManager: () => void
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
            <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETHx/mo</span>
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
          {isAlreadyTop ? (
            twoXMonthlyEth && (
              <button
                type="button"
                onClick={() => { setHasUserEdited(true); setMonthly(twoXMonthlyEth); setLastPreset('win') }}
                disabled={busy}
                style={presetBtnStyle(lastPreset === 'win', GOLD, busy)}
              >
                2X
              </button>
            )
          ) : (
            topMonthlyWei && topMonthlyWei > 0n && minMonthlyWei && (
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
            )
          )}
        </div>
      </div>

      {/* Line 2: USD equiv (left) / balance (right) — ETHx once there's any, otherwise the wallet's
          plain ETH balance (an empty "ETHx Balance 0.000" tells a first-time backer nothing useful). */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontFamily: MONO, fontSize: 11.5, color: MUTED }}>
        <span>{ethPrice && bidNum > 0 ? `≈ ${formatUsd(bidNum * ethPrice)}/mo` : ' '}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {ethxBalance && ethxBalance > 0n
            ? <>ETHx Balance {formatEthxBalanceDisplay(ethxBalance)}</>
            : <>ETH Balance {parseFloat(formatEther(walletEthBalance ?? 0n)).toFixed(3)}</>}
          <InfoTip align="right">Markee uses Superfluid for payment streaming. Deposit ETH to get ETHx you can use for payments.</InfoTip>
        </span>
      </div>

      <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />

      {/* Deposit Manager link (left) / right side — replaces the old month picker. calc.value > 0
          means the wallet's existing ETHx balance doesn't already cover this bid, so fresh ETH gets
          wrapped on top of it this tx -- show that deposit amount (with an info tip explaining the
          runway it buys) instead of the runway itself, since "how much leaves your wallet right now"
          is the more useful number to see before a first transaction. Once no deposit is needed,
          fall back to just showing the runway. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          type="button"
          onClick={onOpenDepositManager}
          style={{ background: 'transparent', border: 'none', color: PINK, fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          Deposit Manager →
        </button>
        {calc.value > DISPLAY_DUST_WEI ? (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT }}>{parseFloat(formatEther(calc.value)).toFixed(4)} ETH</span>
            <InfoTip align="right">
              Your first transaction will deposit {parseFloat(formatEther(calc.value)).toFixed(4)} ETH as ETHx, enough to stream for {formatRunwayShort(runwaySecs)}. Go to the Deposit Manager to deposit a different amount than this.
            </InfoTip>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT }}>{formatRunwayShort(runwaySecs)}</span>
            <InfoTip align="right">
              How long your message can stream for based on your ETHx balance. To add more, go to the Deposit Manager.
            </InfoTip>
          </span>
        )}
      </div>
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
  // The board page already has these loaded by the time this modal can be opened -- passing them in
  // lets the Win/2X default apply immediately instead of waiting on this modal's own fresh
  // useStreamingMarkees fetch (a full per-markee multicall) to complete from scratch.
  topMonthlyWeiHint?: bigint
  minMonthlyWeiHint?: bigint
}

type View = 'list' | 'fund' | 'manage'

export function StreamSignModal({ isOpen, onClose, board, initialView, initialTargetAddress, onSuccess, topMonthlyWeiHint, minMonthlyWeiHint }: StreamSignModalProps) {
  const boardAddress = board as Address
  const { activeAddress, hasWallet, hasActiveWalletConnection, isWalletConnectionPending } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { meta, markees, refetch: refetchBoard } = useStreamingMarkees(isOpen ? boardAddress : undefined)

  const [view, setView] = useState<View>('list')
  const [target, setTarget] = useState<StreamingMarkee | null>(null)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [monthly, setMonthly] = useState('')
  const [newMonthly, setNewMonthly] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [lastPreset, setLastPreset] = useState<'min' | 'win' | null>(null)
  const [manageLastPreset, setManageLastPreset] = useState<'min' | 'win' | null>(null)
  const [depositManagerOpen, setDepositManagerOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  const { data: balanceData } = useBalance({ address: activeAddress as Address | undefined, chainId: CANONICAL_CHAIN.id })

  const { data: minMonthlyWeiFetched } = useReadContract({
    address: boardAddress, abi: StreamingLeaderboardABI, functionName: 'minimumMonthlyRate', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: maxMessageLength } = useReadContract({
    address: boardAddress, abi: StreamingLeaderboardABI, functionName: 'maxMessageLength', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const { data: maxNameLength } = useReadContract({
    address: boardAddress, abi: StreamingLeaderboardABI, functionName: 'maxNameLength', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const maxLen = Number(maxMessageLength || 223)
  const maxNameLen = Number(maxNameLength || 32)

  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const topMarkee = markees[0] ?? null
  // Prefer this modal's own fresh reads once they land, but fall back to the caller's hint (the
  // board page's already-loaded data) so Win/2X can apply on the very first render instead of
  // waiting on a redundant fetch this modal would otherwise have to do from scratch.
  const minMonthlyWei = minMonthlyWeiFetched ?? minMonthlyWeiHint
  const topMonthlyWei = (topMarkee ? ratePerSecToMonthly(topMarkee.rate) : undefined) ?? topMonthlyWeiHint
  const minLoaded = minMonthlyWei !== undefined
  // Rounded up to the nearest 0.001 ETH for display/MIN-preset purposes -- the raw on-chain minimum
  // is sometimes deliberately a hair under a round number (see monthlyToRatePerSec), which would
  // otherwise show up as an ugly "0.000999999997884" placeholder.
  const minMonthlyEth = minMonthlyWei ? formatEther(roundUpToNearestThousandth(minMonthlyWei)) : '0'

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

  // ETHx balance -- drives the "Manage Your Stream" status header, and (list/fund) the auto-deposit
  // amount that replaced the old 1/2/3-month picker.
  const { data: ethxBalance } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'balanceOf', args: activeAddress ? [activeAddress as Address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen && !!activeAddress, refetchInterval: retryUntilLoaded },
  })
  const manageRank = target ? markees.findIndex(m => m.address.toLowerCase() === target.address.toLowerCase()) + 1 : 0
  const fundTargetRank = manageRank
  const fundTargetIsTop = fundTargetRank === 1
  const fundTwoXMonthlyEth = target ? cleanEthAmountInput(ratePerSecToMonthly(target.rate) * 2n) : null
  const manageIsTop = manageRank === 1
  const manageStatus = streamStatusOf(manageIsTop, rateFlow.currentRate ?? 0n)
  const manageRunwayDays = rateFlow.currentRate && rateFlow.currentRate > 0n
    ? Number(runwaySeconds(ethxBalance ?? 0n, rateFlow.currentRate)) / 86400
    : 0
  const manageLowRunway = (rateFlow.currentRate ?? 0n) > 0n && ethxBalance !== undefined && manageRunwayDays < 7

  const topSince = useTopSince(view === 'manage' ? boardAddress : undefined)
  const managePending = usePendingMarkee(view === 'manage' ? boardAddress : undefined, view === 'manage' ? (activeAddress as Address | undefined) : undefined)
  const manageTopSinceMine = manageIsTop && topSince?.address.toLowerCase() === target?.address.toLowerCase()

  // 2X preset for the manage view's RateCard -- same "double your own current rate" convention the
  // fund view's fundTwoXMonthlyEth uses when isAlreadyTop.
  const manageTwoXMonthlyEth = manageIsTop && rateFlow.currentRate && rateFlow.currentRate > 0n
    ? cleanEthAmountInput(ratePerSecToMonthly(rateFlow.currentRate) * 2n) : null

  // Cancels the stream/bid outright (view === 'manage' only) — same setFlowrate(...,0) call
  // ManageStreamModal already uses to stop a stream, exposed here so it's reachable without leaving
  // this modal. Declared before the live-ticking figures below so they can freeze the instant the
  // cancel tx confirms, instead of waiting on rateFlow/managePending's own refetch to catch up.
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

  // Decimals derived from the actual accrual rate so the last digit visibly ticks about once a
  // second, instead of a fixed decimal count that looks frozen at typical low stream rates.
  // Rate forced to 0 once manageStreamGone -- otherwise this keeps ticking off managePending's own
  // (slower-to-refetch) rate for a beat after the cancel tx has already confirmed.
  const manageEthDecimals = decimalsForWeiRate(managePending.ratePerSec)
  // useFlowingAmount (not useLiveBalance) here specifically: pendingWei is a snapshot true as of
  // managePending.snapshotAt, not "now". useLiveBalance re-anchors to whenever this hook itself last
  // ran, silently understating everything accrued between that on-chain snapshot and this render --
  // exactly the "Markee earned doesn't match what the tx actually pays out" gap Gossman flagged.
  // ClaimModal computes the real claim amount the same way (pending.pendingWei, pending.snapshotAt).
  const managePendingEthWei = useFlowingAmount(managePending.pendingWei, managePending.snapshotAt, manageStreamGone ? 0n : managePending.ratePerSec)
  const manageEarnedMarkee = estimateStreamingSettlementMarkeeTokens(Number(formatEther(managePendingEthWei)), managePending.feeBps)
  const manageMarkeeRatePerSec = managePending.mintsMarkee
    ? estimateStreamingSettlementMarkeeTokens(Number(formatEther(managePending.ratePerSec)), managePending.feeBps)
    : 0
  const manageMarkeeDecimals = decimalsForRate(manageMarkeeRatePerSec, 2, 12)
  // Nothing accrued, ever settled, and not currently top -- this backer's stream has never actually
  // been the winning one, so the usual stat grid (which is all zero/dash in that case) is replaced
  // with an explanation instead.
  const manageNeverWon = !manageIsTop && managePending.pendingWei === 0n && managePending.settledBalance === 0n
  // Ticks "featured for" forward every second (only while it's actually shown) so it visibly grows
  // instead of only updating whenever something else happens to re-render the modal.
  const [featuredNow, setFeaturedNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isOpen || view !== 'manage' || !manageTopSinceMine) return
    const id = setInterval(() => setFeaturedNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isOpen, view, manageTopSinceMine])
  // useFlowingAmount (not useLiveBalance) here specifically: this needs to tick up from
  // topSince.since, a timestamp that can be well in the past -- useLiveBalance always re-anchors to
  // "now", which would silently reset this to a since-page-load total instead of since-became-top.
  // Frozen the same way once manageStreamGone, for the same reason.
  const manageStillStreaming = manageTopSinceMine && !manageStreamGone
  const manageStreamedDecimals = decimalsForWeiRate(manageStillStreaming ? (rateFlow.currentRate ?? 0n) : 0n)
  const manageStreamedWei = useFlowingAmount(0n, manageStillStreaming ? topSince!.since : 0, manageStillStreaming ? (rateFlow.currentRate ?? 0n) : 0n)

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
  const markeeAddrKey = markees.slice(0, VIEWS_ADDRESS_LIMIT).map(m => m.address.toLowerCase()).join(',')
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
  // calc.value is what actually gets wrapped fresh this tx (0 when the wallet's existing ETHx
  // balance already covers the rate's buffer + a healthy runway) -- replaces the old flat
  // 1/2/3-month picker. calc.prefund is the resulting total left in the wallet after the buffer
  // pull, combining any pre-existing balance with the fresh wrap.
  const calc: CreateStreamCalc = useMemo(() => {
    const monthlyWei = parseEthInput(monthly)
    const ratePerSec = monthlyToRatePerSec(monthlyWei, minMonthlyWei)
    const buffer = bufferFor(ratePerSec)
    const auto = computeAutoDeposit(ethxBalance ?? 0n, ratePerSec, balanceData?.value ?? 0n)
    return { monthlyWei, ratePerSec, buffer, prefund: auto.prefund, value: auto.wrapValue }
  }, [monthly, ethxBalance, balanceData?.value, minMonthlyWei])

  const belowMin = calc.monthlyWei > 0n && !!minMonthlyWei && calc.monthlyWei < minMonthlyWei
  const runway = runwaySeconds(calc.prefund, calc.ratePerSec)

  // Moving an existing stream reuses the deposit the board already holds for this backer, so the
  // batch only tops up the shortfall over it -- useMoveStreamFlow adds calc.value (the fresh wrap)
  // on top of that top-up internally; mirrored here only for the balance-sufficiency check below.
  const moveHeldDeposit = moveFlow.deposit ?? 0n
  const moveDepositTopUp = calc.buffer > moveHeldDeposit ? calc.buffer - moveHeldDeposit : 0n
  const fundTotalValue = view === 'fund' && backsOther ? moveDepositTopUp + calc.value : calc.value

  const insufficientBalance = !!balanceData && fundTotalValue > 0n && balanceData.value < fundTotalValue

  const live = useMemo(() => {
    const rate = rateFlow.currentRate && rateFlow.currentRate > 0n ? rateFlow.currentRate : 0n
    const nextMonthlyWei = parseEthInput(newMonthly)
    const nextRate = monthlyToRatePerSec(nextMonthlyWei, minMonthlyWei)
    const required = bufferFor(nextRate)
    const held = rateFlow.deposit ?? 0n
    const depositTopUp = required > held ? required - held : 0n
    return { rate, nextRate, nextMonthlyWei, depositTopUp, changed: nextRate > 0n && nextRate !== rate }
  }, [rateFlow.currentRate, newMonthly, rateFlow.deposit, minMonthlyWei])
  const nextBelowMin = live.nextMonthlyWei > 0n && !!minMonthlyWei && live.nextMonthlyWei < minMonthlyWei
  const currentMonthlyEth = rateFlow.currentRate && rateFlow.currentRate > 0n ? cleanEthAmountInput(ratePerSecToMonthly(rateFlow.currentRate)) : '0'

  // Review-step prediction (fund + manage): reuses the same "beat topMonthlyWei" comparison the WIN
  // preset already uses, just evaluated against whatever rate is currently entered instead of only
  // offered as a preset shortcut.
  const reviewMonthlyWei = view === 'manage' ? live.nextMonthlyWei : calc.monthlyWei
  const reviewCurrentlyTop = view === 'manage' ? manageIsTop : fundTargetIsTop
  const reviewWillWin = reviewCurrentlyTop || !!(topMonthlyWei && topMonthlyWei > 0n && reviewMonthlyWei > topMonthlyWei)
  const reviewWinWei = topMonthlyWei && topMonthlyWei > 0n && minMonthlyWei ? (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei : null
  const reviewShortfallWei = !reviewWillWin && reviewWinWei && reviewWinWei > reviewMonthlyWei ? reviewWinWei - reviewMonthlyWei : 0n
  const reviewMinToWinLabel = reviewShortfallWei > 0n ? `${Number(formatEther(reviewShortfallWei)).toFixed(3)} ETH/mo` : null
  const reviewMarkeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Math.max(0, Number(formatEther(reviewMonthlyWei))))

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

  // Default the "add funds to an existing message" rate the same way as buying new: enough to win
  // #1, or 2x your own current rate if you're funding the message that's already #1 (since "beat the
  // current top" is meaningless when you already are it).
  useEffect(() => {
    if (!isOpen || view !== 'fund' || !target || hasUserEdited || !minMonthlyWei) return
    if (fundTargetIsTop && fundTwoXMonthlyEth) {
      setMonthly(fundTwoXMonthlyEth); setLastPreset('win')
    } else if (topMonthlyWei && topMonthlyWei > 0n) {
      const winWei = (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei
      setMonthly(formatEther(winWei)); setLastPreset('win')
    } else {
      setMonthly(minMonthlyEth); setLastPreset('min')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view, target, hasUserEdited, minMonthlyWei, minMonthlyEth, topMonthlyWei, fundTargetIsTop, fundTwoXMonthlyEth])

  // Pre-selects Win (or 2x your own current rate if you're already #1) the moment it loads, same as
  // the fund/list views, so Manage Your Stream opens with a concrete, useful starting point instead
  // of an empty field.
  useEffect(() => {
    if (!isOpen || view !== 'manage' || hasUserEdited || !minMonthlyWei) return
    if (manageIsTop && rateFlow.currentRate && rateFlow.currentRate > 0n && manageTwoXMonthlyEth) {
      setNewMonthly(manageTwoXMonthlyEth); setManageLastPreset('win')
    } else if (topMonthlyWei && topMonthlyWei > 0n) {
      const winWei = (topMonthlyWei / minMonthlyWei + 1n) * minMonthlyWei
      setNewMonthly(formatEther(winWei)); setManageLastPreset('win')
    } else {
      setNewMonthly(minMonthlyEth); setManageLastPreset('min')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view, hasUserEdited, minMonthlyWei, minMonthlyEth, topMonthlyWei, manageIsTop, rateFlow.currentRate, manageTwoXMonthlyEth])

  // ── Reset on open/close ──────────────────────────────────────────────────────
  const appliedInitialTargetRef = useRef(false)
  useEffect(() => {
    if (!isOpen) return
    appliedInitialTargetRef.current = false
    // Land directly on the target view (when the caller knows one) instead of always resetting to
    // 'list' and waiting for markees to load before the separate "jump to target" effect below can
    // correct it -- that gap was a visible flash of the wrong screen (e.g. Reactivate briefly showing
    // "Change the Markee Sign" before snapping to "Add Funds").
    setView(initialView ?? 'list'); setTarget(null); setMessage(''); setName(''); setMonthly(''); setNewMonthly('')
    setError(null); setHasUserEdited(false); setLastPreset(null); setReviewOpen(false)
    setCancelTxHash(undefined); setCancelError(null)
    setEditingMessage(false); setEditMessageText(''); setEditMessageError(null); setEditMessageTxHash(undefined)
  }, [isOpen, initialView])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleBuyNew = () => createFlow.activate(message, calc, { maxLen, belowMin, minMonthlyEth }, name.trim())
  const handleFund = () => backsOther
    ? moveFlow.moveStream(calc, { belowMin, minMonthlyEth })
    : openFlow.openStream(calc, { belowMin, minMonthlyEth })
  const handleUpdateRate = () => rateFlow.updateRate(
    { nextRate: live.nextRate, depositTopUp: live.depositTopUp },
    { nextBelowMin, minMonthlyEth, balanceValue: balanceData?.value },
  )

  const openFund = (m: StreamingMarkee) => {
    setTarget(m); setView('fund'); setMonthly(''); setLastPreset(null)
    setError(null); setHasUserEdited(false); setReviewOpen(false)
    setEditingMessage(false); setEditMessageText(''); setEditMessageError(null); setEditMessageTxHash(undefined)
  }
  const openManage = (m: StreamingMarkee) => {
    setTarget(m); setView('manage'); setNewMonthly(''); setError(null); setHasUserEdited(false); setReviewOpen(false)
    setEditingMessage(false); setEditMessageText(''); setEditMessageError(null); setEditMessageTxHash(undefined)
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
    setView('list'); setTarget(null); setMessage(''); setError(null); setHasUserEdited(false); setReviewOpen(false)
    setEditingMessage(false); setEditMessageText(''); setEditMessageError(null); setEditMessageTxHash(undefined)
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
    { label: calc.value > DISPLAY_DUST_WEI ? 'Deposit ETH & Start Stream' : 'Start Stream', done: createFlow.isSuccess, active: createFlow.phase === 'streaming' },
  ]

  // Same 2-step shape as createSteps' last two steps, just without "Create Markee Message" (the
  // message already exists) -- openFlow/moveFlow expose approving/submitting flags instead of a
  // phase enum, so the step boundary is "no longer approving" rather than a named phase.
  const fundFlowSteps = (flow: { approving: boolean; submitting: boolean; isSuccess: boolean }, actionLabel: string) => [
    { label: 'Approve Deposit', done: (flow.submitting && !flow.approving) || flow.isSuccess, active: flow.approving },
    { label: actionLabel, done: flow.isSuccess, active: flow.submitting && !flow.approving && !flow.isSuccess },
  ]
  const fundStreamLabel = (calc.value > DISPLAY_DUST_WEI ? 'Deposit ETH & ' : '') + (backsOther ? 'Move Stream' : 'Start Stream')
  const fundSteps = view === 'fund' ? fundFlowSteps(backsOther ? moveFlow : openFlow, fundStreamLabel) : undefined
  const manageSteps = view === 'manage' ? fundFlowSteps(rateFlow, 'Update Stream') : undefined

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
    <>
    <div
      onClick={() => { if ((!hasUserEdited || busy || activeIsSuccess) && !cancelBusy && !editMessageBusy) onClose() }}
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
            steps={view === 'list' ? createSteps : view === 'fund' ? fundSteps : manageSteps}
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
              {view !== 'list' && !reviewOpen && (
                <button
                  onClick={backToList}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: PINK, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 18 }}
                >
                  ← Back
                </button>
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

                  <div style={{ marginBottom: 18, flexShrink: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Your Name (optional)</div>
                    <input
                      type="text"
                      value={name}
                      onChange={e => { setHasUserEdited(true); setName(e.target.value.slice(0, maxNameLen)) }}
                      placeholder="tell the world who wrote this..."
                      style={inputStyle}
                      disabled={busy}
                    />
                  </div>

                  <div style={{ marginBottom: 10, flexShrink: 0 }}>
                    <RateCard
                      monthly={monthly} setMonthly={setMonthly}
                      lastPreset={lastPreset} setLastPreset={setLastPreset} setHasUserEdited={setHasUserEdited}
                      minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded}
                      topMonthlyWei={topMonthlyWei}
                      ethPrice={ethPrice} ethxBalance={ethxBalance} walletEthBalance={balanceData?.value} busy={busy} calc={calc}
                      runwaySecs={runway} onOpenDepositManager={() => setDepositManagerOpen(true)}
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
                          display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                          background: PINK, color: BG, border: 'none', borderRadius: 10,
                          fontFamily: 'inherit', fontWeight: 800, fontSize: calc.value > DISPLAY_DUST_WEI ? 14 : 17,
                          cursor: btnDisabled ? 'not-allowed' : 'pointer',
                          opacity: btnDisabled ? 0.4 : 1, transition: 'opacity 140ms',
                        }}
                      >
                        {calc.value > DISPLAY_DUST_WEI ? `Deposit ${parseFloat(formatEther(calc.value)).toFixed(3)} ETH and Buy` : 'Buy Message'}
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
                reviewOpen ? (
                  <PaymentReviewCard
                    kind="rent"
                    message={target.message || ''}
                    amountLabel={`${monthly || '0'} ETH/mo`}
                    amountUsd={ethPrice && parseFloat(monthly || '0') > 0 ? formatUsd(parseFloat(monthly) * ethPrice) : null}
                    depositLabel={calc.value > DISPLAY_DUST_WEI ? `${parseFloat(formatEther(calc.value)).toFixed(4)} ETH` : null}
                    runwayLabel={formatRunwayShort(runway)}
                    markeeEarnedLabel={`${formatMarkeeAmount(reviewMarkeeEarned)} MARKEE/mo`}
                    willWin={reviewWillWin}
                    minToWinLabel={reviewMinToWinLabel}
                  />
                ) : (
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
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase() && (
                              <button
                                type="button"
                                onClick={() => { setEditingMessage(true); setEditMessageText(target.message || '') }}
                                title="Edit message"
                                style={{ flexShrink: 0, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: MUTED, lineHeight: 0 }}
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                            <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>{target.message || <MessageLoading />}</div>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <MessageMeta
                              views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                              isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                              authorLabel={target.name || fmtAddr(target.owner)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <RateCard
                      monthly={monthly} setMonthly={setMonthly}
                      lastPreset={lastPreset} setLastPreset={setLastPreset} setHasUserEdited={setHasUserEdited}
                      minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded}
                      topMonthlyWei={topMonthlyWei}
                      isAlreadyTop={fundTargetIsTop} twoXMonthlyEth={fundTwoXMonthlyEth}
                      ethPrice={ethPrice} ethxBalance={ethxBalance} walletEthBalance={balanceData?.value} busy={busy} calc={calc}
                      runwaySecs={runway} onOpenDepositManager={() => setDepositManagerOpen(true)}
                    />
                    <ReceiveCard monthly={monthly} compact={false} />
                  </div>
                </div>
                )
              )}

              {view === 'manage' && target && (
                reviewOpen ? (
                  <PaymentReviewCard
                    kind="rent"
                    message={target.message || ''}
                    amountLabel={`${newMonthly || currentMonthlyEth} ETH/mo`}
                    amountUsd={ethPrice && live.nextMonthlyWei > 0n ? formatUsd(Number(formatEther(live.nextMonthlyWei)) * ethPrice) : null}
                    depositLabel={live.depositTopUp > DISPLAY_DUST_WEI ? `${parseFloat(formatEther(live.depositTopUp)).toFixed(4)} ETH` : null}
                    runwayLabel={formatRunwayShort(runwaySeconds(ethxBalance ?? 0n, live.nextRate))}
                    markeeEarnedLabel={`${formatMarkeeAmount(reviewMarkeeEarned)} MARKEE/mo`}
                    willWin={reviewWillWin}
                    minToWinLabel={reviewMinToWinLabel}
                  />
                ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
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
                        {target.message || <MessageLoading />}
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
                          featured {formatDuration(featuredNow / 1000 - topSince!.since, true)}
                        </span>
                      )}
                    </div>
                    {manageNeverWon ? (
                      <p style={{ margin: 0, fontFamily: MONO, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                        Your payment stream will start if this message starts winning.
                      </p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>Total streamed</div>
                          <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, marginTop: 2 }}>
                            {manageTopSinceMine ? `${formatLiveEth(manageStreamedWei, manageStreamedDecimals)} ETH` : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>ETHx balance</div>
                          <div style={{ fontFamily: MONO, fontSize: 13, color: TEXT, marginTop: 2 }}>{Number(formatEther(ethxBalance ?? 0n)).toFixed(5)} ETH</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: MONO, fontSize: 9.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>Runs out in</div>
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
                              ? manageEarnedMarkee.toLocaleString(undefined, { minimumFractionDigits: manageMarkeeDecimals, maximumFractionDigits: manageMarkeeDecimals })
                              : `${formatLiveEth(managePendingEthWei, manageEthDecimals)} ETH`}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── New monthly rate (exact same RateCard used on the fund/activate modals) ── */}
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>New monthly rate</div>
                    <RateCard
                      monthly={newMonthly} setMonthly={setNewMonthly}
                      lastPreset={manageLastPreset} setLastPreset={setManageLastPreset} setHasUserEdited={setHasUserEdited}
                      minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded}
                      topMonthlyWei={topMonthlyWei}
                      isAlreadyTop={manageIsTop} twoXMonthlyEth={manageTwoXMonthlyEth}
                      ethPrice={ethPrice} ethxBalance={ethxBalance} walletEthBalance={balanceData?.value} busy={busy}
                      calc={{ monthlyWei: live.nextMonthlyWei, prefund: 0n, value: live.depositTopUp }}
                      runwaySecs={runwaySeconds(ethxBalance ?? 0n, live.nextRate)}
                      onOpenDepositManager={() => setDepositManagerOpen(true)}
                    />
                  </div>
                  {cancelError && <p style={{ fontSize: 12, color: '#FF8E8E', margin: 0 }}>{cancelError}</p>}
                </div>
                )
              )}

              {view !== 'list' && activeError && !reviewOpen && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>{activeError}</p>
              )}
            </div>

            {/* ── Footer (fund / manage only — list inlines its own CTA above the leaderboard) ── */}
            {view !== 'list' && (
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              {reviewOpen ? (
                <div style={{ width: '100%' }}>
                  <PaymentReviewFooter
                    onBack={() => setReviewOpen(false)}
                    onConfirm={() => { if (view === 'fund') handleFund(); else handleUpdateRate() }}
                    busy={busy}
                    error={activeError}
                  />
                </div>
              ) : (
              <>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                {view === 'manage'
                  ? (manageStatus === 'cancelled' && (rateFlow.deposit ?? 0n) > 0n ? (
                      // No inline "Withdraw Deposit" here on purpose -- that balance is still usable
                      // ETHx for any other message, and we don't want cancelling a stream to nudge
                      // people toward draining it. The Deposit Manager already covers withdrawals.
                      <span>
                        Your deposit stays as ETHx, usable for any other message.{' '}
                        <button
                          type="button"
                          onClick={() => setDepositManagerOpen(true)}
                          style={{ background: 'transparent', border: 'none', color: PINK, fontFamily: MONO, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}
                        >
                          Deposit Manager →
                        </button>
                      </span>
                    ) : cancelSuccess ? (
                      <span style={{ color: '#7EE787' }}>✓ Cancelled</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelBusy || busy}
                        style={{ background: 'transparent', color: '#FF8E8E', border: '1px solid rgba(255,142,142,0.4)', borderRadius: 7, padding: '6px 12px', fontFamily: MONO, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', opacity: cancelBusy || busy ? 0.5 : 1 }}
                      >
                        {cancelBusy ? 'Cancelling…' : manageStatus === 'active' ? 'Cancel Stream' : 'Cancel Bid'}
                      </button>
                    ))
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      62/38 split
                      <InfoTip>
                        62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
                      </InfoTip>
                    </span>}
              </div>
              <BtnTooltip reason={view === 'manage' ? (rateFlow.approving || rateFlow.submitting ? 'Transaction in progress' : manageStreamGone ? 'This stream is cancelled' : !live.changed ? 'Enter a different rate' : nextBelowMin ? `Minimum is ${minMonthlyEth} ETH/mo` : null) : btnDisabledReason}>
                <button
                  onClick={() => setReviewOpen(true)}
                  disabled={view === 'manage' ? (busy || !live.changed || nextBelowMin || manageStreamGone) : btnDisabled}
                  style={{
                    background: PINK, color: BG, border: 'none', borderRadius: 8,
                    padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: (view === 'manage' ? (busy || !live.changed || nextBelowMin || manageStreamGone) : btnDisabled) ? 0.4 : 1,
                    transition: 'opacity 140ms',
                  }}
                >
                  {view === 'fund' && fundReadsLoading ? 'Loading…' : 'Review Payment Info'}
                </button>
              </BtnTooltip>
              </>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
    <DepositManagerModal isOpen={depositManagerOpen} onClose={() => setDepositManagerOpen(false)} />
    </>
  )
}
