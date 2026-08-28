'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAccount, useBalance, useReadContract, useSwitchChain } from 'wagmi'
import { formatEther, erc20Abi, type Address } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { monthlyToRatePerSec, bufferFor, computeAutoDeposit, roundUpToNearestThousandth, STREAMING_BASE, DISPLAY_DUST_WEI, formatRunwayShort } from '@/lib/superfluid/streaming'
import {
  MONO, BG, BG2, BLUE, PINK, BORDER, MUTED, TEXT, TEXT2,
  messageBoxStyle, inputStyle, parseEthInput, retryUntilLoaded,
  InfoTip, ModalField, ModalShell, TxProgress, RatePriceCard,
  PaymentReviewCard, PaymentReviewFooter,
} from '@/components/modals/StreamUI'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { formatUsd } from '@/lib/utils'
import { useEthPrice } from '@/hooks/useEthPrice'
import { useCreateStreamFlow } from '@/hooks/useCreateStreamFlow'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { DepositManagerModal } from '@/components/modals/DepositManagerModal'

const ETHX = STREAMING_BASE.ethx as Address

const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

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
  const { chain } = useAccount()
  // wagmi's own useAccount().address can lag or miss Privy-embedded wallets entirely -- this pulls
  // in Privy's own wallet list as a fallback (same pattern StreamSignModal/DepositManagerModal use),
  // which is what was causing the ETH balance read below to silently come back empty/stale and the
  // auto-deposit to compute a 0 wrap amount even for wallets that do hold ETH.
  const { activeAddress, hasWallet, hasActiveWalletConnection } = useActiveWallet()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [monthly, setMonthly] = useState('')
  const [lastPreset, setLastPreset] = useState<'min' | 'win' | null>(null)
  const [successSnap, setSuccessSnap] = useState<StreamSuccessSnap | null>(null)
  const [depositManagerOpen, setDepositManagerOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  const { phase, error, setError, isPending, isConfirming, isSuccess, activate } = useCreateStreamFlow(board, isOpen)

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address: activeAddress as Address | undefined, chainId: CANONICAL_CHAIN.id })
  const { fundWallet } = useFundWallet({ onUserExited: () => refetchBalance() })

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
  const { data: maxNameLength } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'maxNameLength', chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen },
  })
  const maxLen = Number(maxMessageLength || 223)
  const maxNameLen = Number(maxNameLength || 32)
  const { data: ethxBalance } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'balanceOf', args: activeAddress ? [activeAddress] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled: isOpen && !!activeAddress, refetchInterval: retryUntilLoaded },
  })

  const minLoaded = minMonthlyWei !== undefined
  // Rounded up to the nearest 0.001 ETH for display/MIN-preset purposes -- the raw on-chain minimum
  // is sometimes deliberately a hair under a round number (see monthlyToRatePerSec), which would
  // otherwise show up as an ugly "0.000999999997884" placeholder.
  const minMonthlyEth = minMonthlyWei ? formatEther(roundUpToNearestThousandth(minMonthlyWei)) : '0'

  // ── Amount derivations ────────────────────────────────────────────────────
  // calc.value is what actually gets wrapped fresh this tx (0 when the wallet's existing ETHx
  // balance already covers the rate's buffer + a healthy runway) -- replaces the old flat
  // 1/2/3-month picker.
  const calc = useMemo(() => {
    const monthlyWei = parseEthInput(monthly)
    const ratePerSec = monthlyToRatePerSec(monthlyWei, minMonthlyWei)
    const buffer = bufferFor(ratePerSec)
    const auto = computeAutoDeposit(ethxBalance ?? 0n, ratePerSec, balanceData?.value ?? 0n)
    return { monthlyWei, ratePerSec, buffer, prefund: auto.prefund, value: auto.wrapValue, runwaySecs: auto.runwaySeconds }
  }, [monthly, ethxBalance, balanceData?.value, minMonthlyWei])

  const belowMin = calc.monthlyWei > 0n && !!minMonthlyWei && calc.monthlyWei < minMonthlyWei
  const insufficientBalance = !!balanceData && calc.value > 0n && balanceData.value < calc.value
  const markeeEarned = estimateLeaderboardPurchaseMarkeeTokens(Number(formatEther(calc.monthlyWei)))

  // Review-step prediction -- same formula the post-success snap below uses (isFirstOnBoard ||
  // calc.monthlyWei > topMonthlyWei), just evaluated before submitting instead of after.
  const willWin = !topMonthlyWei || topMonthlyWei === 0n || calc.monthlyWei > topMonthlyWei
  const shortfallWei = !willWin && topMonthlyWei ? topMonthlyWei + 1n - calc.monthlyWei : 0n
  const minToWinLabel = shortfallWei > 0n ? `${parseFloat(formatEther(shortfallWei)).toFixed(4)} ETH/mo` : null

  // ── Reset on close (UI-only state; the hook resets its own tx state) ───────
  useEffect(() => {
    if (!isOpen) {
      setMessage(''); setName(''); setMonthly('')
      setLastPreset(null); setSuccessSnap(null); setReviewOpen(false)
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
  // Held in a ref: the board page re-renders ~10x/sec (useFlowingAmount tick) with fresh inline
  // callbacks, and depending on them would clear the close timer every tick so it never fires.
  const closeRef = useRef({ onClose, onSuccess })
  closeRef.current = { onClose, onSuccess }
  useEffect(() => {
    if (isSuccess && isOpen) {
      const isFirstOnBoard = !topMonthlyWei || topMonthlyWei === 0n
      const tookTop = isFirstOnBoard || calc.monthlyWei > topMonthlyWei
      const additionalMonthlyWei = !tookTop && topMonthlyWei ? topMonthlyWei + 1n - calc.monthlyWei : null
      setSuccessSnap({ tookTop, additionalMonthlyWei, isFirstOnBoard })
      const t = setTimeout(() => { closeRef.current.onClose(); closeRef.current.onSuccess?.() }, 2200)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, isOpen])

  const handleActivate = () => activate(message, calc, { maxLen, belowMin, minMonthlyEth }, name.trim())

  if (!isOpen) return null

  const txActive = phase !== 'idle'
  const done = phase === 'done' || isSuccess

  const activationSteps = [
    { label: 'Create Markee Message', done: phase !== 'creating' && phase !== 'idle', active: phase === 'creating' },
    { label: 'Approve Deposit', done: phase === 'streaming' || done, active: phase === 'approving' },
    { label: calc.value > DISPLAY_DUST_WEI ? 'Deposit ETH & Start Stream' : 'Start Stream', done: done, active: phase === 'streaming' },
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

  // Guards the race where clicking Activate before the wallet ETH / ETHx balance reads resolve
  // would compute the auto-deposit off a 0 fallback (looks identical to "not enough ETH", surfacing
  // as "Fund the stream for longer" even for a wallet that genuinely holds ETH).
  const balancesLoaded = balanceData !== undefined && ethxBalance !== undefined
  const btnDisabled = !isCorrectChain || !message.trim() || calc.ratePerSec <= 0n || belowMin || !minLoaded || !balancesLoaded

  const footer = !txActive ? (
    reviewOpen ? (
      <PaymentReviewFooter
        onBack={() => setReviewOpen(false)}
        onConfirm={handleActivate}
        busy={isPending || isConfirming}
        error={error}
      />
    ) : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
        62/38 split
        {boardAdmin && (
          <InfoTip>
            62% to the sign&apos;s beneficiary<br />38% to Markee&apos;s Revnet<br />Your MARKEE is issued by the Revnet
          </InfoTip>
        )}
      </div>
      {insufficientBalance && authenticated && activeAddress ? (
        <button
          onClick={() => fundWallet({ address: activeAddress, options: { chain: CANONICAL_CHAIN, amount: formatEther(calc.value) } })}
          style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
        >
          Add funds
        </button>
      ) : (
        <button
          onClick={() => setReviewOpen(true)}
          disabled={btnDisabled}
          style={{
            background: PINK, color: BG, border: 'none', borderRadius: 8,
            padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
            cursor: btnDisabled ? 'not-allowed' : 'pointer', flexShrink: 0,
            opacity: btnDisabled ? 0.4 : 1, transition: 'opacity 140ms',
          }}
        >
          {!minLoaded || !balancesLoaded ? 'Loading…' : 'Review Payment Info'}
        </button>
      )}
    </div>
    )
  ) : undefined

  return (
    <>
    <ModalShell stepLabel={txActive ? txHeadline.replace(/[🎉✓]/g, '').trim().toUpperCase() : title} onClose={onClose} footer={footer}>
      {txActive ? (
        <TxProgress isSuccess={done} headline={txHeadline} detail={txDetail} steps={activationSteps} />
      ) : !hasActiveWalletConnection ? (
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
      ) : reviewOpen ? (
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1 }}>
          <PaymentReviewCard
            kind="rent"
            message={message}
            amountLabel={`${monthly || '0'} ETH/mo`}
            amountUsd={ethPrice && calc.monthlyWei > 0n ? formatUsd(Number(formatEther(calc.monthlyWei)) * ethPrice) : null}
            depositLabel={calc.value > DISPLAY_DUST_WEI ? `${parseFloat(formatEther(calc.value)).toFixed(4)} ETH` : null}
            runwayLabel={formatRunwayShort(calc.runwaySecs)}
            markeeEarnedLabel={`${markeeEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })} MARKEE/mo`}
            willWin={willWin}
            minToWinLabel={minToWinLabel}
          />
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
              style={{ ...messageBoxStyle, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 4, fontFamily: MONO }}>
              {message.length}/{maxLen}
            </div>
          </ModalField>

          {/* Your Name (optional) */}
          <ModalField label="Your Name (optional)">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value.slice(0, maxNameLen))}
              placeholder="tell the world who wrote this..."
              style={inputStyle}
            />
          </ModalField>

          {/* Price card */}
          <RatePriceCard
            monthly={monthly} setMonthly={setMonthly}
            minMonthlyWei={minMonthlyWei} minMonthlyEth={minMonthlyEth} minLoaded={minLoaded} belowMin={belowMin}
            ethPrice={ethPrice} ethxBalance={ethxBalance} walletEthBalance={balanceData?.value}
            calc={calc} topMonthlyWei={topMonthlyWei}
            lastPreset={lastPreset} setLastPreset={setLastPreset}
            runwaySecs={calc.runwaySecs} onOpenDepositManager={() => setDepositManagerOpen(true)}
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
    <DepositManagerModal isOpen={depositManagerOpen} onClose={() => setDepositManagerOpen(false)} />
    </>
  )
}
