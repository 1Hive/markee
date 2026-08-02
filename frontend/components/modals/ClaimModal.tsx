'use client'

import { useState, useEffect } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { formatEther, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { usePendingMarkee } from '@/hooks/usePendingMarkee'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { estimateStreamingSettlementMarkeeTokens } from '@/lib/tokenPhases'
import {
  MONO, BG, PINK, BORDER, MUTED, TEXT2,
  btnStyle, Row, ModalShell, TxProgress, InfoTip, Spinner,
} from '@/components/modals/StreamUI'

interface ClaimModalProps {
  isOpen: boolean
  onClose: () => void
  board: Address
  onSuccess?: () => void
}

// What your stream has earned you on this board, ticking live, and the settle() call that pays it
// out. Nothing else: streams are opened in StreamModal and managed in ManageStreamModal.
export function ClaimModal({ isOpen, onClose, board, onSuccess }: ClaimModalProps) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id
  const enabled = isOpen && !!address && isCorrectChain

  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)
  const { writeContractAsync, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })

  const pending = usePendingMarkee(isOpen ? board : undefined, enabled ? address : undefined)
  const pendingEthWei = useFlowingAmount(pending.pendingWei, pending.snapshotAt, pending.ratePerSec)
  const earnedMarkee = estimateStreamingSettlementMarkeeTokens(Number(formatEther(pendingEthWei)), pending.feeBps)

  useEffect(() => {
    if (!isOpen) { setError(null); setTxHash(undefined); reset() }
  }, [isOpen, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      pending.refetch()
      const t = setTimeout(() => { onClose(); onSuccess?.() }, 2200)
      return () => clearTimeout(t)
    }
  }, [isSuccess, isOpen, onClose, onSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClaim() {
    setError(null)
    if (!address) return
    try {
      const hash = await writeContractAsync({
        address: board,
        abi: StreamingLeaderboardABI,
        functionName: 'settle',
        args: [[address]],
        chainId: CANONICAL_CHAIN.id,
      })
      setTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'ClaimModal.claim')
      setError(formatTransactionError(e))
    }
  }

  if (!isOpen) return null

  const busy = isPending || isConfirming
  const txActive = busy || isSuccess
  const stepLabel = isSuccess ? 'Done' : isPending ? 'Confirm in wallet' : isConfirming ? 'On Base' : 'Claim earnings'
  const nothingPending = pendingEthWei === 0n && !pending.accruing

  return (
    <ModalShell stepLabel={stepLabel} onClose={onClose}>
      {txActive ? (
        <TxProgress
          isSuccess={isSuccess}
          headline={isSuccess ? (pending.mintsMarkee ? '✓ MARKEE claimed' : '✓ ETH claimed') : isPending ? 'Confirm in your wallet' : 'Settling on Base'}
          detail={isSuccess
            ? (pending.mintsMarkee
                ? 'Your streamed ETH went through the RevNet and the MARKEE it minted is in your wallet.'
                : 'Your earned ETH is in your wallet.')
            : 'Usually under 2 seconds on Base.'}
        />
      ) : !isConnected ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to claim.</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
        </div>
      ) : !isCorrectChain ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} first.</p>
          <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Switch to Base
          </button>
        </div>
      ) : pending.isLoading ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: MUTED, fontFamily: MONO, fontSize: 12 }}>
          <Spinner /> Loading your earnings…
        </div>
      ) : nothingPending ? (
        <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
          <p style={{ color: TEXT2, fontSize: 15, lineHeight: 1.6 }}>
            Nothing to claim yet. Earnings accrue while your stream backs the top message on this board.
          </p>
        </div>
      ) : (
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
              {pending.mintsMarkee ? 'MARKEE earned (est.)' : 'ETH to claim'}
              {pending.mintsMarkee && (
                <InfoTip>
                  An estimate: your streamed ETH mints MARKEE through the RevNet, and the mint rate
                  falls at each RevNet stage, so claiming later can mint less than shown now.
                </InfoTip>
              )}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 26, color: PINK, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {pending.mintsMarkee
                ? earnedMarkee.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : Number(formatEther(pendingEthWei)).toFixed(6)}
            </div>
            {pending.mintsMarkee && (
              <Row label="From streamed" value={`${Number(formatEther(pendingEthWei)).toFixed(6)} ETH`} />
            )}
            {pending.mintsMarkee && pending.settledBalance > 0n && (
              <Row label="In your wallet" value={`${Number(formatEther(pending.settledBalance)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MARKEE`} />
            )}
          </div>

          {!pending.accruing && pendingEthWei > 0n && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
              Your position stopped accruing, this balance is final.
            </div>
          )}

          <button onClick={handleClaim} disabled={busy || pendingEthWei === 0n} style={btnStyle(true, busy || pendingEthWei === 0n)}>
            {pending.mintsMarkee ? 'Claim MARKEE' : 'Claim ETH'}
          </button>

          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      )}
    </ModalShell>
  )
}
