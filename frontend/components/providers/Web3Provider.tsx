'use client'
import { PrivyProvider, useWallets } from '@privy-io/react-auth'
import { WagmiProvider, useSetActiveWallet } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { config } from '@/lib/config/wagmi'
import { ModerationProvider } from '@/components/moderation'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'

// Keeps the active wagmi wallet on a wallet the user actually logged in with (wallet.linked),
// so a browser-injected wallet Privy merely detects can't hijack the session. Only acts once
// per address, and only when Privy has finished enumerating wallets and explicitly reports the
// active one as unlinked, so a mid-hydration gap in the wallets list can't trigger a switch.
function SyncActiveWallet() {
  const { wallets, ready } = useWallets()
  const { setActiveWallet } = useSetActiveWallet()
  const { address } = useAccount()
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !address || attempted.current === address) return
    const active = wallets.find(w => w.address.toLowerCase() === address.toLowerCase())
    if (!active || active.linked) return
    const linked = wallets.filter(w => w.linked)
    if (linked.length === 0) return
    attempted.current = address
    setActiveWallet(linked[0])
  }, [ready, wallets, address, setActiveWallet])

  return null
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'apple', 'farcaster'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          },
        },
        defaultChain: CANONICAL_CHAIN,
        supportedChains: [CANONICAL_CHAIN],
        appearance: {
          theme: 'dark',
          accentColor: '#7C9CFF',
          logo: '/markee-logo.png',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <SyncActiveWallet />
          <ModerationProvider>
            {children}
          </ModerationProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
