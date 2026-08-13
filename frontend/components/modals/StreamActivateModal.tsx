'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAccount, useBalance, useReadContract, useSwitchChain } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { monthlyToRatePerSec, bufferFor, openStreamValue } from '@/lib/superfluid/streaming'
import {
  MONO, BG, BG2, BLUE, PINK, BORDER, MUTED, TEXT, TEXT2,
  inputStyle, parseEthInput, retryUntilLoaded,
  InfoTip, ModalField, ModalShell, TxProgress, RatePriceCard,
} from '@/components/modals/StreamUI'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useCreateStreamFlow } from '@/hooks/useCreateStreamFlow'
import { ConnectButton } from '@/components/wallet/ConnectButton'

const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const FAST_TX_GAS_RESERVE = BigInt('200000000000000') // 0.0002 ETH

interface StreamActivateModalProps {
  isOpen: boolean
  onClose: () => void
  board: Address
  topMonthlyWei?: bigint
  onSuccess?: () => void
  title?: string
  messageLabel?: string
  messagePlaceholder?: string
  ctaLabel?: string
}

type StreamSuccessSnap = { tookTop: boolean; additionalMonthlyWei: bigint | null; isFirstOnBoard: boolean }

export function StreamActivateModal({
  isOpen,
  onClose,
  board,
  topMonthlyWei,
  onSuccess,
  title = 'ACTIVATE MARKEE',
  messageLabel = 'SET FIRST MESSAGE',
  messagePlaceholder = 'Your message here...',
  ctaLabel = 'Activate Markee',
}: StreamActivateModalProps) {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState('')
  const [monthly, setMonthly] = useState('')
  const [fundMonths, setFundMonths] = useState('1')
  const [lastPreset, setLastPreset] = useState<'min' | 'max' | 'win' | null>(null)
  const [successSnap, setSuccessSnap] = useState<StreamSuccessSnap | null>(null)

  const { phase, error, setError, isPending, isConfirming, isSuccess, activate } = useCreateStreamFlow(board, isOpen)

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
  const { data: maxMessageLength } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'maxMessageLength', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const maxLen = Number(maxMessageLength || 223)

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

  // ── Reset on close (UI-only state; the hook resets its own tx state) ───────
  useEffect(() => {
    if (!isOpen) {
      setMessage(''); setMonthly(''); setFundMonths('1')
      setLastPreset(null); setSuccessSnap(null)
    }
  }, [isOpen])

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
      const isFirstOnBoard = !topMonthlyWei || topMonthlyWei === 0n
      const tookTop = isFirstOnBoard || calc.monthlyWei > topMonthlyWei
      const additionalMonthlyWei = !tookTop && topMonthlyWei ? topMonthlyWei + 1n - calc.monthlyWei : null
      setSuccessSnap({ tookTop, additionalMonthlyWei, isFirstOnBoard })
      const t = setTimeout(() => { onClose(); onSuccess?.() }, 2200)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isOpen, onClose, onSuccess])

  const handleActivate = () => activate(message, calc, { maxLen, belowMin, minMonthlyEth })

  if (!isOpen) return null

  const txActive = phase !== 'idle'
  const done = phase === 'done' || isSuccess

  const activationSteps = [
    { label: 'Create Markee Message', done: phase !== 'creating' && phase !== 'idle', active: phase === 'creating' },
    { label: 'Approve Deposit', done: phase === 'streaming' || done, active: phase === 'approving' },
    { label: 'Start Stream', done: done, active: phase === 'streaming' },
  ]

  const txHeadline = done
    ? (successSnap?.isFirstOnBoard ? 'Success! Your Markee is Activated' :
       successSnap?.tookTop ? 'Success! Your message is now featured' :
       'Success! Your message is created')
    : phase === 'creating'
      ? (isPending ? 'Confirm in your wallet' : 'Creating your Markee…')
      : phase === 'approving'
        ? (isPending ? 'Confirm approval in wallet' : 'Approving the deposit…')
        : isPending
          ? 'Confirm in your wallet'
          : 'Starting your stream…'

  const txDetail = done
    ? (successSnap?.isFirstOnBoard ? 'You\'re the first on this leaderboard!' :
       successSnap?.tookTop ? 'Your stream is active and your message is featured at #1.' :
       successSnap?.additionalMonthlyWei
         ? `Stream ${parseFloat(formatEther(successSnap.additionalMonthlyWei)).toFixed(4)} ETH/mo more to take the #1 spot.`
         : 'Your stream is active on the leaderboard.')
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
            62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
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
          {!minLoaded ? 'Loading…' : ctaLabel}
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
              onChange={e => { if (e.target.value.length <= maxLen) setMessage(e.target.value) }}
              placeholder={messagePlaceholder}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 4, fontFamily: MONO }}>
              {message.length}/{maxLen}
            </div>
          </ModalField>

          {/* Price card */}
          <RatePriceCard
            monthly={monthly} setMonthly={setMonthly}
            fundMonths={fundMonths} setFundMonths={setFundMonths}
            minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded} belowMin={belowMin}
            ethPrice={ethPrice} balanceData={balanceData} spendableBalance={spendableBalance}
            calc={calc} topMonthlyWei={topMonthlyWei}
            lastPreset={lastPreset} setLastPreset={setLastPreset}
          />

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
