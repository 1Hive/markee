'use client'

import { useMessageModeration } from '@/hooks/useMessageModeration'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount, useBalance, useReadContract, useSwitchChain, usePublicClient } from 'wagmi'
import { useSponsoredWriteContract } from '@/hooks/useSponsoredWriteContract'
import { parseEther, formatEther } from 'viem'
import { Eye } from 'lucide-react'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatTransactionError, formatReceiptError, logTransactionError } from '@/lib/transactionErrors'
import { formatUsd, FAST_TX_GAS_RESERVE, formatMarkeeAmount } from '@/lib/utils'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { TxProgress, InfoTip, PaymentReviewCard, PaymentReviewFooter, MessageLoading, sanitizeDecimalInput } from '@/components/modals/StreamUI'
import { useTrackedReceipt } from '@/hooks/useTrackedReceipt'
import { usePendingTxsFor } from '@/hooks/usePendingTxs'
import { useWalletTimeoutGuard } from '@/hooks/useWalletTimeoutGuard'
import { PendingPaymentNotice, PENDING_PAYMENT_REASON } from '@/components/tx/PendingPaymentNotice'
import { WalletTimeoutNotice } from '@/components/tx/WalletTimeoutNotice'
import { useLeaderboardDetail, type LeaderboardMarkee } from '@/lib/contracts/useLeaderboardDetail'
import { isZeroAddress, NO_BENEFICIARY_REASON } from '@/lib/beneficiary'
import { isBoardCreatedMarkee, useBoardTrust } from '@/lib/contracts/boardRegistry'
import { ModeratedContent, ModeratedAuthor, FlagButton } from '@/components/moderation'
import { MONO, PINK, BLUE, BG2, BG, TEXT2, TEXT, MUTED, BORDER } from '@/lib/design-tokens'

// ── Design tokens (matches BuyMessageModal's theme) ─────────────────────────────
const PURP   = '#7B6AF4'

const MIN_INCREMENT = BigInt('1000000000000000') // 0.001 ETH

function fmtAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

