'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi, parseEther, formatEther, type Address, type Hex } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE,
  SUPERFLUID_HOST_ABI,
  CFA_FORWARDER_ABI,
  CFA_AGREEMENT_ID,
  monthlyToRatePerSec,
  ratePerSecToMonthly,
  bufferFor,
  openStreamValue,
  buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'

// ── Design tokens (shared with the other modals) ───────────────────────────────
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BG = '#060A2A'
const BG2 = '#0A0F3D'
const PINK = '#F897FE'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED = '#8A8FBF'
const TEXT = '#EDEEFF'
const TEXT2 = '#B8B6D9'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

export type StreamTarget = { address: Address; message?: string; name?: string }

interface StreamModalProps {
  isOpen: boolean
  onClose: () => void
  board: Address
  markee: StreamTarget
  onSuccess?: () => void
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  )
}

function TxRing({ done }: { done: boolean }) {
  return (
    <div style={{
      width: 72, height: 72, borderRadius: 99, flexShrink: 0,
      background: done ? PINK : 'transparent',
      border: done ? 'none' : `2px solid ${PINK}`,
      borderTopColor: done ? undefined : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: done ? 'none' : 'spin 1s linear infinite',
      boxShadow: '0 0 32px rgba(248,151,254,0.3)',
    }}>
      {done && (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke={BG} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

export function StreamModal({ isOpen, onClose, board, markee, onSuccess }: StreamModalProps) {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id
  const enabled = isOpen && !!address && isCorrectChain

  const [monthly, setMonthly] = useState('')
  const [fundMonths, setFundMonths] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [action, setAction] = useState<'open' | 'stop' | 'withdraw'>('open')

  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN.id })
  // The approve transaction is awaited inline, so only the action's final hash lands here and
  // drives the confirmation/success UI (an approve receipt must not trigger the success screen).
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

  // Lets the async open flow bail out after each await if the user closed the modal meanwhile.
  const openRef = useRef(isOpen)
  openRef.current = isOpen

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address, chainId: CANONICAL_CHAIN.id })
  const { fundWallet } = useFundWallet({ onUserExited: () => refetchBalance() })

  // ── Reads ─────────────────────────────────────────────────────────────────
  const { data: minMonthlyWei } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'minimumMonthlyRate', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const { data: cfaAgreement } = useReadContract({
    address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID], chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const { data: backedMarkee, refetch: refetchBacked } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerMarkee', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled },
  })
  const { data: deposit, refetch: refetchDeposit } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled },
  })
  const { data: currentRate, refetch: refetchRate } = useReadContract({
    address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate', args: address ? [ETHX, address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'allowance', args: address ? [address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled },
  })

  const backsThis = !!backedMarkee && backedMarkee.toLowerCase() === markee.address.toLowerCase()
  const backsOther = !!backedMarkee && backedMarkee !== '0x0000000000000000000000000000000000000000' && !backsThis
  const readsReady = !!cfaAgreement && allowance !== undefined && !!publicClient

  const minMonthlyEth = minMonthlyWei ? formatEther(minMonthlyWei) : '0'

  // ── Derived amounts for the open form ───────────────────────────────────────
  const calc = useMemo(() => {
    let monthlyWei = 0n
    try { monthlyWei = monthly ? parseEther(monthly) : 0n } catch { /* invalid input */ }
    const ratePerSec = monthlyToRatePerSec(monthlyWei)
    const buffer = bufferFor(ratePerSec)
    // Scale months to milli-months so prefund stays exact bigint math (no parseEther on a JS float).
    const monthsMilli = BigInt(Math.max(0, Math.round((Number(fundMonths) || 0) * 1000)))
    const prefund = (monthlyWei * monthsMilli) / 1000n
    const value = openStreamValue(buffer, prefund)
    const runwayDays = ratePerSec > 0n ? Number(prefund / ratePerSec) / 86400 : 0
    return { monthlyWei, ratePerSec, buffer, prefund, value, runwayDays }
  }, [monthly, fundMonths])

  const insufficientBalance = !!balanceData && calc.value > 0n && balanceData.value < calc.value

  // ── Reset / close-on-success ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setMonthly(''); setFundMonths('1'); setError(null); setApproving(false); setSubmitting(false); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      refetchBacked(); refetchDeposit(); refetchRate(); refetchAllowance(); refetchBalance()
      const t = setTimeout(() => { onClose(); onSuccess?.() }, 2200)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isOpen, onClose, onSuccess, refetchBacked, refetchDeposit, refetchRate, refetchAllowance, refetchBalance])

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleOpenStream() {
    setError(null)
    if (!address) return
    if (!cfaAgreement) {
      setError('Still loading chain data. Try again in a moment.')
      return
    }
    if (calc.ratePerSec <= 0n) { setError('Enter a monthly rate.'); return }
    // Mirror the on-chain check exactly: it validates ratePerSec * SECONDS_IN_MONTH, not the typed amount.
    if (minMonthlyWei && ratePerSecToMonthly(calc.ratePerSec) < minMonthlyWei) {
      setError(`Minimum is ${minMonthlyEth} ETH / month.`); return
    }
    // The stream locks its own CFA sender buffer (~4h of rate) from the prefund, on top of the board's
    // GDA buffer. Require the prefund to clear that so createFlow can't revert for insufficient balance.
    if (calc.prefund <= calc.buffer) { setError('Fund the stream for longer (a few hours minimum).'); return }

    if (!publicClient) {
      setError('Still loading chain data. Try again in a moment.')
      return
    }

    try {
      setAction('open')
      setSubmitting(true)

      if ((allowance ?? 0n) < calc.buffer) {
        setApproving(true)
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, calc.buffer],
          chainId: CANONICAL_CHAIN.id,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('The approval transaction reverted.')
        await refetchAllowance()
        if (!openRef.current) return
        setApproving(false)
      }

      const ops = buildOpenStreamOps({
        ethx: ETHX,
        board,
        markee: markee.address,
        backer: address,
        ratePerSec: calc.ratePerSec,
        buffer: calc.buffer,
        cfaAgreement: cfaAgreement as Address,
      })

      const batchHash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: calc.value,
        chainId: CANONICAL_CHAIN.id,
      })
      if (!openRef.current) return
      setTxHash(batchHash)
    } catch (e: unknown) {
      if (!openRef.current) return
      setApproving(false)
      setSubmitting(false)
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed.')
    }
  }

  async function handleStopStream() {
    setError(null)
    setAction('stop')
    try {
      const hash = await writeContractAsync({
        address: CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: 'setFlowrate',
        args: [ETHX, board, 0n],
        chainId: CANONICAL_CHAIN.id,
      })
      setTxHash(hash)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed.')
    }
  }

  async function handleWithdrawDeposit() {
    setError(null)
    setAction('withdraw')
    try {
      const hash = await writeContractAsync({
        address: board,
        abi: StreamingLeaderboardABI,
        functionName: 'withdrawDeposit',
        args: [],
        chainId: CANONICAL_CHAIN.id,
      })
      setTxHash(hash)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed.')
    }
  }

  if (!isOpen) return null

  const busy = approving || submitting || isPending || isConfirming
  const txActive = busy || isSuccess
  const stepLabel = isSuccess
    ? 'Done'
    : approving ? 'Approve deposit'
    : isPending ? 'Confirm in wallet'
    : isConfirming ? 'On Base'
    : backsThis ? 'Manage stream'
    : 'Stream to back'

  const currentMonthlyEth = currentRate && currentRate > 0n ? formatEther(ratePerSecToMonthly(currentRate)) : '0'

  return (
    <div
      onClick={onClose}
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
          width: '100%', maxWidth: 480,
          background: BG2, borderRadius: 16, border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'Manrope, system-ui, sans-serif', color: TEXT, overflow: 'hidden',
          animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            {stepLabel}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}>×</button>
        </div>

        {txActive ? (
          <div style={{ padding: '56px 22px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center', flex: 1 }}>
            <TxRing done={isSuccess} />
            <div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                {isSuccess
                  ? (action === 'stop' ? '✓ Stream stopped' : action === 'withdraw' ? '✓ Deposit withdrawn' : '🎉 Stream live')
                  : approving ? 'Approving the deposit' : isPending ? 'Confirm in your wallet' : 'Settling on Base'}
              </div>
              <div style={{ color: MUTED, fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
                {isSuccess
                  ? (action === 'stop'
                      ? 'Your stream is closed. Your deposit is now refundable.'
                      : action === 'withdraw'
                        ? 'Your refundable buffer deposit is back in your wallet.'
                        : 'Your stream is backing this Markee. The board ranks by streamed rate.')
                  : approving
                    ? 'A small approval lets the board hold your refundable buffer. The stream opens next.'
                    : 'Usually under 2 seconds on Base.'}
              </div>
            </div>
          </div>
        ) : !isConnected ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to stream.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>
        ) : !isCorrectChain ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to stream.</p>
            <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Switch to Base
            </button>
          </div>
        ) : (
          <div style={{ padding: '22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {markee.name && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT2 }}>
                Backing <span style={{ color: PINK }}>{markee.name}</span>
              </div>
            )}

            {backsThis ? (
              <>
                <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Row label="Your stream" value={`${currentMonthlyEth} ETH / mo`} />
                  <Row label="Buffer on deposit" value={`${deposit ? formatEther(deposit) : '0'} ETHx`} />
                </div>
                <button onClick={handleStopStream} disabled={busy} style={btnStyle(false, busy)}>Stop stream</button>
                <button
                  onClick={handleWithdrawDeposit}
                  disabled={busy || (!!currentRate && currentRate > 0n)}
                  style={btnStyle(true, busy || (!!currentRate && currentRate > 0n))}
                >
                  Withdraw deposit
                </button>
                {!!currentRate && currentRate > 0n && (
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Stop the stream before withdrawing the deposit.</div>
                )}
              </>
            ) : backsOther ? (
              <div style={{ color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
                You already stream to another Markee on this board. Each backer can back one Markee at a time, so stop that stream first.
              </div>
            ) : (
              <>
                <ModalField label={`Monthly rate (min ${minMonthlyEth} ETH)`}>
                  <input
                    inputMode="decimal"
                    value={monthly}
                    onChange={e => setMonthly(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.05"
                    style={inputStyle}
                  />
                  {calc.monthlyWei > 0n && ethPrice ? (
                    <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 6 }}>
                      ≈ {formatUsd(Number(monthly) * ethPrice)} / month
                    </div>
                  ) : null}
                </ModalField>

                <ModalField label="Fund for (months)">
                  <input
                    inputMode="decimal"
                    value={fundMonths}
                    onChange={e => setFundMonths(e.target.value.replace(/[^0-9.]/g, ''))}
                    style={inputStyle}
                  />
                </ModalField>

                {calc.value > 0n && (
                  <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Row label="Stream rate" value={`${monthly || '0'} ETH / mo`} />
                    <Row label="Refundable buffer" value={`${formatEther(calc.buffer)} ETH`} />
                    <Row label="Prefund (your ETHx)" value={`${formatEther(calc.prefund)} ETH`} />
                    <Row label="Est. runway" value={`~${calc.runwayDays.toFixed(1)} days`} />
                    <div style={{ height: 1, background: BORDER, margin: '2px 0' }} />
                    <Row label="Total to send" value={`${formatEther(calc.value)} ETH`} bold />
                  </div>
                )}

                {insufficientBalance ? (
                  <button onClick={() => authenticated && address ? fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount: formatEther(calc.value) } }) : undefined} style={btnStyle(true)}>
                    Add funds
                  </button>
                ) : (
                  <button onClick={handleOpenStream} disabled={busy || !readsReady} style={btnStyle(true, busy || !readsReady)}>
                    {readsReady ? 'Start streaming' : 'Loading chain data…'}
                  </button>
                )}
                <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                  Two quick transactions: a deposit approval, then the stream. The buffer is fully refundable when you stop.
                </div>
              </>
            )}

            {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const, background: BG, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
  fontFamily: MONO, fontSize: 13, outline: 'none',
}

function btnStyle(primary: boolean, disabled = false): React.CSSProperties {
  return {
    width: '100%', padding: '13px 0', borderRadius: 10, border: primary ? 'none' : `1px solid ${BORDER}`,
    background: primary ? PINK : 'transparent', color: primary ? BG : TEXT,
    fontFamily: 'inherit', fontWeight: 700, fontSize: 15,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: bold ? 14 : 12, color: bold ? PINK : TEXT2 }}>{value}</span>
    </div>
  )
}
