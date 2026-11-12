'use client'

import { removePendingTx, type PendingTx } from '@/lib/tx/pendingStore'
import { getTxUrl } from '@/lib/explorer'
import { AMBER, MONO, PINK, TEXT2 } from '@/lib/design-tokens'

export const PENDING_PAYMENT_REASON = 'A payment from this wallet is still confirming'

export function PendingPaymentNotice({ pending }: { pending: PendingTx[] }) {
  if (!pending.length) return null
  const tx = pending[pending.length - 1]
  return (
    <div style={{ border: `1px solid ${AMBER}`, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: TEXT2, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>A payment from this wallet is still confirming. Wait for it to finish before paying again.</span>
      <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <a href={getTxUrl(tx.chainId, tx.hash)} target="_blank" rel="noreferrer" style={{ color: PINK, fontFamily: MONO, fontSize: 12 }}>Check on Basescan ↗</a>
        {/* The app never decides on its own that a payment was dropped (see lib/tx/receiptOutcome.ts),
            so this is the way out when one really didn't go through. */}
        <button onClick={() => removePendingTx(tx.hash)} style={{ background: 'transparent', border: 'none', padding: 0, color: AMBER, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>
          I checked, it never went through
        </button>
      </span>
    </div>
  )
}
