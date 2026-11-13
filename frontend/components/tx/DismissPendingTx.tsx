'use client'

import { useTrackedReceipt } from '@/hooks/useTrackedReceipt'
import { dismissPendingTx, type PendingTx } from '@/lib/tx/pendingStore'
import { AMBER, MONO } from '@/lib/design-tokens'

// The one way a user clears a pending payment the app can't resolve. Shown only once tracking has
// given up on a definite answer ('unknown'): while a payment is still confirming normally, offering
// "it never went through" would just lift the duplicate-payment guard and invite a second payment.
export function DismissPendingTx({ tx, label = 'I checked, it never went through' }: { tx: PendingTx; label?: string }) {
  const { isUnknown } = useTrackedReceipt({ hash: tx.hash, chainId: tx.chainId })
  if (!isUnknown) return null
  return (
    <button onClick={() => dismissPendingTx(tx.hash)} style={{ background: 'transparent', border: 'none', padding: 0, color: AMBER, fontFamily: MONO, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}
