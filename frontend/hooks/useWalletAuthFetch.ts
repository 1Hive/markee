'use client'

import { useCallback, useRef } from 'react'
import { useIdentityToken, usePrivy } from '@privy-io/react-auth'
import { useSignMessage } from 'wagmi'

export type WalletAuthRequest = {
  method: string
  address: string
  body: Record<string, unknown>
  message: () => string
}

const ID_TOKEN_HEADER = 'privy-id-token'
const SESSION_REQUIRED = 'SESSION_REQUIRED'

/**
 * Sends an account action authorized by the Privy session when `address` is a wallet linked to it,
 * and by a wallet signature over `message()` otherwise or when the server declines the session.
 */
export function useWalletAuthFetch() {
  const { authenticated, user, getAccessToken } = usePrivy()
  const { identityToken } = useIdentityToken()
  const identityTokenRef = useRef(identityToken)
  identityTokenRef.current = identityToken
  const { signMessageAsync } = useSignMessage()

  return useCallback(async (url: string, { method, address, body, message }: WalletAuthRequest): Promise<Response> => {
    const send = (headers: Record<string, string>, extra: Record<string, unknown> = {}) => fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, ...extra }),
    })
    const linked = authenticated && !!user?.linkedAccounts.some(account =>
      account.type === 'wallet' && account.address.toLowerCase() === address.toLowerCase())
    if (linked) {
      const accessToken = await getAccessToken().catch(() => null)
      const identityToken = identityTokenRef.current
      if (accessToken || identityToken) {
        const res = await send({
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(identityToken ? { [ID_TOKEN_HEADER]: identityToken } : {}),
        })
        const declined = res.status === 401 && (await res.clone().json().catch(() => null))?.code === SESSION_REQUIRED
        if (!declined) return res
      }
    }
    return send({}, { signature: await signMessageAsync({ message: message() }) })
  }, [authenticated, user, getAccessToken, signMessageAsync])
}
