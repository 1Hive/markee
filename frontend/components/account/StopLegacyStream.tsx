'use client'

// A stream left open on a migrated board's legacy original. The board moved to a new contract and
// its message isn't shown anywhere any more, but the stream keeps paying the old board until it's
// stopped, so Stop is the only action. Used by the Buyer Hub's Stream Balance card and the Deposit
// Manager modal (/api/streaming/deposit-manager returns these as legacyStreams).

import { useEffect, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { type Address, type Hex } from 'viem'
import { useSponsoredWriteContract } from '@/hooks/useSponsoredWriteContract'
import { useTrackedReceipt } from '@/hooks/useTrackedReceipt'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { STREAMING_BASE, CFA_FORWARDER_ABI } from '@/lib/superfluid/streaming'
import { formatTransactionError, formatReceiptError } from '@/lib/transactionErrors'
import { MONO, TEXT, TEXT2, MUTED, BORDER, SANS, DANGER } from '@/lib/design-tokens'
import type { DepositManagerStream } from '@/components/modals/DepositManagerModal'
import { SECONDS_PER_MONTH, WalletPending, isUserRejection } from '@/components/account/primitives'
import { useToast } from '@/components/account/Toast'

export const LEGACY_STREAMS_NOTE = "These boards moved to new contracts, and your message isn't shown on them any more. Streams can't move, so these still pay the old board until you stop them. Bid again on the new board to put a message back up."

const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address
const ETHX = STREAMING_BASE.ethx as Address

export function StopLegacyStream({ stream, onDone, compact = false }: { stream: DepositManagerStream; onDone: () => void; compact?: boolean }) {
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync, isPending } = useSponsoredWriteContract()
  const [hash, setHash] = useState<Hex | undefined>()
  const { isLoading: confirming, isSuccess, isError: reverted, error: receiptError } = useTrackedReceipt({ hash, chainId: CANONICAL_CHAIN.id })
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const wrongChain = !!chain && chain.id !== CANONICAL_CHAIN.id

  useEffect(() => {
    if (!isSuccess) return
    toast(`Stopped your stream on ${stream.boardName}`)
    onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (reverted && hash) setError(formatReceiptError(receiptError, 'BuyerHub.StopLegacyStream.receipt'))
  }, [reverted, hash, receiptError])

  const go = async () => {
    if (wrongChain) { switchChain({ chainId: CANONICAL_CHAIN.id }); return }
    setError(null)
    try {
      setHash(await writeContractAsync({ address: CFA_FORWARDER, abi: CFA_FORWARDER_ABI, functionName: 'setFlowrate', args: [ETHX, stream.boardAddress as Address, 0n], chainId: CANONICAL_CHAIN.id }))
    } catch (e) {
      if (!isUserRejection(e)) setError(formatTransactionError(e))
    }
  }

  const busy = isPending || confirming
  return (
    <div style={{ padding: compact ? '10px 14px' : '10px 18px', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stream.boardName}</div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(Number(BigInt(stream.rateRaw) * SECONDS_PER_MONTH) / 1e18).toFixed(6)} ETHx/mo{stream.message ? ` · ${stream.message}` : ''}
          </div>
        </div>
        {busy ? <WalletPending label={isPending ? 'Confirm in wallet…' : 'Confirming…'} /> : (
          <button
            onClick={go}
            style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 14px', height: 34, fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {wrongChain ? 'Switch to Base' : 'Stop stream'}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: DANGER, marginTop: 6, textAlign: 'right' }}>{error}</div>}
    </div>
  )
}
