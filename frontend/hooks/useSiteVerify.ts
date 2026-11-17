'use client'

import { useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useWalletAuthFetch } from '@/hooks/useWalletAuthFetch'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { siteVerifyMessage } from '@/lib/openinternet/verify-site'

export interface SiteVerifyResult {
  verified: boolean
  verifiedUrls?: string[]
  error?: string
  // The site was never checked because the wallet could not sign as the board admin.
  unauthorized?: boolean
}

// Verifies a site for a board as the connected wallet, which must be the board admin. A Privy session
// for that wallet authorizes it; otherwise the wallet signs.
export function useSiteVerify() {
  const { address: owner } = useAccount()
  const walletFetch = useWalletAuthFetch()

  return useCallback(async (board: string, url: string): Promise<SiteVerifyResult> => {
    if (!owner) return { verified: false, unauthorized: true, error: "Connect this board's admin wallet to verify a site." }
    const timestamp = Math.floor(Date.now() / 1000)
    let res: Response
    try {
      res = await walletFetch('/api/openinternet/verify-url', {
        method: 'POST',
        address: owner,
        body: { address: board, url, owner, timestamp },
        message: () => siteVerifyMessage(CANONICAL_CHAIN_ID, board, url, timestamp),
      })
    } catch (err) {
      // A declined wallet prompt; anything else is a network failure for the caller to report.
      if (!/reject|denied/i.test(err instanceof Error ? err.message : '')) throw err
      return { verified: false, unauthorized: true, error: 'Sign the request in your wallet to verify this site.' }
    }
    const body = await res.json().catch(() => null) as SiteVerifyResult | null
    return {
      verified: !!body?.verified,
      verifiedUrls: body?.verifiedUrls,
      error: body?.error ?? (res.ok ? undefined : 'Could not verify this site.'),
      unauthorized: res.status === 401 || res.status === 403,
    }
  }, [owner, walletFetch])
}
