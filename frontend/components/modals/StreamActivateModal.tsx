'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, formatEther, decodeEventLog, type Address, type Hex } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, GDA_AGREEMENT_ID,
  monthlyToRatePerSec, bufferFor, openStreamValue, buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import {
  MONO, BG, BG2, BLUE, PINK, BORDER, MUTED, TEXT, TEXT2,
  inputStyle, btnStyle, sanitizeDecimalInput, parseEthInput, retryUntilLoaded,
  Spinner, InfoTip, ModalField, Row, ModalShell, TxProgress, TxSteps,
} from '@/components/modals/StreamUI'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { ConnectButton } from '@/components/wallet/ConnectButton'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address

const FAST_TX_GAS_RESERVE = BigInt('200000000000000') // 0.0002 ETH

const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const MARKEE_CREATED_ABI = [
  {
    type: 'event', name: 'MarkeeCreated',
    inputs: [
      { name: 'markeeAddress', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'message', type: 'string', indexed: false },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
] as const

type Phase = 'idle' | 'creating' | 'approving' | 'streaming' | 'done'

interface StreamActivateModalProps {
  isOpen: boolean
  onClose: () => void
  board: Address
  onSuccess?: () => void
  title?: string
  messageLabel?: string
  messagePlaceholder?: string
}

export function StreamActivateModal({
  isOpen,
  onClose,
  board,
  onSuccess,
  title = 'ACTIVATE MARKEE',
  messageLabel = 'SET FIRST MESSAGE',
  messagePlaceholder = 'Your message on the board',
}: StreamActivateModalProps) {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN.id })
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id
  const enabled = isOpen && !!address && isCorrectChain

  const [message, setMessage] = useState('')
  const [monthly, setMonthly] = useState('')
  const [fundMonths, setFundMonths] = useState('1')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)

  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

  const mountedRef = useRef(isOpen)
  mountedRef.current = isOpen

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address, chainId: CANONICAL_CHAIN.id })
  const { fundWallet } = useFundWallet({ onUserExited: () => refetchBalance() })

  const spendableBalance = balanceData && balanceData.value > FAST_TX_GAS_RESERVE
    ? balanceData.value - FAST_TX_GAS_RESERVE
    : 0n

  const { data: minMonthlyWei } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'minimumMonthlyRate', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen, refetchInterval: retryUntilLoaded },
  })
  const { data: boardAdmin } = useReadContract({
    address: board, abi: ADMIN_ABI, functionName: 'admin', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })

  const minLoaded = minMonthlyWei !== undefined
  const minMonthlyEth = minMonthlyWei ? formatEther(minMonthlyWei) : '0'

  // ── Amount derivations ────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const monthlyWei = parseEthInput(monthly)
    const ratePerSec = monthlyToRatePerSec(monthlyWei)
    const buffer = bufferFor(ratePerSec)
    const monthsMilli = BigInt(Math.max(0, Math.round((Number(fundMonths) || 0) * 1000)))
    const prefund = (monthlyWei * monthsMilli) / 1000n
    const value = openStreamValue(buffer, prefund)
    const runwayDays = ratePerSec > 0n ? Number(prefund / ratePerSec) / 86400 : 0
    return { monthlyWei, ratePerSec, buffer, prefund, value, runwayDays }
  }, [monthly, fundMonths])

  const belowMin = calc.monthlyWei > 0n && !!minMonthlyWei && calc.monthlyWei < minMonthlyWei
  const insufficientBalance = !!balanceData && calc.value > 0n && balanceData.value < calc.value
  const markeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Number(formatEther(calc.value)))

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setMessage(''); setMonthly(''); setFundMonths('1')
      setPhase('idle'); setError(null); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  // ── Success → close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isSuccess && isOpen) {
      setPhase('done')
      const t = setTimeout(() => { onClose(); onSuccess?.() }, 2200)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isOpen, onClose, onSuccess])

  // ── 3-tx handler ──────────────────────────────────────────────────────────
  async function handleActivate() {
    if (!address || !publicClient) return
    setError(null)

    if (!message.trim()) { setError('Enter a message.'); return }
    if (calc.ratePerSec <= 0n) { setError('Enter a monthly rate.'); return }
    if (belowMin) { setError(`The minimum on this board is ${minMonthlyEth} ETH / month.`); return }
    if (calc.prefund <= calc.buffer) { setError('Fund the stream for longer (a few hours minimum).'); return }

    try {
      // ── Tx 1: Create Markee ──────────────────────────────────────────────
      setPhase('creating')
      const createHash = await writeContractAsync({
        address: board,
        abi: StreamingLeaderboardABI,
        functionName: 'createMarkee',
        args: [message, ''],
        chainId: CANONICAL_CHAIN.id,
      })
      if (!mountedRef.current) return
      const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash })
      if (createReceipt.status !== 'success') throw new Error('Create Markee transaction reverted.')
      if (!mountedRef.current) return

      // Decode markee address from MarkeeCreated event
      let markeeAddress: Address | null = null
      for (const log of createReceipt.logs) {
        if (log.address.toLowerCase() !== board.toLowerCase()) continue
        try {
          const ev = decodeEventLog({ abi: MARKEE_CREATED_ABI, data: log.data, topics: log.topics })
          if (ev.eventName === 'MarkeeCreated') { markeeAddress = ev.args.markeeAddress; break }
        } catch { /* not the right event, keep scanning */ }
      }
      if (!markeeAddress) throw new Error('Could not find new Markee address in receipt.')

      // Read agreements, pool, and allowance inline (pool only exists after createMarkee)
      const [cfaAgreement, gdaAgreement, pool, currentAllowance] = await Promise.all([
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID] }),
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [GDA_AGREEMENT_ID] }),
        publicClient.readContract({ address: board, abi: StreamingLeaderboardABI, functionName: 'poolOf', args: [markeeAddress] }),
        publicClient.readContract({ address: ETHX, abi: erc20Abi, functionName: 'allowance', args: [address, board] }),
      ])
      if (!mountedRef.current) return

      if (!pool || (pool as Address) === '0x0000000000000000000000000000000000000000') {
        throw new Error('Markee pool not yet initialized. Please try again.')
      }

      // ── Tx 2: Approve (if needed) ────────────────────────────────────────
      if ((currentAllowance as bigint) < calc.buffer) {
        setPhase('approving')
        const approveHash = await writeContractAsync({
          address: ETHX,
          abi: erc20Abi,
          functionName: 'approve',
          args: [board, calc.buffer],
          chainId: CANONICAL_CHAIN.id,
        })
        if (!mountedRef.current) return
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') throw new Error('Approval transaction reverted.')
        if (!mountedRef.current) return
      }

      // ── Tx 3: Open stream ────────────────────────────────────────────────
      setPhase('streaming')
      const ops = buildOpenStreamOps({
        ethx: ETHX,
        board,
        markee: markeeAddress,
        backer: address,
        ratePerSec: calc.ratePerSec,
        buffer: calc.buffer,
        cfaAgreement: cfaAgreement as Address,
        gdaAgreement: gdaAgreement as Address,
        pool: pool as Address,
      })
      const streamHash = await writeContractAsync({
        address: HOST,
        abi: SUPERFLUID_HOST_ABI,
        functionName: 'batchCall',
        args: [ops],
        value: calc.value,
        chainId: CANONICAL_CHAIN.id,
      })
      if (!mountedRef.current) return
      setTxHash(streamHash)

    } catch (e: unknown) {
      if (!mountedRef.current) return
      setPhase('idle')
      logTransactionError(e, 'StreamActivateModal')
      setError(formatTransactionError(e))
    }
  }

  if (!isOpen) return null

  const txActive = phase !== 'idle'
  const done = phase === 'done' || isSuccess

  const activationSteps = [
    { label: 'Create Markee', done: phase !== 'creating' && phase !== 'idle', active: phase === 'creating' },
    { label: 'Approve Deposit', done: phase === 'streaming' || done, active: phase === 'approving' },
    { label: 'Start Stream', done: done, active: phase === 'streaming' },
  ]

  const txHeadline = done
    ? '🎉 Your Markee is live!'
    : phase === 'creating'
      ? (isPending ? 'Confirm in your wallet' : 'Creating your Markee…')
      : phase === 'approving'
        ? (isPending ? 'Confirm approval in wallet' : 'Approving the deposit…')
        : isPending
          ? 'Confirm in your wallet'
          : 'Starting your stream…'

  const txDetail = done
    ? 'Your message is live and backed by your stream.'
    : phase === 'creating'
      ? (isPending ? 'This transaction is free — it registers your message on-chain.' : 'Usually under 2 seconds on Base.')
      : phase === 'approving'
        ? 'A quick approval so the stream can pull the deposit.'
        : isPending
          ? 'Last step — sign to open your stream.'
          : 'Usually under 2 seconds on Base.'

  const btnDisabled = !isCorrectChain || !message.trim() || calc.ratePerSec <= 0n || belowMin || !minLoaded || insufficientBalance

  const footer = !txActive && boardAdmin ? (
    <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
      62% to{' '}
      <a href={`https://basescan.org/address/${boardAdmin}`} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>
        {(boardAdmin as string).slice(0, 6)}…{(boardAdmin as string).slice(-4)}
      </a>
      {' '}· 38% to the{' '}
      <a href="/own-the-network" target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>Revnet</a>
    </div>
  ) : undefined

  return (
    <ModalShell stepLabel={txActive ? txHeadline.replace(/[🎉✓]/g, '').trim().toUpperCase() : title} onClose={onClose} footer={footer}>
      {txActive ? (
        <TxProgress isSuccess={done} headline={txHeadline} detail={txDetail} steps={activationSteps} />
      ) : !isConnected ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to continue.</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
        </div>
      ) : !isCorrectChain ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to activate.</p>
          <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Switch to Base
          </button>
        </div>
      ) : (
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Message field */}
          <ModalField label={messageLabel}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={messagePlaceholder}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </ModalField>

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

          {/* Monthly rate field */}
          <ModalField label="Monthly rate (ETH)">
            <input
              inputMode="decimal"
              value={monthly}
              onChange={e => setMonthly(sanitizeDecimalInput(e.target.value))}
              placeholder={minLoaded && minMonthlyWei ? minMonthlyEth : '0.05'}
              style={inputStyle}
            />
            {belowMin && (
              <div style={{ fontFamily: MONO, fontSize: 11, color: PINK, marginTop: 6 }}>
                The minimum on this board is {minMonthlyEth} ETH / month.
              </div>
            )}
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

          {/* Fund for months */}
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

          {/* Stream summary */}
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

          {/* MARKEE estimate */}
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
            <button onClick={handleActivate} disabled={btnDisabled} style={btnStyle(true, btnDisabled)}>
              {!minLoaded ? <><Spinner /> Loading…</> : 'Activate Markee'}
            </button>
          )}

          <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
            3 quick transactions: create message, approve deposit, then your stream goes live.
          </div>

          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      )}
    </ModalShell>
  )
}
