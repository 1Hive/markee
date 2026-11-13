'use client'

// E2E stand-in for @privy-io/react-auth, swapped in by next.config.js when NEXT_PUBLIC_E2E=1.
// The mock wagmi connector (see privy-wagmi.tsx) is the wallet; Privy only needs to report a
// ready, logged-in session so the app treats that wallet as the user's.

import { useAccount, useDisconnect } from 'wagmi'
import type { ReactNode } from 'react'

export function PrivyProvider({ children }: { children: ReactNode; appId?: string; config?: unknown }) {
  return <>{children}</>
}

export function usePrivy() {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  return {
    ready: true,
    authenticated: !!address,
    user: address ? { id: `e2e:${address}`, wallet: { address }, linkedAccounts: [{ type: 'wallet', address }] } : null,
    getAccessToken: async (): Promise<string | null> => null,
    login: () => {},
    logout: async () => { disconnect() },
    connectWallet: () => {},
  }
}

// No session tokens here, so useWalletAuthFetch falls back to signing with the mock connector.
export function useIdentityToken() {
  return { identityToken: null as string | null }
}

export function useWallets() {
  const { address } = useAccount()
  return {
    ready: true,
    wallets: address ? [{ address, walletClientType: 'e2e', linked: true }] : [],
  }
}

export function useConnectWallet() {
  return { connectWallet: () => {} }
}

export function useFundWallet(_opts?: unknown) {
  return { fundWallet: async () => {} }
}

// The mock connector's wallets report walletClientType 'e2e', so useSponsoredWriteContract never
// routes through Privy here; this only has to exist for the import.
export function useSendTransaction() {
  return {
    sendTransaction: async (): Promise<{ hash: `0x${string}` }> => {
      throw new Error('useSendTransaction is not available in the E2E Privy stub')
    },
  }
}