// The handlers set one of these two exact strings for message-field problems; everything else
// (wallet/chain/amount/balance) is a general error shown near the amount section instead.
function isMessageFieldError(e: string | null): boolean {
  return e === 'Please enter a message' || (e?.startsWith('Message must be') ?? false)
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

// The message field is the emphasized input now (was the amount card) — same glow AmountCard used to
// carry, moved here so attention lands on what you're saying before what you're paying.
const messageBoxStyle = {
  ...inputStyle,
  border: `1.5px solid ${PINK}`,
  boxShadow: '0 0 24px rgba(248,151,254,0.08)',
}

// ── Amount card (shared shape between "buy new" and "add funds") ──────────────
// Compact 2-line layout: line 1 is [amount input | presets], line 2 is [USD equiv | balance].
function AmountCard({
  amount, setAmount, lastPreset, setLastPreset, setHasUserEdited,
  minimumAmountFormatted, maxSpendableFormatted, spendableBalance,
  winAmountFormatted, twoXAmountFormatted, isAlreadyTop, ethPrice, balanceData, busy,
  showMin = true,
}: {
  amount: string
  setAmount: (v: string) => void
  lastPreset: 'min' | 'max' | 'win' | null
  setLastPreset: (v: 'min' | 'max' | 'win' | null) => void
  setHasUserEdited: (v: boolean) => void
  minimumAmountFormatted: string
  maxSpendableFormatted: string
  spendableBalance: bigint
  winAmountFormatted: string | null
  twoXAmountFormatted: string | null
  isAlreadyTop: boolean
  ethPrice: number | null
  balanceData: { value: bigint } | undefined
  busy: boolean
  showMin?: boolean
}) {
  const bidNum = parseFloat(amount || '0')
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
      {/* Line 1: amount (left) / presets (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', width: 'max-content' }}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => { const v = sanitizeDecimalInput(e.target.value); if (v === null) return; setHasUserEdited(true); setAmount(v); setLastPreset(null) }}
              placeholder={minimumAmountFormatted}
              disabled={busy}
              style={{
                background: 'transparent', border: 'none', outline: 'none', textAlign: 'left',
                color: TEXT, fontFamily: MONO, fontSize: 22, fontWeight: 800, padding: 0,
                width: `${Math.max(5, (amount || minimumAmountFormatted).length + 0.5)}ch`,
              }}
            />
            <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETH</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {showMin && (
            <button
              type="button"
              onClick={() => { setHasUserEdited(true); setAmount(minimumAmountFormatted); setLastPreset('min') }}
              disabled={busy}
              style={presetBtnStyle(lastPreset === 'min', PINK, busy)}
            >
              MIN
            </button>
          )}
          <button
            type="button"
            onClick={() => { setHasUserEdited(true); setAmount(maxSpendableFormatted); setLastPreset('max') }}
            disabled={spendableBalance <= 0n || busy}
            style={presetBtnStyle(lastPreset === 'max', PINK, spendableBalance <= 0n || busy)}
          >
            MAX
          </button>
          {isAlreadyTop ? (
            twoXAmountFormatted && (
              <button
                type="button"
                onClick={() => { setHasUserEdited(true); setAmount(twoXAmountFormatted); setLastPreset('win') }}
                disabled={busy}
                style={presetBtnStyle(lastPreset === 'win', '#FFD700', busy)}
              >
                2X
              </button>
            )
          ) : (
            winAmountFormatted && (
              <button
                type="button"
                onClick={() => { setHasUserEdited(true); setAmount(winAmountFormatted); setLastPreset('win') }}
                disabled={busy}
                style={presetBtnStyle(lastPreset === 'win', '#FFD700', busy)}
              >
                WIN
              </button>
            )
          )}
        </div>
      </div>

      {/* Line 2: USD equiv (left) / balance (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: MONO, fontSize: 11.5, color: MUTED }}>
        <span>{ethPrice && bidNum > 0 ? `≈ ${formatUsd(bidNum * ethPrice)}` : ' '}</span>
        <span>{balanceData ? `Balance ${parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH` : ''}</span>
      </div>
    </div>
  )
}

// Compact 2-line layout: line 1 is [label | MARKEE amount], line 2 is the 62/38 split note.
function ReceiveCard({ amount, compact = true }: { amount: string; compact?: boolean }) {
  const parsed = parseFloat(amount || '0')
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
          <span style={{ color: PINK, fontSize: 11.5, fontWeight: 400, fontFamily: 'Manrope, system-ui, sans-serif' }}>earned</span>
        </div>
      ) : (
        <span style={{ color: PINK, fontSize: 11.5, fontWeight: 400, fontFamily: 'Manrope, system-ui, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>MARKEE earned</span>
      )}
    </div>
  )
}

// Views (left) / "- author" + YOU badge (right). Shared by the leaderboard row and the
// current-message preview boxes in Add Funds / Edit Message.
function MessageMeta({ views, isOwner, authorLabel }: { views: number; isOwner: boolean; authorLabel: React.ReactNode }) {
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
  markee, rank, views, isOwner, onFund, onEdit, boardAdmin,
}: {
  markee: LeaderboardMarkee
  rank: number
  views: number
  isOwner: boolean
  onFund: () => void
  onEdit: () => void
  boardAdmin?: string | null
}) {
  const isTop = rank === 1
  const subtitle = markee.name || fmtAddr(markee.owner)
  const eth = Number(formatEther(markee.totalFundsAdded)).toFixed(3)
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
        <ModeratedContent placeholderLines={1} chainId={CANONICAL_CHAIN_ID} message={markee.message ?? ''} markeeId={markee.address} boardAdmin={boardAdmin} className="min-w-0">
          <div style={{ color: TEXT, fontWeight: 700, fontSize: 14, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {markee.message || '—'}
          </div>
        </ModeratedContent>
        <div style={{ marginTop: 2 }}>
          <MessageMeta views={views} isOwner={isOwner} authorLabel={<ModeratedAuthor chainId={CANONICAL_CHAIN_ID} message={markee.message ?? ''} markeeId={markee.address} boardAdmin={boardAdmin}>{subtitle}</ModeratedAuthor>} />
        </div>
      </div>
      <span style={{ color: BLUE, fontFamily: MONO, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{eth} ETH</span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markee.address} boardAdmin={boardAdmin} compact />
        {isOwner && (
          <button
            onClick={onEdit}
            style={{ background: 'rgba(138,143,191,0.1)', border: `1px solid ${BORDER}`, color: TEXT2, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >
            Edit
          </button>
        )}
        <button
          onClick={onFund}
          style={{ background: 'rgba(248,151,254,0.12)', border: `1px solid ${PINK}`, color: PINK, borderRadius: 7, padding: '6px 11px', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
        >
          + Fund
        </button>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface MarkeeSignModalProps {
  isOpen: boolean
  onClose: () => void
  leaderboardAddress: string
  initialView?: 'addFunds' | 'edit'
  initialTargetAddress?: string
  onSuccess?: () => void
}

type View = 'list' | 'addFunds' | 'edit'

export function MarkeeSignModal({ isOpen, onClose, leaderboardAddress, initialView, initialTargetAddress, onSuccess }: MarkeeSignModalProps) {
  const strategyAddress = leaderboardAddress as `0x${string}`
  const { activeAddress, hasWallet, hasActiveWalletConnection, isWalletConnectionPending } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { meta, markees, refetch: refetchLeaderboard } = useLeaderboardDetail(isOpen ? leaderboardAddress : undefined)
  const noBeneficiaryReason = meta && isZeroAddress(meta.beneficiaryAddress) ? NO_BENEFICIARY_REASON : null
  const { trust } = useBoardTrust(isOpen ? leaderboardAddress : undefined)
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN_ID })
  const boardBlockedReason = trust === 'trusted' ? null
    : trust === 'untrusted' ? 'This address is not a Markee board. No payment can be sent to it.'
    : trust === 'unavailable' ? 'Could not confirm this Markee board. Check your connection and try again.'
    : 'Checking this Markee board…'

  const [view, setView] = useState<View>('list')
  const [target, setTarget] = useState<LeaderboardMarkee | null>(null)
  const [message, setMessage] = useState('')
  const messageModeration = useMessageModeration(message, isOpen, { checkWhileTyping: view !== 'edit' })
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [lastPreset, setLastPreset] = useState<'min' | 'max' | 'win' | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset, needsGasReserve } = useSponsoredWriteContract()
  // Sponsored (Privy embedded) wallets don't pay gas, so don't hold any ETH back for it.
  const gasReserve = needsGasReserve ? FAST_TX_GAS_RESERVE : 0n
  const { isLoading: isConfirming, isUnknown, isSuccess, isError: txReverted, error: receiptError, explorerUrl } = useTrackedReceipt({
    hash, track: { account: activeAddress, board: leaderboardAddress, label: 'Your Markee payment' },
  })
  const pendingPayments = usePendingTxsFor(activeAddress, leaderboardAddress).filter(p => p.hash !== hash)
  const walletTimeout = useWalletTimeoutGuard(writeError, activeAddress)

  const { data: balanceData } = useBalance({
    address: activeAddress as `0x${string}` | undefined, chainId: CANONICAL_CHAIN.id,
  })

  const { data: maxMessageLength } = useReadContract({
    address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'maxMessageLength', chainId: CANONICAL_CHAIN.id,
  })
  const { data: maxNameLength } = useReadContract({
    address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'maxNameLength', chainId: CANONICAL_CHAIN.id,
  })

  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const topMarkee = markees[0] ?? null
  const topFundsAdded = topMarkee?.totalFundsAdded ?? 0n
  const fundedMarkees = markees.filter(m => m.totalFundsAdded > 0n)
  const minimumAmount = meta?.minimumPrice || parseEther('0.001')
  const minimumAmountFormatted = Number(formatEther(minimumAmount)).toFixed(3)
  const maxLen = Number(maxMessageLength || 223)
  const maxNameLen = Number(maxNameLength || 32)

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

  // ── Reset on open/close ──────────────────────────────────────────────────────
  const appliedInitialTargetRef = useRef(false)
  useEffect(() => {
    if (!isOpen) return
    appliedInitialTargetRef.current = false
    setView('list'); setTarget(null); setMessage(''); setName(''); setError(null); setHasUserEdited(false); setLastPreset(null)
    setReviewOpen(false)
    reset()
  }, [isOpen, reset])

  useEffect(() => {
    if (!isSuccess || !isOpen) return
    const timer = setTimeout(() => {
      refetchLeaderboard()
      setView('list'); setTarget(null); setMessage(''); setName(''); setAmount(''); setError(null); setHasUserEdited(false)
      reset()
      onSuccess?.()
    }, 2000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, isOpen])

  useEffect(() => {
    if (writeError) logTransactionError(writeError, 'MarkeeSignModal')
  }, [writeError])

  // A reverted tx otherwise just drops back to the form with no error.
  useEffect(() => {
    if (txReverted && hash && isOpen) setError(formatReceiptError(receiptError, 'MarkeeSignModal.receipt'))
  }, [txReverted, hash, isOpen, receiptError])

  const txStep = isPending ? 'signing' : isConfirming ? 'pending' : isSuccess ? 'success' : null
  const blockBackdropClose = hasUserEdited && !txStep

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (blockBackdropClose) { event.preventDefault(); event.stopPropagation(); return }
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, blockBackdropClose, onClose])

  // ── Balance / affordability ─────────────────────────────────────────────────
  const canAffordTransaction = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return false
    try { return balanceData.value >= parseEther(amount) + gasReserve } catch { return false }
  }
  const getInsufficientBalanceMessage = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return null
    try {
      if (balanceData.value < parseEther(amount) + gasReserve) {
        return (!needsGasReserve ? "You don't have enough ETH." : `You don't have enough ETH after reserving ${formatEther(gasReserve)} ETH for gas.`)
      }
    } catch { return 'Invalid amount entered' }
    return null
  }
  const insufficientBalance = !!(amount && parseFloat(amount) > 0 && !canAffordTransaction())
  const spendableBalance = balanceData && balanceData.value > gasReserve ? balanceData.value - gasReserve : 0n
  const maxSpendableEth = Number(formatEther(spendableBalance))
  const maxSpendableFormatted = maxSpendableEth > 0 && maxSpendableEth < 0.001 ? maxSpendableEth.toFixed(6) : maxSpendableEth.toFixed(3)

  // WIN target: for "buy new" it's overtaking the current #1; for "add funds" it's overtaking #1 from this specific target's current total.
  const winRawForCreate = topFundsAdded > 0n ? topFundsAdded + MIN_INCREMENT : null
  const winForCreate = winRawForCreate && winRawForCreate >= minimumAmount ? winRawForCreate : null
  const winRawForTarget = target && topFundsAdded > 0n ? topFundsAdded + MIN_INCREMENT - target.totalFundsAdded : null
  const winForTarget = winRawForTarget && winRawForTarget > 0n ? winRawForTarget : null
  const winAmountFormatted = view === 'addFunds'
    ? (winForTarget ? Number(formatEther(winForTarget)).toFixed(3) : null)
    : (winForCreate ? Number(formatEther(winForCreate)).toFixed(3) : null)
  const targetIsTop = !!target && !!topMarkee && target.address.toLowerCase() === topMarkee.address.toLowerCase()
  const isAlreadyTop = view === 'addFunds' && targetIsTop
  // 2X replaces WIN for a message that's already #1: adding its current total again doubles it.
  const twoXAmountFormatted = isAlreadyTop && target ? Number(formatEther(target.totalFundsAdded)).toFixed(3) : null

  // Review-step prediction, reusing the win-target wei already derived above for whichever view is
  // active instead of re-deriving the ranking math.
  // An edit pays nothing, so its shortfall is the top-up this message needs to reach #1.
  const reviewAmountWei = view === 'edit' ? 0n : (() => { try { return amount ? parseEther(amount) : 0n } catch { return 0n } })()
  const reviewWinTarget = view === 'addFunds' || view === 'edit' ? winForTarget : winForCreate
  const reviewWillWin = view === 'edit'
    ? targetIsTop
    : isAlreadyTop || !reviewWinTarget || reviewAmountWei >= reviewWinTarget
  const reviewShortfallWei = !reviewWillWin && reviewWinTarget && reviewWinTarget > reviewAmountWei
    ? reviewWinTarget - reviewAmountWei : 0n
  const reviewMinToWinLabel = reviewShortfallWei > 0n ? `${Number(formatEther(reviewShortfallWei)).toFixed(3)} ETH` : null
  const reviewMarkeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Math.max(0, parseFloat(amount || '0')))

  // Default the "buy a new message" amount to whatever it takes to win #1, falling back to the
  // floor price when there's no competition yet. Only runs while the user hasn't touched the field
  // (or a preset) themselves, and re-derives once the leaderboard data finishes loading.
  useEffect(() => {
    if (!isOpen || view !== 'list' || hasUserEdited) return
    if (winForCreate) { setAmount(Number(formatEther(winForCreate)).toFixed(3)); setLastPreset('win') }
    else { setAmount(minimumAmountFormatted); setLastPreset('min') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view, hasUserEdited, minimumAmountFormatted, winForCreate])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleBuyNew = async () => {
    if (noBeneficiaryReason) { setError(noBeneficiaryReason); return }
    if (pendingPayments.length || walletTimeout.blocked) return
    if (!await messageModeration.guard(message)) { setReviewOpen(false); return }
    if (boardBlockedReason || !meta) { setError(boardBlockedReason ?? 'Could not load this Markee board.'); return }
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!message.trim()) { setError('Please enter a message'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter an amount'); return }
    const amountWei = parseEther(amount)
    if (amountWei < minimumAmount) { setError(`Minimum payment is ${formatEther(minimumAmount)} ETH`); return }
    if (message.length > maxLen) { setError(`Message must be ${maxLen} characters or less`); return }
    if (!canAffordTransaction()) { setError(getInsufficientBalanceMessage() || 'Insufficient balance'); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'createMarkee', args: [message, name.trim()], value: amountWei, chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'MarkeeSignModal.createMarkee')
      setError(formatTransactionError(err))
    }
  }

  const handleAddFunds = async () => {
    if (noBeneficiaryReason) { setError(noBeneficiaryReason); return }
    if (pendingPayments.length || walletTimeout.blocked) return
    if (!target) return
    if (boardBlockedReason || !meta) { setError(boardBlockedReason ?? 'Could not load this Markee board.'); return }
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter an amount'); return }
    if (!canAffordTransaction()) { setError(getInsufficientBalanceMessage() || 'Insufficient balance'); return }
    setError(null)
    try {
      if (!publicClient || !await isBoardCreatedMarkee(publicClient, strategyAddress, target.address as `0x${string}`)) {
        setError('This message was not created by this board, so it cannot be funded here.')
        return
      }
    } catch (err) {
      logTransactionError(err, 'MarkeeSignModal.verifyMarkee')
      setError('Could not verify this message. Check your connection and try again.')
      return
    }
    try {
      writeContract({ address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'addFunds', args: [target.address as `0x${string}`], value: parseEther(amount), chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'MarkeeSignModal.addFunds')
      setError(formatTransactionError(err))
    }
  }

  const handleUpdateMessage = async () => {
    if (walletTimeout.blocked) return
    if (!target) return
    // Edits always go to this (registry-checked) board, never to an address read from the Markee
    // (#58). A Markee whose pricing strategy is another contract can only be edited there, so stop
    // here (before the moderation call and review step) instead of sending a tx certain to revert.
    if (target.pricingStrategy && target.pricingStrategy.toLowerCase() !== strategyAddress.toLowerCase()) {
      setError('This message is managed by a different contract, so it can\'t be edited from this board.')
      return
    }
    if (!await messageModeration.guard(message)) { setReviewOpen(false); return }
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!message.trim()) { setError('Please enter a message'); return }
    if (message.length > maxLen) { setError(`Message must be ${maxLen} characters or less`); return }
    setError(null)
    try {
      writeContract({ address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'updateMessage', args: [target.address as `0x${string}`, message], chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'MarkeeSignModal.updateMessage')
      setError(formatTransactionError(err))
    }
  }

  const openFund = (m: LeaderboardMarkee) => {
    const alreadyTop = !!topMarkee && m.address.toLowerCase() === topMarkee.address.toLowerCase()
    const winRaw = !alreadyTop && topFundsAdded > 0n ? topFundsAdded + MIN_INCREMENT - m.totalFundsAdded : null
    const win = winRaw && winRaw > 0n ? winRaw : null
    const defaultAmount = alreadyTop
      ? Number(formatEther(m.totalFundsAdded)).toFixed(3) // 2x: adding your current total again doubles it
      : win ? Number(formatEther(win)).toFixed(3) : minimumAmountFormatted
    setTarget(m); setView('addFunds'); setAmount(defaultAmount); setLastPreset(alreadyTop || win ? 'win' : 'min')
    setError(null); setHasUserEdited(false); setReviewOpen(false)
  }
  const openEdit = (m: LeaderboardMarkee) => {
    setTarget(m); setView('edit'); setMessage(''); setError(null); setHasUserEdited(false); setReviewOpen(false)
  }

  // Jump straight into a specific message's addFunds/edit sub-view (e.g. a page's dedicated
  // "Add funds"/"Edit" button), preserving 1-click behavior instead of landing on the list.
  useEffect(() => {
    if (!isOpen || !initialTargetAddress || !initialView || appliedInitialTargetRef.current) return
    const m = markees.find(x => x.address.toLowerCase() === initialTargetAddress.toLowerCase())
    // Rows arrive before their per-markee reads (message, owner); opening on one of those would
    // keep a blank copy ("Loading message…", no owner-only controls) since target isn't refreshed.
    if (!m || !m.owner) return
    appliedInitialTargetRef.current = true
    if (initialView === 'addFunds') openFund(m)
    else openEdit(m)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTargetAddress, initialView, markees])

  const backToList = () => {
    setView('list'); setTarget(null); setMessage(''); setError(null); setHasUserEdited(false); setReviewOpen(false); reset()
  }

  if (!isOpen) return null

  const busy = isPending || isConfirming || (view === 'edit' && messageModeration.checking)
  // Missing/invalid message and amount are validated on click (see handleBuyNew / handleAddFunds /
  // handleUpdateMessage, which each setError and bail) -- matches create-a-markee's pattern of
  // keeping the button clickable rather than disabling ahead of time. Insufficient balance is the
  // one condition that actually blocks submission, so it disables the button proactively instead.
  // Editing a message is free -- a leftover `amount` from a previous view shouldn't block it.
  const blocksOnBalance = insufficientBalance && view !== 'edit'
  const beneficiaryBlocks = view !== 'edit' && !!noBeneficiaryReason
  const boardBlocks = view !== 'edit' && !!boardBlockedReason
  const paymentBlocked = (view !== 'edit' && pendingPayments.length > 0) || walletTimeout.blocked
  const btnDisabled = busy || isSuccess || blocksOnBalance || beneficiaryBlocks || boardBlocks || paymentBlocked
  const btnDisabledReason = busy ? 'Transaction in progress'
    : boardBlocks ? boardBlockedReason
    : beneficiaryBlocks ? noBeneficiaryReason
    : view !== 'edit' && pendingPayments.length ? PENDING_PAYMENT_REASON
    : walletTimeout.blocked ? 'Check your wallet first'
    : blocksOnBalance ? "You don't have enough ETH for this" : null
  const paymentNotices = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 14px' }}>
      {view !== 'edit' && <PendingPaymentNotice pending={pendingPayments} />}
      <WalletTimeoutNotice state={walletTimeout.state} accountUrl={walletTimeout.accountUrl} onAcknowledge={walletTimeout.acknowledge} />
    </div>
  )

  const activating = view !== 'addFunds' && view !== 'edit' && fundedMarkees.length === 0
  const stepLabel = view === 'addFunds' ? 'ADD FUNDS' : view === 'edit' ? 'EDIT MESSAGE'
    : activating ? 'ACTIVATE MARKEE' : 'CHANGE THE MARKEE SIGN'

  return (
    <div
      onClick={() => { if (!blockBackdropClose) onClose() }}
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
        {txStep ? (
          <TxProgress
            isSuccess={txStep === 'success'}
            headline={
              txStep === 'signing' ? 'Waiting for wallet…' :
              txStep === 'pending' ? (isUnknown ? 'Still checking' : 'Confirming on Base') :
              view === 'edit' ? 'Success! Your message is updated' :
              view === 'list' ? 'Success! Your message is live' :
              'Success! Funds added to the sign'
            }
            detail={
              txStep === 'signing' ? 'Sign the transaction in your wallet.' :
              txStep === 'pending' ? (isUnknown ? 'The network is not answering. Your payment may still go through, so check Basescan before paying again.' : 'Usually under 2 seconds on Base.') :
              'The sign will refresh in a moment.'
            }
            explorerUrl={txStep === 'pending' ? explorerUrl : undefined}
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
                reviewOpen ? (
                  <PaymentReviewCard
                    kind="fixed"
                    activating={activating}
                    message={message}
                    amountLabel={`${amount || '0'} ETH`}
                    amountUsd={ethPrice && parseFloat(amount || '0') > 0 ? formatUsd(parseFloat(amount) * ethPrice) : null}
                    markeeEarnedLabel={`${formatMarkeeAmount(reviewMarkeeEarned)} MARKEE`}
                    willWin={reviewWillWin}
                    minToWinLabel={reviewMinToWinLabel}
                  />
                ) : (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {/* Existing messages -- own scroll region, capped so it can't crowd out the compose
                      fields below on a short viewport. */}
                  {fundedMarkees.length > 0 && (
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ textAlign: 'center', margin: '0 0 10px', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: BORDER }} />
                        <span style={{ position: 'relative', background: BG2, padding: '0 12px', fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>
                          Add funds to an existing message
                        </span>
                      </div>
                      {/* Capped to ~2 rows -- this list is secondary to composing a new message below
                          it, not the main event; scroll for more rather than eating the modal. */}
                      <div style={{ maxHeight: 116, overflowY: 'auto' }}>
                        {fundedMarkees.map((m, i) => (
                          <SignRow
                            key={m.address}
                            markee={m}
                            rank={i + 1}
                            views={viewsMap.get(m.address.toLowerCase()) ?? 0}
                            isOwner={!!activeAddress && m.owner.toLowerCase() === activeAddress.toLowerCase()}
                            onFund={() => openFund(m)}
                            onEdit={() => openEdit(m)}
                            boardAdmin={meta?.admin}
                          />
                        ))}
                      </div>
                      <div style={{ textAlign: 'center', margin: '14px 0', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: BORDER }} />
                        <span style={{ position: 'relative', background: BG2, padding: '0 12px', fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>
                          Or set a new message
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Compose fields -- own scroll region, independent of the messages list above. */}
                  <div style={{ flex: 1, minHeight: 80, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>Set your message</span>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{message.length}/{maxLen}</span>
                      </div>
                      <textarea
                        value={message}
                        onChange={e => {
                          setHasUserEdited(true)
                          setMessage(e.target.value.slice(0, maxLen))
                          if (isMessageFieldError(error)) setError(null)
                        }}
                        placeholder={`Your message here... (${maxLen} max)`}
                        rows={2}
                        style={{ ...messageBoxStyle, resize: 'vertical' }}
                        disabled={busy}
                      />{messageModeration.ui}
                      {isMessageFieldError(error) && (
                        <p style={{ fontSize: 12, color: '#FF8E8E', margin: 0 }}>{error}</p>
                      )}
                    </div>

                    <div>
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
                  </div>

                  {/* Amount + submit -- affixed footer, always visible regardless of how tall either
                      scroll region above gets. */}
                  <div style={{ flexShrink: 0, paddingTop: 14, paddingBottom: 22, marginTop: 10, borderTop: `1px solid ${BORDER}` }}>
                    <div style={{ marginBottom: 10 }}>
                      <AmountCard
                        amount={amount} setAmount={setAmount} lastPreset={lastPreset} setLastPreset={setLastPreset}
                        setHasUserEdited={setHasUserEdited} minimumAmountFormatted={minimumAmountFormatted}
                        maxSpendableFormatted={maxSpendableFormatted} spendableBalance={spendableBalance}
                        winAmountFormatted={winAmountFormatted} twoXAmountFormatted={null} isAlreadyTop={false} ethPrice={ethPrice}
                        balanceData={balanceData} busy={busy}
                      />
                    </div>

                    {paymentNotices}
                    {((error && !isMessageFieldError(error)) || isError) && !walletTimeout.blocked && (
                      <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>
                        {(error && !isMessageFieldError(error)) ? error : formatTransactionError(writeError)}
                      </p>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                      <ReceiveCard amount={amount} />
                      <BtnTooltip reason={btnDisabledReason}>
                        <button
                          onClick={() => setReviewOpen(true)}
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
                          Review Payment Info
                        </button>
                      </BtnTooltip>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: MONO, fontSize: 12.5, color: MUTED }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        62/38 split
                        <InfoTip align="right">
                          62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
                        </InfoTip>
                      </span>
                    </div>
                  </div>
                </div>
                )
              )}

              {view === 'addFunds' && target && (
                reviewOpen ? (
                  <PaymentReviewCard
                    kind="fixed"
                    alreadyWinning={isAlreadyTop}
                    message={target.message || ''}
                    amountLabel={`${amount || '0'} ETH`}
                    amountUsd={ethPrice && parseFloat(amount || '0') > 0 ? formatUsd(parseFloat(amount) * ethPrice) : null}
                    markeeEarnedLabel={`${formatMarkeeAmount(reviewMarkeeEarned)} MARKEE`}
                    willWin={reviewWillWin}
                    minToWinLabel={reviewMinToWinLabel}
                    chainId={CANONICAL_CHAIN_ID}
                    markeeId={target.address}
                    boardAdmin={meta?.admin}
                  />
                ) : (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', marginBottom: 18 }}>
                    <ModeratedContent chainId={CANONICAL_CHAIN_ID} message={target.message ?? ''} markeeId={target.address} boardAdmin={meta?.admin}>
                      <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>{target.message || <MessageLoading />}</div>
                    </ModeratedContent>
                    <div style={{ marginTop: 6 }}>
                      <MessageMeta
                        views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                        isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                        authorLabel={<ModeratedAuthor chainId={CANONICAL_CHAIN_ID} message={target.message ?? ''} markeeId={target.address} boardAdmin={meta?.admin}>{target.name || fmtAddr(target.owner)}</ModeratedAuthor>}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AmountCard
                      amount={amount} setAmount={setAmount} lastPreset={lastPreset} setLastPreset={setLastPreset}
                      setHasUserEdited={setHasUserEdited} minimumAmountFormatted={minimumAmountFormatted}
                      maxSpendableFormatted={maxSpendableFormatted} spendableBalance={spendableBalance}
                      winAmountFormatted={winAmountFormatted} twoXAmountFormatted={twoXAmountFormatted} isAlreadyTop={isAlreadyTop} ethPrice={ethPrice}
                      balanceData={balanceData} busy={busy} showMin={false}
                    />
                    <ReceiveCard amount={amount} compact={false} />
                  </div>
                </div>
                )
              )}

              {view === 'edit' && target && (
                reviewOpen ? (
                  <PaymentReviewCard
                    kind="fixed"
                    editing
                    message={message}
                    amountLabel="Free — message update only"
                    amountUsd={null}
                    markeeEarnedLabel="0 MARKEE"
                    willWin={reviewWillWin}
                    minToWinLabel={reviewMinToWinLabel}
                    chainId={CANONICAL_CHAIN_ID}
                    markeeId={target.address}
                    boardAdmin={meta?.admin}
                  />
                ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Current message</div>
                    <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45 }}>
                      <ModeratedContent chainId={CANONICAL_CHAIN_ID} message={target.message ?? ''} markeeId={target.address} boardAdmin={meta?.admin}>
                        {target.message}
                      </ModeratedContent>
                      <div style={{ marginTop: 6 }}>
                        <MessageMeta
                          views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                          isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                          authorLabel={<ModeratedAuthor chainId={CANONICAL_CHAIN_ID} message={target.message ?? ''} markeeId={target.address} boardAdmin={meta?.admin}>{target.name || fmtAddr(target.owner)}</ModeratedAuthor>}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>Set new message</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{message.length}/{maxLen}</span>
                    </div>
                    <textarea
                      value={message}
                      onChange={e => {
                        setHasUserEdited(true)
                        setMessage(e.target.value.slice(0, maxLen))
                        if (isMessageFieldError(error)) setError(null)
                      }}
                      placeholder="Enter your new message..."
                      rows={3}
                      style={{ ...messageBoxStyle, resize: 'vertical' }}
                      disabled={busy}
                    />{messageModeration.ui}
                    {isMessageFieldError(error) && (
                      <p style={{ fontSize: 12, color: '#FF8E8E', margin: '6px 0 0' }}>{error}</p>
                    )}
                  </div>
                </div>
                )
              )}

              {view !== 'list' && paymentNotices}
              {((error && !isMessageFieldError(error)) || isError) && view !== 'list' && !reviewOpen && !walletTimeout.blocked && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>
                  {(error && !isMessageFieldError(error)) ? error : formatTransactionError(writeError)}
                </p>
              )}
            </div>

            {/* ── Footer (addFunds / edit, or list while reviewing — list otherwise inlines its own CTA above the leaderboard) ── */}
            {(view !== 'list' || reviewOpen) && (
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              {reviewOpen ? (
                <div style={{ width: '100%' }}>
                  <PaymentReviewFooter
                    onBack={() => setReviewOpen(false)}
                    onConfirm={() => {
                      if (view === 'list') handleBuyNew()
                      else if (view === 'addFunds') handleAddFunds()
                      else handleUpdateMessage()
                    }}
                    busy={busy}
                    error={(error && !isMessageFieldError(error)) ? error : (isError ? formatTransactionError(writeError) : null)}
                  />
                </div>
              ) : (
              <>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                {view === 'edit'
                  ? 'As the message owner, only you can change this.'
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      62/38 split
                      <InfoTip>
                        62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
                      </InfoTip>
                    </span>}
              </div>
              <BtnTooltip reason={btnDisabledReason}>
                <button
                  onClick={() => {
                    if (view === 'edit') void handleUpdateMessage()
                    else setReviewOpen(true)
                  }}
                  disabled={btnDisabled}
                  style={{
                    background: PINK, color: BG, border: 'none', borderRadius: 8,
                    padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                    cursor: btnDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: btnDisabled ? 0.4 : 1, transition: 'opacity 140ms',
                  }}
                >
                  {view === 'edit' ? 'Save' : 'Review Payment Info'}
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
  )
}
