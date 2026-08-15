'use client'

import { useAccount } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { isAddress } from 'viem'

export function useActiveWallet() {
  // Privy's `ready` flips true once it's finished checking for a stored session -- until then,
  // `authenticated` just defaults to false, which reads identically to "genuinely logged out."
  // Consumers that want to distinguish "still checking" from "actually disconnected" (e.g. to show a
  // loading state instead of a Connect button) should gate on `privyReady`.
  const { authenticated, ready: privyReady } = usePrivy()
  const { address, isConnected } = useAccount()
  const { wallets } = useWallets()

  const rawAddress = address ?? wallets[0]?.address
  const activeAddress: `0x${string}` | undefined =
    rawAddress && isAddress(rawAddress) ? rawAddress : undefined

  const hasWallet = !!activeAddress || isConnected
  const hasActiveWalletConnection = isConnected && !!address
  const isWalletConnectionPending = authenticated && hasWallet && !hasActiveWalletConnection

  return { activeAddress, authenticated, privyReady, hasWallet, hasActiveWalletConnection, isWalletConnectionPending }
}
