/**
 * useSuperfluidPoints
 *
 * Lightweight client-side hook for triggering Superfluid rewards events
 * via the internal /api/superfluid/track proxy.
 *
 * Usage in BuyMessageModal / TopDawgModal:
 *
 *   const { trackBuyMessage, trackAddFunds, trackFarcasterFollow } = useSuperfluidPoints()
 *
 *   useEffect(() => {
 *     if (!isConfirmed || !receipt || !address) return
 *     trackBuyMessage(address, receipt.transactionHash)
 *   }, [isConfirmed, receipt, address])
 */

import { useCallback } from 'react'

type TrackResult = {
  success: boolean
  pushRequestId?: number
  message?: string
}

async function post(
  event: string,
  account: string,
  txHash?: string,
  pointsOverride?: number,
): Promise<TrackResult> {
  try {
    const res = await fetch('/api/superfluid/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, account, txHash, pointsOverride }),
    })
    return await res.json()
  } catch (e: any) {
    console.error('[useSuperfluidPoints] fetch error:', e)
    return { success: false, message: e.message }
  }
}

export function useSuperfluidPoints() {
  /**
   * New message purchased on the Superfluid Markee.
   * txHash is used as uniqueId — safe to call multiple times for same tx.
   */
  const trackBuyMessage = useCallback(
    (account: string, txHash: string, pointsOverride?: number) =>
      post('BUY_MESSAGE', account, txHash, pointsOverride),
    []
  )

  /**
   * Funds added to an existing message.
   * txHash is used as uniqueId — safe to call multiple times for same tx.
   */
  const trackAddFunds = useCallback(
    (account: string, txHash: string, pointsOverride?: number) =>
      post('ADD_FUNDS', account, txHash, pointsOverride),
    []
  )

  /**
   * Farcaster follow (small one-time bonus).
   * No txHash — dedup is handled server-side via KV if needed.
   */
  const trackFarcasterFollow = useCallback(
    (account: string) => post('FARCASTER_FOLLOW', account),
    []
  )

  return { trackBuyMessage, trackAddFunds, trackFarcasterFollow }
}
