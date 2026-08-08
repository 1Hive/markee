'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, formatEther, decodeEventLog, type Address, type Hex } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE, SUPERFLUID_HOST_ABI, CFA_AGREEMENT_ID, GDA_AGREEMENT_ID,
  CFA_FORWARDER_ABI, monthlyToRatePerSec, bufferFor, openStreamValue, buildOpenStreamOps,
} from '@/lib/superfluid/streaming'
import {
  MONO, BG, BG2, BLUE, PINK, BORDER, MUTED, TEXT, TEXT2,
  inputStyle, sanitizeDecimalInput, parseEthInput, retryUntilLoaded,
  InfoTip, ModalField, ModalShell, TxProgress, TxSteps,
} from '@/components/modals/StreamUI'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { ConnectButton } from '@/components/wallet/ConnectButton'

const ETHX = STREAMING_BASE.ethx as Address
const HOST = STREAMING_BASE.host as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

const FAST_TX_GAS_RESERVE = BigInt('200000000000000') // 0.0002 ETH
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// createMarkee sets up the pool in the same tx, but the RPC node may not reflect
// it immediately after confirmation. Poll until non-zero before proceeding (up to ~18s).
async function waitForPool(
  readFn: (markeeAddress: Address) => Promise<unknown>,
  markeeAddress: Address,
): Promise<Address> {
  for (let i = 0; i < 12; i++) {
    if (i > 0) await new Promise<void>(r => setTimeout(r, 1500))
    const pool = await readFn(markeeAddress) as Address
    if (pool && pool.toLowerCase() !== ZERO_ADDRESS) return pool
  }
  throw new Error('Pool not ready after 18 s — please try again.')
}

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
  messagePlaceholder = 'Your message here...',
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
  const [lastPreset, setLastPreset] = useState<'min' | 'max' | null>(null)

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
  const markeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Number(formatEther(calc.monthlyWei)))

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setMessage(''); setMonthly(''); setFundMonths('1')
      setPhase('idle'); setError(null); setTxHash(undefined); reset()
      setLastPreset(null)
    }
  }, [isOpen, reset])

  // ── Initialize to minimum rate when it loads ──────────────────────────────
  useEffect(() => {
    if (minMonthlyWei && !monthly) {
      setMonthly(minMonthlyEth)
      setLastPreset('min')
    }
  }, [minMonthlyWei]) // eslint-disable-line

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
      // Guard: CFA createFlow fails if the backer already has an active stream to this board.
      // Check before tx1 so we don't create an orphan Markee that can never be activated.
      const existingRate = await publicClient.readContract({
        address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI,
        functionName: 'getFlowrate', args: [ETHX, address, board],
      }) as bigint
      if (existingRate > 0n) {
        setError('You already have an active stream to this board. Stop it first, then activate your new Markee.')
        return
      }

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

      // Read stable Superfluid addresses and allowance, then poll for pool
      // (pool is created inside createMarkee but RPC may lag behind chain state)
      const [cfaAgreement, gdaAgreement, currentAllowance] = await Promise.all([
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID] }),
        publicClient.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [GDA_AGREEMENT_ID] }),
        publicClient.readContract({ address: ETHX, abi: erc20Abi, functionName: 'allowance', args: [address, board] }),
      ])
      if (!mountedRef.current) return

      const pool = await waitForPool(
        (addr) => publicClient.readContract({ address: board, abi: StreamingLeaderboardABI, functionName: 'poolOf', args: [addr] }),
        markeeAddress,
      )
      if (!mountedRef.current) return

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
    { label: 'Create Markee Message', done: phase !== 'creating' && phase !== 'idle', active: phase === 'creating' },
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

  const btnDisabled = !isCorrectChain || !message.trim() || calc.ratePerSec <= 0n || belowMin || !minLoaded

  const footer = !txActive ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        62/38 split
        {boardAdmin && (
          <InfoTip>
            62% to the sign&apos;s Beneficiary / 38% to the Revnet, issuing MARKEE for you
          </InfoTip>
        )}
      </div>
      {insufficientBalance && authenticated && address ? (
        <button
          onClick={() => fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount: formatEther(calc.value) } })}
          style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
        >
          Add funds
        </button>
      ) : (
        <button
          onClick={handleActivate}
          disabled={btnDisabled}
          style={{
            background: PINK, color: BG, border: 'none', borderRadius: 8,
            padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
            cursor: btnDisabled ? 'not-allowed' : 'pointer', flexShrink: 0,
            opacity: btnDisabled ? 0.4 : 1, transition: 'opacity 140ms',
          }}
        >
          {!minLoaded ? 'Loading…' : 'Activate Markee'}
        </button>
      )}
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

          {/* Price card */}
          <div style={{
            border: `1.5px solid ${PINK}`,
            borderRadius: 12,
            padding: '14px 16px',
            background: BG,
            boxShadow: '0 0 24px rgba(248,151,254,0.08)',
          }}>
            {/* Number + unit inline on left, MIN/MAX on right */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <input
                  inputMode="decimal"
                  value={monthly}
                  onChange={e => { setMonthly(sanitizeDecimalInput(e.target.value)); setLastPreset(null) }}
                  placeholder={minLoaded && minMonthlyWei ? minMonthlyEth : '0.001'}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: TEXT, fontFamily: MONO, fontSize: 26, fontWeight: 800,
                    padding: 0,
                    width: `${Math.max(5, (monthly || (minLoaded && minMonthlyWei ? minMonthlyEth : '0.001')).length + 0.5)}ch`,
                  }}
                />
                <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETH/mo</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { if (minMonthlyWei) { setMonthly(minMonthlyEth); setLastPreset('min') } }}
                  disabled={!minLoaded}
                  style={{
                    border: `1px solid ${lastPreset === 'min' ? PINK : BORDER}`,
                    background: 'transparent',
                    color: lastPreset === 'min' ? PINK : TEXT2,
                    borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                    fontWeight: 700, cursor: minLoaded ? 'pointer' : 'default',
                    opacity: minLoaded ? 1 : 0.4,
                    transition: 'border-color 120ms, color 120ms',
                  }}
                >
                  MIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const months = BigInt(Math.max(1, Number(fundMonths) || 1))
                    if (spendableBalance > 0n) { setMonthly(formatEther(spendableBalance / months)); setLastPreset('max') }
                  }}
                  disabled={spendableBalance <= 0n}
                  style={{
                    border: `1px solid ${lastPreset === 'max' ? PINK : BORDER}`,
                    background: 'transparent',
                    color: lastPreset === 'max' ? PINK : TEXT2,
                    borderRadius: 6, padding: '4px 11px', fontFamily: MONO, fontSize: 11,
                    fontWeight: 700, cursor: spendableBalance > 0n ? 'pointer' : 'default',
                    opacity: spendableBalance > 0n ? 1 : 0.4,
                    transition: 'border-color 120ms, color 120ms',
                  }}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* USD equiv + balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 12, color: MUTED, marginBottom: 12 }}>
              <span>
                {belowMin
                  ? `Min: ${minMonthlyEth} ETH/mo`
                  : calc.monthlyWei > 0n && ethPrice
                    ? `≈ ${formatUsd(Number(formatEther(calc.monthlyWei)) * ethPrice)}/mo`
                    : ' '}
              </span>
              <span>
                {balanceData ? `Balance ${parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH` : ''}
              </span>
            </div>

            {/* Month duration pills */}
            <div style={{ display: 'flex', gap: 8 }}>
              {(['1', '2', '3'] as const).map(mo => {
                const sel = fundMonths === mo
                return (
                  <button
                    key={mo}
                    type="button"
                    onClick={() => setFundMonths(mo)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${sel ? PINK : BORDER}`,
                      background: sel ? PINK : 'transparent',
                      color: sel ? BG : TEXT2,
                      fontFamily: MONO, fontSize: 13, fontWeight: 700,
                      transition: 'border-color 140ms, background 140ms, color 140ms',
                    }}
                  >
                    {mo} mo
                  </button>
                )
              })}
            </div>

            {/* ETH total */}
            {calc.prefund > 0n && (
              <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 12 }}>
                <span style={{ color: TEXT, fontWeight: 700 }}>{parseFloat(formatEther(calc.value)).toFixed(4)} ETH</span>
                <span style={{ color: MUTED }}> total</span>
              </div>
            )}
          </div>

          {/* You'll receive — horizontal */}
          {calc.monthlyWei > 0n && (
            <div style={{
              borderRadius: 14, padding: '14px 20px',
              background: 'linear-gradient(135deg, rgba(248,151,254,0.16), rgba(123,106,244,0.16))',
              border: `1px solid rgba(248,151,254,0.35)`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ color: PINK, fontSize: 14, fontWeight: 600, fontFamily: 'Manrope, system-ui, sans-serif' }}>You&apos;ll receive</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ color: PINK, fontFamily: 'Manrope, system-ui, sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: -0.5 }}>
                  {markeeEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span style={{ color: PINK, fontSize: 13, fontWeight: 700 }}>MARKEE/mo</span>
              </div>
            </div>
          )}

          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      )}
    </ModalShell>
  )
}
