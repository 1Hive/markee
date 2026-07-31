'use client'

import { useAccount } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { isAddress } from 'viem'

export function useActiveWallet() {
  const { authenticated } = usePrivy()
  const { address, isConnected } = useAccount()
  const { wallets } = useWallets()

  const rawAddress = address ?? wallets[0]?.address
  const activeAddress: `0x${string}` | undefined =
    rawAddress && isAddress(rawAddress) ? rawAddress : undefined

  const hasWallet = !!activeAddress || isConnected
  const hasActiveWalletConnection = isConnected && !!address
  const isWalletConnectionPending = authenticated && hasWallet && !hasActiveWalletConnection

  return { activeAddress, authenticated, hasWallet, hasActiveWalletConnection, isWalletConnectionPending }
}
