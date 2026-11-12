'use client'

import { usePendingTxs } from '@/hooks/usePendingTxs'
import { useTrackedReceipt } from '@/hooks/useTrackedReceipt'
import type { PendingTx } from '@/lib/tx/pendingStore'
import { DismissPendingTx } from '@/components/tx/DismissPendingTx'
import { BG2, BORDER, MONO, PINK, TEXT, TEXT2 } from '@/lib/design-tokens'

function PendingTxRow({ tx }: { tx: PendingTx }) {
  const { isUnknown, explorerUrl } = useTrackedReceipt({ hash: tx.hash, chainId: tx.chainId })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: TEXT2 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: PINK, flexShrink: 0 }} />
      <span style={{ color: TEXT, minWidth: 0 }}>
        {tx.label ?? 'Transaction'} {isUnknown ? 'is unconfirmed. The network is not answering, so check it before paying again.' : 'is still confirming.'}
      </span>
      {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: PINK, fontFamily: MONO, fontSize: 12, whiteSpace: 'nowrap' }}>Basescan ↗</a>}
      <DismissPendingTx tx={tx} label="Not on Basescan? Dismiss" />
    </div>
  )
}

export function PendingTxBanner() {
  const pending = usePendingTxs()
  if (!pending.length) return null
  return (
    <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 90, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', maxWidth: 560, width: '100%', background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}>
        {pending.map(tx => <PendingTxRow key={tx.hash} tx={tx} />)}
      </div>
    </div>
  )
}
