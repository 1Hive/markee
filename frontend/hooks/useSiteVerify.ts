'use client'

import { useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { siteVerifyMessage } from '@/lib/openinternet/verify-site'

export interface SiteVerifyResult {
  verified: boolean
  verifiedUrls?: string[]
  error?: string
  // The site was never checked because the wallet could not sign as the board admin.
  unauthorized?: boolean
}

// Verifies a site for a board, signed by the connected wallet, which must be the board admin.
export function useSiteVerify() {
  const { address: owner } = useAccount()
  const { signMessageAsync } = useSignMessage()

  return useCallback(async (board: string, url: string): Promise<SiteVerifyResult> => {
    if (!owner) return { verified: false, unauthorized: true, error: "Connect this board's admin wallet to verify a site." }
    const timestamp = Math.floor(Date.now() / 1000)
    let signature: string
    try {
      signature = await signMessageAsync({ message: siteVerifyMessage(CANONICAL_CHAIN_ID, board, url, timestamp) })
    } catch {
      return { verified: false, unauthorized: true, error: 'Sign the request in your wallet to verify this site.' }
    }
    const res = await fetch('/api/openinternet/verify-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: board, url, owner, signature, timestamp }),
    })
    const body = await res.json().catch(() => null) as SiteVerifyResult | null
    return {
      verified: !!body?.verified,
      verifiedUrls: body?.verifiedUrls,
      error: body?.error ?? (res.ok ? undefined : 'Could not verify this site.'),
      unauthorized: res.status === 401 || res.status === 403,
    }
  }, [owner, signMessageAsync])
}
