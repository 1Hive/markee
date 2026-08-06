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
import { erc20Abi, formatEther, type Address, type Hex } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE,
  SUPERFLUID_HOST_ABI,
  CFA_FORWARDER_ABI,
  CFA_AGREEMENT_ID,
  GDA_AGREEMENT_ID,
  monthlyToRatePerSec,
  ratePerSecToMonthly,
  bufferFor,
  openStreamValue,
  buildOpenStreamOps,
  buildUpdateStreamOps,
} from '@/lib/superfluid/streaming'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import {
  MONO, BG, BLUE, PINK, BORDER, MUTED, TEXT, TEXT2,
  inputStyle, btnStyle, sanitizeDecimalInput, parseEthInput, retryUntilLoaded,
  Spinner, InfoTip, ModalField, Row, ModalShell, TxProgress,
} from '@/components/modals/StreamUI'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

export type StreamTarget = { address: Address; message?: string; name?: string }

const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const FAST_TX_GAS_RESERVE = BigInt('200000000000000') // 0.0002 ETH

interface StreamModalProps {
  isOpen: boolean
  onClose: () => void
  board: Address
  markee: StreamTarget
  onSuccess?: () => void
  isActivation?: boolean
}

// Opening a stream to back a Markee, or changing the rate of the stream you already run. Claiming
// lives in ClaimModal and stop/top-up/withdraw in ManageStreamModal.
export function StreamModal({ isOpen, onClose, board, markee, onSuccess, isActivation = false }: StreamModalProps) {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id
  const enabled = isOpen && !!address && isCorrectChain

  const [monthly, setMonthly] = useState('')
  const [fundMonths, setFundMonths] = useState('1')
  const [newMonthly, setNewMonthly] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [action, setAction] = useState<'open' | 'update'>('open')

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

  const spendableBalance = balanceData && balanceData.value > FAST_TX_GAS_RESERVE
    ? balanceData.value - FAST_TX_GAS_RESERVE
    : 0n

  // ── Reads ─────────────────────────────────────────────────────────────────
  const { data: minMonthlyWei } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'minimumMonthlyRate', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: cfaAgreement } = useReadContract({
    address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID], chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: gdaAgreement } = useReadContract({
    address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [GDA_AGREEMENT_ID], chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: refundPool } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'poolOf', args: [markee.address], chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: backedMarkee, refetch: refetchBacked } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerMarkee', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: deposit, refetch: refetchDeposit } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: currentRate, refetch: refetchRate } = useReadContract({
    address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate', args: address ? [ETHX, address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'allowance', args: address ? [address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: boardAdmin } = useReadContract({
    address: board, abi: ADMIN_ABI, functionName: 'admin', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })

  const backsThis = !!backedMarkee && backedMarkee.toLowerCase() === markee.address.toLowerCase()
  const backsOther = !!backedMarkee && backedMarkee !== '0x0000000000000000000000000000000000000000' && !backsThis
  const poolReady = !!refundPool && refundPool !== '0x0000000000000000000000000000000000000000'
  const readsReady = !!cfaAgreement && !!gdaAgreement && poolReady && allowance !== undefined && !!publicClient

  const minLoaded = minMonthlyWei !== undefined
  const minMonthlyEth = minMonthlyWei ? formatEther(minMonthlyWei) : '0'

  // ── Derived amounts for the open form ───────────────────────────────────────
  const calc = useMemo(() => {
    const monthlyWei = parseEthInput(monthly)
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
  // Compare the typed amount directly to avoid integer-division round-trip precision loss.
  const belowMin = calc.monthlyWei > 0n && !!minMonthlyWei && calc.monthlyWei < minMonthlyWei

  // ── Derived state for editing a running stream ──────────────────────────────
  const live = useMemo(() => {
    const rate = currentRate && currentRate > 0n ? currentRate : 0n
    const nextMonthlyWei = parseEthInput(newMonthly)
    const nextRate = monthlyToRatePerSec(nextMonthlyWei)
    const required = bufferFor(nextRate)
    const held = deposit ?? 0n
    // The board refuses an update whose new rate outruns the buffer it holds for this backer.
    const depositTopUp = required > held ? required - held : 0n
    return { rate, nextRate, nextMonthlyWei, depositTopUp, changed: nextRate > 0n && nextRate !== rate }
  }, [currentRate, newMonthly, deposit])

  const nextBelowMin = live.nextMonthlyWei > 0n && !!minMonthlyWei && live.nextMonthlyWei < minMonthlyWei

  // ── Reset / close-on-success ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setMonthly(''); setFundMonths('1'); setNewMonthly('')
      setError(null); setApproving(false); setSubmitting(false); setTxHash(undefined); reset()
      rateSeeded.current = false
    }
  }, [isOpen, reset])

  // Start the rate field at what the backer streams today, so the input reads as an edit. Seeded
  // once per open (not on emptiness): a field the backer cleared must stay cleared when the
  // currentRate read refetches.
  const rateSeeded = useRef(false)
  useEffect(() => {
    if (isOpen && !rateSeeded.current && currentRate && currentRate > 0n) {
      rateSeeded.current = true
      setNewMonthly(formatEther(ratePerSecToMonthly(currentRate)))
    }
  }, [isOpen, currentRate])

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
    if (!readsReady) return
    if (calc.ratePerSec <= 0n) { setError('Enter a monthly rate.'); return }
    if (belowMin) { setError(`The minimum is ${minMonthlyEth} ETH / month.`); return }
    // The stream locks its own CFA sender buffer (~4h of rate) from the prefund, on top of the board's
    // GDA buffer. Require the prefund to clear that so createFlow can't revert for insufficient balance.
    if (calc.prefund <= calc.buffer) { setError('Fund the stream for longer (a few hours minimum).'); return }

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
        const approveReceipt = await publicClient!.waitForTransactionReceipt({ hash: approveHash })
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
        gdaAgreement: gdaAgreement as Address,
        pool: refundPool as Address,
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
      logTransactionError(e, 'StreamModal.openStream')
      setError(formatTransactionError(e))
    }
  }

  async function handleUpdateRate() {
    setError(null)
    if (!address || !publicClient) return
    if (!cfaAgreement) return
    if (live.nextRate <= 0n) { setError('Enter a monthly rate.'); return }
    if (live.nextRate === live.rate) { setError('That is already your rate.'); return }
    if (nextBelowMin) { setError(`The minimum is ${minMonthlyEth} ETH / month.`); return }
    if (balanceData && balanceData.value < live.depositTopUp) {
      setError('Not enough ETH for the larger deposit this rate needs.'); return
    }

    try {
      setAction('update')
      setSubmitting(true)

      if (live.depositTopUp > 0n && (allowance ?? 0n) < live.depositTopUp) {
        setApproving(true)
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, live.depositTopUp],
          chainId: CANONICAL_CHAIN.id,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('The approval transaction reverted.')
        await refetchAllowance()
        if (!openRef.current) return
        setApproving(false)
      }

      // The wrap covers the deposit the board pulls, so raising the rate never eats the runway the
      // stream is already funded with.
      const ops = buildUpdateStreamOps({
        ethx: ETHX,
        board,
        backer: address,
        ratePerSec: live.nextRate,
        depositTopUp: live.depositTopUp,
        wrapValue: live.depositTopUp,
        cfaAgreement: cfaAgreement as Address,
      })

      const hash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: live.depositTopUp,
        chainId: CANONICAL_CHAIN.id,
      })
      if (!openRef.current) return
      setTxHash(hash)
    } catch (e: unknown) {
      if (!openRef.current) return
      setApproving(false)
      setSubmitting(false)
      logTransactionError(e, 'StreamModal.updateRate')
      setError(formatTransactionError(e))
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
    : backsThis ? 'Change your rate'
    : isActivation ? 'Activate Markee'
    : 'Stream to back'

  const markeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Number(formatEther(calc.value)))

  const activationSteps = isActivation ? [
    { label: 'Create Markee', done: true, active: false },
    { label: 'Approve Deposit', done: !approving && (submitting || isSuccess), active: approving },
    { label: 'Start Stream', done: isSuccess, active: !approving && submitting },
  ] : undefined

  const currentMonthlyEth = currentRate && currentRate > 0n ? formatEther(ratePerSecToMonthly(currentRate)) : '0'

  const minHint = (value: string, show: boolean) => show ? (
    <div style={{ fontFamily: MONO, fontSize: 11, color: PINK, marginTop: 6 }}>
      The minimum on this board is {minMonthlyEth} ETH / month.
    </div>
  ) : null

  const footer = !txActive && boardAdmin ? (
    <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
      62% to{' '}
      <a href={`https://basescan.org/address/${boardAdmin}`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>
        {boardAdmin.slice(0, 6)}…{boardAdmin.slice(-4)}
      </a>
      {' '}· 38% to the{' '}
      <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a>
    </div>
  ) : undefined

  return (
    <ModalShell stepLabel={stepLabel} onClose={onClose} footer={footer}>
      {txActive ? (
        <TxProgress
          isSuccess={isSuccess}
          steps={activationSteps}
          headline={isSuccess
            ? (action === 'update' ? '✓ Rate updated' : '🎉 Stream live')
            : approving ? 'Approving the deposit' : isPending ? 'Confirm in your wallet' : 'Settling on Base'}
          detail={isSuccess
            ? (action === 'update'
                ? 'Your stream now runs at the new rate.'
                : isActivation ? 'Your Markee is now live!' : 'Your stream is backing this Markee. The board ranks by streamed rate.')
            : approving
              ? isActivation ? 'Step 2 of 3 — a small approval before the stream opens.' : 'A small approval first, then the stream opens.'
              : 'Usually under 2 seconds on Base.'}
        />
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
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
                <Row label="Your stream" value={`${currentMonthlyEth} ETH / mo`} />
              </div>

              <ModalField label="New monthly rate (ETH)">
                <input
                  inputMode="decimal"
                  value={newMonthly}
                  onChange={e => setNewMonthly(sanitizeDecimalInput(e.target.value))}
                  placeholder={currentMonthlyEth}
                  style={inputStyle}
                />
                {minHint(newMonthly, nextBelowMin)}
                {!nextBelowMin && minLoaded && (
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
              </ModalField>
              <button onClick={handleUpdateRate} disabled={busy || !live.changed || nextBelowMin} style={btnStyle(true, busy || !live.changed || nextBelowMin)}>
                Update rate
              </button>
            </>
          ) : backsOther ? (
            <div style={{ color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
              You already stream to another Markee on this board. Each backer can back one Markee at a time, so stop that stream first.
            </div>
          ) : (
            <>
              {/* Minimum preset card */}
              {minLoaded && minMonthlyWei && (
                <button
                  onClick={() => setMonthly(minMonthlyEth)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', width: '100%',
                    background: monthly === minMonthlyEth ? 'rgba(248,151,254,0.08)' : BG,
                    border: `1.5px solid ${monthly === minMonthlyEth ? PINK : BORDER}`,
                    borderRadius: 12, padding: '13px 15px',
                    transition: 'border-color 140ms',
                  }}
                >
                  <div style={{ color: monthly === minMonthlyEth ? PINK : TEXT2, fontSize: 13, fontWeight: 600, marginBottom: 5, fontFamily: 'Manrope, system-ui, sans-serif' }}>Minimum</div>
                  <div style={{ color: TEXT, fontFamily: MONO, fontSize: 17, fontWeight: 800 }}>{minMonthlyEth} ETH / mo</div>
                  {ethPrice && <div style={{ color: BLUE, fontFamily: MONO, fontSize: 12, marginTop: 2 }}>{formatUsd(Number(minMonthlyEth) * ethPrice)} / mo</div>}
                  <div style={{ color: MUTED, fontSize: 12, marginTop: 4, fontFamily: 'Manrope, system-ui, sans-serif' }}>Stream at the lowest rate</div>
                </button>
              )}

              <ModalField label="Monthly rate (ETH)">
                <input
                  inputMode="decimal"
                  value={monthly}
                  onChange={e => setMonthly(sanitizeDecimalInput(e.target.value))}
                  placeholder={minLoaded && minMonthlyWei ? minMonthlyEth : '0.05'}
                  style={inputStyle}
                />
                {minHint(monthly, belowMin)}
                {!belowMin && calc.monthlyWei > 0n && ethPrice && (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: BLUE, marginTop: 6 }}>
                    ≈ {formatUsd(Number(formatEther(calc.monthlyWei)) * ethPrice)} / month
                  </div>
                )}
                {!belowMin && !minLoaded && (
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Spinner size={10} /> Loading the board minimum…
                  </div>
                )}
              </ModalField>

              {/* Balance + use max */}
              {balanceData && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: -8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span>
                    Balance: {parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH
                    <span style={{ opacity: 0.72 }}> ({formatEther(FAST_TX_GAS_RESERVE)} kept for gas)</span>
                  </span>
                  {ethPrice && <span style={{ color: BLUE, fontFamily: MONO }}>{formatUsd(parseFloat(formatEther(balanceData.value)) * ethPrice)}</span>}
                  <button
                    type="button"
                    onClick={() => {
                      const months = BigInt(Math.max(1, Math.round(Number(fundMonths) || 1)))
                      setMonthly(formatEther(spendableBalance / months))
                    }}
                    disabled={spendableBalance <= 0n}
                    style={{ background: 'transparent', border: 0, padding: 0, color: BLUE, fontFamily: MONO, fontSize: 12, cursor: spendableBalance > 0n ? 'pointer' : 'not-allowed', opacity: spendableBalance > 0n ? 1 : 0.45 }}
                  >
                    Use max
                  </button>
                </div>
              )}

              <ModalField
                label="Fund for (months)"
                info="You send this much upfront and it streams out over time. Top up or stop whenever you like."
              >
                <input
                  inputMode="decimal"
                  value={fundMonths}
                  onChange={e => setFundMonths(sanitizeDecimalInput(e.target.value))}
                  style={inputStyle}
                />
              </ModalField>

              {calc.value > 0n && (
                <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Row label="Stream rate" value={`${formatEther(calc.monthlyWei)} ETH / mo`} />
                  <Row label="Runs for" value={`~${calc.runwayDays.toFixed(1)} days`} />
                  <div style={{ height: 1, background: BORDER, margin: '2px 0' }} />
                  <Row
                    label="Total to send"
                    value={`${formatEther(calc.value)} ETH`}
                    bold
                    info={<>
                      {formatEther(calc.prefund)} ETH funds the stream, plus a {formatEther(calc.buffer)} ETH
                      security deposit Superfluid requires. The deposit is returned in full when you stop.
                    </>}
                  />
                </div>
              )}

              {/* MARKEE token estimate */}
              {calc.value > 0n && (
                <div style={{ borderRadius: 14, padding: '22px 20px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))', border: `1px solid rgba(248,151,254,0.35)` }}>
                  <div style={{ color: PINK, fontSize: 15, marginBottom: 6 }}>You&apos;ll receive</div>
                  <div style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: -1 }}>{markeeEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  <div style={{ color: PINK, fontSize: 15, marginTop: 8 }}>MARKEE tokens</div>
                </div>
              )}

              {insufficientBalance ? (
                <button
                  onClick={() => authenticated && address ? fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount: formatEther(calc.value) } }) : undefined}
                  disabled={!authenticated || !address}
                  style={btnStyle(true, !authenticated || !address)}
                >
                  Add funds
                </button>
              ) : (
                <button onClick={handleOpenStream} disabled={busy || !readsReady || belowMin} style={btnStyle(true, busy || !readsReady || belowMin)}>
                  {!readsReady ? <><Spinner /> Loading on-chain data…</> : isActivation ? 'Activate Markee' : 'Start streaming'}
                </button>
              )}
              {!isActivation && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                  Two quick transactions: an approval, then your stream goes live.
                </div>
              )}
            </>
          )}

          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      )}
    </ModalShell>
  )
}
