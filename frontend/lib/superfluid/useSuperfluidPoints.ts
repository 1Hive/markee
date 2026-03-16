/**
 * useSuperfluidPoints
 *
 * Client-side hook for triggering Superfluid rewards events via the
 * internal API proxy routes. Never touches API keys directly.
 *
 * ── ETH-based events (BUY_MESSAGE / ADD_FUNDS) ──────────────────────────────
 * Pass `amountWei` as a BigInt string. Points are calculated server-side:
 * 1 point per 0.0001 ETH (1e14 wei), minimum 1 point.
 *
 * Usage in BuyMessageModal / TopDawgModal:
 *
 *   const { trackBuyMessage, trackAddFunds } = useSuperfluidPoints()
 *
 *   useEffect(() => {
 *     if (!isConfirmed || !receipt || !address) return
 *     trackBuyMessage(address, amountWei.toString(), receipt.transactionHash)
 *   }, [isConfirmed, receipt, address])
 *
 * ── Farcaster follow ─────────────────────────────────────────────────────────
 * Calls /api/superfluid/farcaster-follow which verifies via Neynar first.
 * Safe to call on button click — idempotent, deduped by FID.
 *
 *   const { trackFarcasterFollow } = useSuperfluidPoints()
 *   await trackFarcasterFollow(address)
 */

import { useCallback } from 'react'

type TrackResult = {
  success: boolean
  points?: number
  pushRequestId?: number
  message?: string
  alreadyClaimed?: boolean
}

// ─── ETH events ───────────────────────────────────────────────────────────────

async function postTrack(
  event: 'BUY_MESSAGE' | 'ADD_FUNDS',
  account: string,
  amountWei: string,
  txHash: string,
): Promise<TrackResult> {
  try {
    const res = await fetch('/api/superfluid/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, account, amountWei, txHash }),
    })
    return await res.json()
  } catch (e: any) {
    console.error('[useSuperfluidPoints] track error:', e)
    return { success: false, message: e.message }
  }
}

// ─── Farcaster follow ─────────────────────────────────────────────────────────

async function postFarcasterFollow(account: string): Promise<TrackResult> {
  try {
    const res = await fetch('/api/superfluid/farcaster-follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account }),
    })
    return await res.json()
  } catch (e: any) {
    console.error('[useSuperfluidPoints] farcaster-follow error:', e)
    return { success: false, message: e.message }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSuperfluidPoints() {
  /**
   * New message purchased. Pass amountWei as BigInt.toString().
   * txHash is used as uniqueId — safe to call multiple times for the same tx.
   *
   * @example
   * trackBuyMessage(address, amountWei.toString(), receipt.transactionHash)
   */
  const trackBuyMessage = useCallback(
    (account: string, amountWei: string, txHash: string) =>
      postTrack('BUY_MESSAGE', account, amountWei, txHash),
    []
  )

  /**
   * Funds added to an existing message. Pass amountWei as BigInt.toString().
   *
   * @example
   * trackAddFunds(address, amountWei.toString(), receipt.transactionHash)
   */
  const trackAddFunds = useCallback(
    (account: string, amountWei: string, txHash: string) =>
      postTrack('ADD_FUNDS', account, amountWei, txHash),
    []
  )

  /**
   * Farcaster follow (1 point, verified via Neynar, deduped by FID).
   * Safe to call on button click — will return { alreadyClaimed: true } if
   * this wallet has already received the bonus.
   *
   * @example
   * const result = await trackFarcasterFollow(address)
   * if (!result.success && !result.alreadyClaimed) {
   *   // Show "follow Markee on Farcaster first" message
   * }
   */
  const trackFarcasterFollow = useCallback(
    (account: string) => postFarcasterFollow(account),
    []
  )

  return { trackBuyMessage, trackAddFunds, trackFarcasterFollow }
}
