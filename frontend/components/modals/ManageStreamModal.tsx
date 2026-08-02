'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi, formatEther, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import {
  STREAMING_BASE,
  CFA_FORWARDER_ABI,
  ETHX_WRAP_ABI,
  ratePerSecToMonthly,
  runwaySeconds,
} from '@/lib/superfluid/streaming'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import {
  MONO, BG, PINK, BORDER, MUTED, TEXT2,
  inputStyle, btnStyle, sanitizeDecimalInput, parseEthInput, retryUntilLoaded,
  Spinner, ModalField, Row, ModalShell, TxProgress,
} from '@/components/modals/StreamUI'

const ETHX = STREAMING_BASE.ethx as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

interface ManageStreamModalProps {
  isOpen: boolean
  onClose: () => void
  board: Address
  onSuccess?: () => void
}

// Housekeeping for the stream you already run on a board: top up its funding, stop it, and get the
// deposit back once it is stopped. Opening/rate changes live in StreamModal, claiming in ClaimModal.
export function ManageStreamModal({ isOpen, onClose, board, onSuccess }: ManageStreamModalProps) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id
  const enabled = isOpen && !!address && isCorrectChain

  const [topUp, setTopUp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<'stop' | 'withdraw' | 'topup'>('topup')
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)
  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address, chainId: CANONICAL_CHAIN.id })

  const { data: currentRate, refetch: refetchRate } = useReadContract({
    address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate', args: address ? [ETHX, address, board] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  const { data: deposit, refetch: refetchDeposit } = useReadContract({
    address: board, abi: StreamingLeaderboardABI, functionName: 'backerDeposit', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })
  // SuperToken balanceOf is the available balance (already net of the locked CFA buffer), so this is
  // exactly what the stream has left to drain before Superfluid liquidates it.
  const { data: ethxBalance, refetch: refetchEthx } = useReadContract({
    address: ETHX, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: CANONICAL_CHAIN.id,
    query: { enabled, refetchInterval: retryUntilLoaded },
  })

  const live = useMemo(() => {
    const rate = currentRate && currentRate > 0n ? currentRate : 0n
    const balance = ethxBalance ?? 0n
    const runwayDays = rate > 0n ? Number(runwaySeconds(balance, rate)) / 86400 : 0
    const topUpWei = parseEthInput(topUp)
    return { rate, runwayDays, topUpWei }
  }, [currentRate, ethxBalance, topUp])

  const streaming = live.rate > 0n
  const lowRunway = streaming && live.runwayDays < 7
  const hasDeposit = (deposit ?? 0n) > 0n
  const positionLoading = enabled && (currentRate === undefined || deposit === undefined || ethxBalance === undefined)

  useEffect(() => {
    if (!isOpen) {
      setTopUp(''); setError(null); setTxHash(undefined); reset()
    }
  }, [isOpen, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      refetchRate(); refetchDeposit(); refetchEthx(); refetchBalance()
      const t = setTimeout(() => { onClose(); onSuccess?.() }, 2200)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isOpen, onClose, onSuccess, refetchRate, refetchDeposit, refetchEthx, refetchBalance])

  async function handleTopUp() {
    setError(null)
    if (live.topUpWei <= 0n) { setError('Enter an amount to add.'); return }
    if (balanceData && balanceData.value < live.topUpWei) { setError('Not enough ETH in your wallet.'); return }
    try {
      setAction('topup')
      const hash = await writeContractAsync({
        address: ETHX,
        abi: ETHX_WRAP_ABI,
        functionName: 'upgradeByETH',
        value: live.topUpWei,
        chainId: CANONICAL_CHAIN.id,
      })
      setTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'ManageStreamModal.topUp')
      setError(formatTransactionError(e))
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
      logTransactionError(e, 'ManageStreamModal.stopStream')
      setError(formatTransactionError(e))
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
      logTransactionError(e, 'ManageStreamModal.withdrawDeposit')
      setError(formatTransactionError(e))
    }
  }

  if (!isOpen) return null

  const busy = isPending || isConfirming
  const txActive = busy || isSuccess
  const stepLabel = isSuccess ? 'Done' : isPending ? 'Confirm in wallet' : isConfirming ? 'On Base' : 'Manage stream'
  const currentMonthlyEth = streaming ? formatEther(ratePerSecToMonthly(live.rate)) : '0'

  return (
    <ModalShell stepLabel={stepLabel} onClose={onClose}>
      {txActive ? (
        <TxProgress
          isSuccess={isSuccess}
          headline={isSuccess
            ? (action === 'stop' ? '✓ Stream stopped' : action === 'withdraw' ? '✓ Deposit withdrawn' : '✓ Funding topped up')
            : isPending ? 'Confirm in your wallet' : 'Settling on Base'}
          detail={isSuccess
            ? (action === 'stop'
                ? 'Your stream is closed. Your deposit is now withdrawable.'
                : action === 'withdraw'
                  ? 'Your deposit is back in your wallet.'
                  : 'Your stream now runs longer before it needs funding again.')
            : 'Usually under 2 seconds on Base.'}
        />
      ) : !isConnected ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to manage your stream.</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
        </div>
      ) : !isCorrectChain ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} first.</p>
          <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Switch to Base
          </button>
        </div>
      ) : positionLoading ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: MUTED, fontFamily: MONO, fontSize: 12 }}>
          <Spinner /> Loading your stream…
        </div>
      ) : !streaming && !hasDeposit ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.6 }}>
            No stream to manage on this board. Pick a message and start streaming to back it.
          </p>
        </div>
      ) : (
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Your stream" value={streaming ? `${currentMonthlyEth} ETH / mo` : 'Stopped'} />
            <Row
              label="Funding left"
              value={`${Number(formatEther(ethxBalance ?? 0n)).toFixed(6)} ETH`}
              info="Held as ETHx, Superfluid's streamable wrapper for ETH. It streams out at your rate; add more below any time."
            />
            <Row label="Runs for" value={streaming ? `~${live.runwayDays.toFixed(1)} days` : '—'} bold={lowRunway} />
            <Row
              label="Deposit held"
              value={`${deposit ? formatEther(deposit) : '0'} ETH`}
              info="A security deposit Superfluid requires while a stream runs. It is returned in full after you stop the stream."
            />
          </div>

          {lowRunway && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: PINK, lineHeight: 1.5 }}>
              Your funding runs out in ~{live.runwayDays.toFixed(1)} days. If it runs dry the stream is
              force-closed and part of your deposit is lost, so top up to keep it running.
            </div>
          )}

          {streaming && (
            <>
              <ModalField label="Add funding (ETH)">
                <input
                  inputMode="decimal"
                  value={topUp}
                  onChange={e => setTopUp(sanitizeDecimalInput(e.target.value))}
                  placeholder="0.05"
                  style={inputStyle}
                />
              </ModalField>
              <button onClick={handleTopUp} disabled={busy || live.topUpWei === 0n} style={btnStyle(true, busy || live.topUpWei === 0n)}>
                Add funding
              </button>

              <button onClick={handleStopStream} disabled={busy} style={btnStyle(false, busy)}>Stop stream</button>
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Stopping ends your backing and frees your deposit for withdrawal.
              </div>
            </>
          )}

          {!streaming && hasDeposit && (
            <>
              <button onClick={handleWithdrawDeposit} disabled={busy} style={btnStyle(true, busy)}>
                Withdraw deposit
              </button>
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Your stream is stopped, so the full deposit comes back to your wallet.
              </div>
            </>
          )}

          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      )}
    </ModalShell>
  )
}
