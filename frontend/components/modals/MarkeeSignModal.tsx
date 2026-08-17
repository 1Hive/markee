'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { Eye } from 'lucide-react'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { formatUsd, FAST_TX_GAS_RESERVE } from '@/lib/utils'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { TxProgress, InfoTip } from '@/components/modals/StreamUI'
import { useLeaderboardDetail, type LeaderboardMarkee } from '@/lib/contracts/useLeaderboardDetail'
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

// Caps each side of the decimal at 9 digits so a pasted/huge value can't blow out the layout.
function sanitizeAmountInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot !== -1) cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
  const [intPart, fracPart] = cleaned.split('.')
  const cappedInt = (intPart ?? '').slice(0, 9)
  return fracPart !== undefined ? `${cappedInt}.${fracPart.slice(0, 9)}` : cappedInt
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
              onChange={e => { setHasUserEdited(true); setAmount(sanitizeAmountInput(e.target.value)); setLastPreset(null) }}
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
  markee, rank, views, isOwner, onFund, onEdit,
}: {
  markee: LeaderboardMarkee
  rank: number
  views: number
  isOwner: boolean
  onFund: () => void
  onEdit: () => void
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
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 14, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {markee.message || '—'}
        </div>
        <div style={{ marginTop: 2 }}>
          <MessageMeta views={views} isOwner={isOwner} authorLabel={subtitle} />
        </div>
      </div>
      <span style={{ color: BLUE, fontFamily: MONO, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{eth} ETH</span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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

  const [view, setView] = useState<View>('list')
  const [target, setTarget] = useState<LeaderboardMarkee | null>(null)
  const [message, setMessage] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasUserEdited, setHasUserEdited] = useState(false)
  const [lastPreset, setLastPreset] = useState<'min' | 'max' | 'win' | null>(null)

  const { writeContract, data: hash, isPending, isError, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const { data: balanceData } = useBalance({
    address: activeAddress as `0x${string}` | undefined, chainId: CANONICAL_CHAIN.id,
  })

  const { data: maxMessageLength } = useReadContract({
    address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'maxMessageLength', chainId: CANONICAL_CHAIN.id,
  })

  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const topMarkee = markees[0] ?? null
  const topFundsAdded = topMarkee?.totalFundsAdded ?? 0n
  const fundedMarkees = markees.filter(m => m.totalFundsAdded > 0n)
  const minimumAmount = meta?.minimumPrice || parseEther('0.001')
  const minimumAmountFormatted = Number(formatEther(minimumAmount)).toFixed(3)
  const maxLen = Number(maxMessageLength || 223)

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
    setView('list'); setTarget(null); setMessage(''); setError(null); setHasUserEdited(false); setLastPreset(null)
    reset()
  }, [isOpen, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => {
        refetchLeaderboard()
        setView('list'); setTarget(null); setMessage(''); setAmount(''); setError(null); setHasUserEdited(false)
        reset()
        onSuccess?.()
      }, 2000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, isOpen])

  useEffect(() => {
    if (writeError) logTransactionError(writeError, 'MarkeeSignModal')
  }, [writeError])

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
    try { return balanceData.value >= parseEther(amount) + FAST_TX_GAS_RESERVE } catch { return false }
  }
  const getInsufficientBalanceMessage = () => {
    if (!amount || !balanceData || parseFloat(amount) <= 0) return null
    try {
      if (balanceData.value < parseEther(amount) + FAST_TX_GAS_RESERVE) {
        return `You don't have enough ETH after reserving ${formatEther(FAST_TX_GAS_RESERVE)} ETH for gas.`
      }
    } catch { return 'Invalid amount entered' }
    return null
  }
  const insufficientBalance = !!(amount && parseFloat(amount) > 0 && !canAffordTransaction())
  const spendableBalance = balanceData && balanceData.value > FAST_TX_GAS_RESERVE ? balanceData.value - FAST_TX_GAS_RESERVE : 0n
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
  const isAlreadyTop = view === 'addFunds' && !!target && !!topMarkee && target.address.toLowerCase() === topMarkee.address.toLowerCase()
  // 2X replaces WIN for a message that's already #1: adding its current total again doubles it.
  const twoXAmountFormatted = isAlreadyTop && target ? Number(formatEther(target.totalFundsAdded)).toFixed(3) : null

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
  const handleBuyNew = () => {
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
      writeContract({ address: strategyAddress, abi: TopDawgPartnerStrategyABI, functionName: 'createMarkee', args: [message, ''], value: amountWei, chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'MarkeeSignModal.createMarkee')
      setError(formatTransactionError(err))
    }
  }

  const handleAddFunds = () => {
    if (!target) return
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter an amount'); return }
    if (!canAffordTransaction()) { setError(getInsufficientBalanceMessage() || 'Insufficient balance'); return }
    setError(null)
    try {
      writeContract({ address: (target.pricingStrategy || leaderboardAddress) as `0x${string}`, abi: TopDawgPartnerStrategyABI, functionName: 'addFunds', args: [target.address as `0x${string}`], value: parseEther(amount), chainId: CANONICAL_CHAIN.id })
    } catch (err) {
      logTransactionError(err, 'MarkeeSignModal.addFunds')
      setError(formatTransactionError(err))
    }
  }

  const handleUpdateMessage = () => {
    if (!target) return
    if (!hasActiveWalletConnection) { setError('Please connect your wallet'); return }
    if (!isCorrectChain) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!message.trim()) { setError('Please enter a message'); return }
    if (message.length > maxLen) { setError(`Message must be ${maxLen} characters or less`); return }
    setError(null)
    try {
      writeContract({ address: (target.pricingStrategy || leaderboardAddress) as `0x${string}`, abi: TopDawgPartnerStrategyABI, functionName: 'updateMessage', args: [target.address as `0x${string}`, message], chainId: CANONICAL_CHAIN.id })
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
    setError(null); setHasUserEdited(false)
  }
  const openEdit = (m: LeaderboardMarkee) => {
    setTarget(m); setView('edit'); setMessage(''); setError(null); setHasUserEdited(false)
  }

  // Jump straight into a specific message's addFunds/edit sub-view (e.g. a page's dedicated
  // "Add funds"/"Edit" button), preserving 1-click behavior instead of landing on the list.
  useEffect(() => {
    if (!isOpen || !initialTargetAddress || !initialView || appliedInitialTargetRef.current) return
    const m = markees.find(x => x.address.toLowerCase() === initialTargetAddress.toLowerCase())
    if (!m) return
    appliedInitialTargetRef.current = true
    if (initialView === 'addFunds') openFund(m)
    else openEdit(m)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTargetAddress, initialView, markees])

  const backToList = () => {
    setView('list'); setTarget(null); setMessage(''); setError(null); setHasUserEdited(false); reset()
  }

  if (!isOpen) return null

  const busy = isPending || isConfirming
  // Missing/invalid message and amount are validated on click (see handleBuyNew / handleAddFunds /
  // handleUpdateMessage, which each setError and bail) -- matches create-a-markee's pattern of
  // keeping the button clickable rather than disabling ahead of time. Insufficient balance is the
  // one condition that actually blocks submission, so it disables the button proactively instead.
  // Editing a message is free -- a leftover `amount` from a previous view shouldn't block it.
  const blocksOnBalance = insufficientBalance && view !== 'edit'
  const btnDisabled = busy || isSuccess || blocksOnBalance
  const btnDisabledReason = busy ? 'Transaction in progress' : blocksOnBalance ? "You don't have enough ETH for this" : null

  const stepLabel = view === 'addFunds' ? 'ADD FUNDS' : view === 'edit' ? 'EDIT MESSAGE' : 'CHANGE THE MARKEE SIGN'

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
              txStep === 'pending' ? 'Confirming on Base' :
              view === 'edit' ? 'Success! Your message is updated' :
              view === 'list' ? 'Success! Your message is live' :
              'Success! Funds added to the sign'
            }
            detail={
              txStep === 'signing' ? 'Sign the transaction in your wallet.' :
              txStep === 'pending' ? 'Usually under 2 seconds on Base.' :
              'The sign will refresh in a moment.'
            }
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

              {view === 'list' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18, flexShrink: 0 }}>
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
                    />
                    {isMessageFieldError(error) && (
                      <p style={{ fontSize: 12, color: '#FF8E8E', margin: 0 }}>{error}</p>
                    )}
                  </div>

                  <div style={{ marginBottom: 10, flexShrink: 0 }}>
                    <AmountCard
                      amount={amount} setAmount={setAmount} lastPreset={lastPreset} setLastPreset={setLastPreset}
                      setHasUserEdited={setHasUserEdited} minimumAmountFormatted={minimumAmountFormatted}
                      maxSpendableFormatted={maxSpendableFormatted} spendableBalance={spendableBalance}
                      winAmountFormatted={winAmountFormatted} twoXAmountFormatted={null} isAlreadyTop={false} ethPrice={ethPrice}
                      balanceData={balanceData} busy={busy}
                    />
                  </div>

                  {((error && !isMessageFieldError(error)) || isError) && (
                    <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px', flexShrink: 0 }}>
                      {(error && !isMessageFieldError(error)) ? error : formatTransactionError(writeError)}
                    </p>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8, flexShrink: 0 }}>
                    <ReceiveCard amount={amount} />
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

                  {fundedMarkees.length > 0 && (
                    <>
                      <div style={{ textAlign: 'center', margin: '10px 0 0', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: BORDER }} />
                        <span style={{ position: 'relative', background: BG2, padding: '0 12px', fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>
                          Or add funds to an existing message
                        </span>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10, marginBottom: 18 }}>
                        {fundedMarkees.map((m, i) => (
                          <SignRow
                            key={m.address}
                            markee={m}
                            rank={i + 1}
                            views={viewsMap.get(m.address.toLowerCase()) ?? 0}
                            isOwner={!!activeAddress && m.owner.toLowerCase() === activeAddress.toLowerCase()}
                            onFund={() => openFund(m)}
                            onEdit={() => openEdit(m)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {view === 'addFunds' && target && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', marginBottom: 18 }}>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45, wordBreak: 'break-word' }}>{target.message || '—'}</div>
                    <div style={{ marginTop: 6 }}>
                      <MessageMeta
                        views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                        isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                        authorLabel={target.name || fmtAddr(target.owner)}
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
              )}

              {view === 'edit' && target && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Current message</div>
                    <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(15,27,107,0.35)', padding: '14px 16px', fontFamily: MONO, fontSize: 14, color: TEXT, lineHeight: 1.45 }}>
                      {target.message}
                      <div style={{ marginTop: 6 }}>
                        <MessageMeta
                          views={viewsMap.get(target.address.toLowerCase()) ?? 0}
                          isOwner={!!activeAddress && target.owner.toLowerCase() === activeAddress.toLowerCase()}
                          authorLabel={target.name || fmtAddr(target.owner)}
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
                    />
                    {isMessageFieldError(error) && (
                      <p style={{ fontSize: 12, color: '#FF8E8E', margin: '6px 0 0' }}>{error}</p>
                    )}
                  </div>
                </div>
              )}

              {((error && !isMessageFieldError(error)) || isError) && view !== 'list' && (
                <p style={{ fontSize: 12, color: '#FF8E8E', margin: '0 0 14px' }}>
                  {(error && !isMessageFieldError(error)) ? error : formatTransactionError(writeError)}
                </p>
              )}
            </div>

            {/* ── Footer (addFunds / edit only — list inlines its own CTA above the leaderboard) ── */}
            {view !== 'list' && (
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, background: 'rgba(6,10,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                {view === 'edit'
                  ? 'As the message owner, only you can update.'
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
                    if (view === 'addFunds') handleAddFunds()
                    else handleUpdateMessage()
                  }}
                  disabled={btnDisabled}
                  style={{
                    background: PINK, color: BG, border: 'none', borderRadius: 8,
                    padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
                    cursor: btnDisabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    opacity: btnDisabled ? 0.4 : 1, transition: 'opacity 140ms',
                  }}
                >
                  {view === 'addFunds' ? 'Add Funds' : 'Update Message'}
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
