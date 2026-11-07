'use client'

import type { WalletTimeoutState } from '@/hooks/useWalletTimeoutGuard'
import { AMBER, MONO, PINK, TEXT2 } from '@/lib/design-tokens'

export function WalletTimeoutNotice({ state, accountUrl, onAcknowledge }: { state: WalletTimeoutState; accountUrl?: string; onAcknowledge: () => void }) {
  if (state === 'clear') return null
  return (
    <div style={{ border: `1px solid ${AMBER}`, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: TEXT2, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>
        {state === 'sent'
          ? 'A transaction just left your wallet. It may be this payment, so check it before paying again.'
          : 'Your wallet did not answer in time. If its request is still open, approving it will still send this payment. Reject or approve it in your wallet before trying again.'}
      </span>
      <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {accountUrl && <a href={accountUrl} target="_blank" rel="noreferrer" style={{ color: PINK, fontFamily: MONO, fontSize: 12 }}>Check on Basescan ↗</a>}
        <button onClick={onAcknowledge} style={{ background: 'transparent', border: 'none', padding: 0, color: AMBER, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>
          {state === 'sent' ? 'I checked, nothing was paid' : 'I closed it in my wallet'}
        </button>
      </span>
    </div>
  )
}
