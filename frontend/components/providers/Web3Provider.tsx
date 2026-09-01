'use client'
import { PrivyProvider, useWallets } from '@privy-io/react-auth'
import { WagmiProvider, useSetActiveWallet } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { config } from '@/lib/config/wagmi'
import { ModerationProvider } from '@/components/moderation'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'

// Keeps the active wagmi wallet on the linked external wallet the user actually connected with
// (Rabby/MetaMask/etc.), not the auto-created embedded Privy wallet -- every account gets one of
// those silently (embeddedWallets.createOnLogin: 'all-users' below), and it can end up as wagmi's
// active connector instead of the real one, which then reads as an empty account everywhere
// (dashboard, header) even though the user is genuinely connected with their real wallet.
//
// The previous version of this effect bailed out via `if (!active || active.linked) return`, which
// meant it only ever corrected an UNLINKED active wallet. That never catches the actual hijack case:
// the embedded wallet is always linked (it's created and linked automatically), so as soon as it
// became wagmi's active wallet this guard saw `active.linked === true` and did nothing -- despite
// the comment above it (in an earlier version) describing this exact scenario as what it prevents.
// The fix is to check whether the active wallet is embedded, not just whether it's linked.
function SyncActiveWallet() {
  const { wallets, ready } = useWallets()
  const { setActiveWallet } = useSetActiveWallet()
  const { address } = useAccount()
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !address || attempted.current === address) return
    const isEmbedded = (w: { walletClientType: string }) => w.walletClientType === 'privy' || w.walletClientType === 'privy-v2'
    const active = wallets.find(w => w.address.toLowerCase() === address.toLowerCase())
    // Nothing to correct if the active wallet is already a linked, non-embedded (real, external)
    // wallet -- this is the common/good case and must not loop back into setActiveWallet.
    if (active && active.linked && !isEmbedded(active)) return
    const linkedExternal = wallets.find(w => w.linked && !isEmbedded(w))
    if (!linkedExternal) return // no external wallet to prefer -- e.g. an email/social-only account
    attempted.current = address
    setActiveWallet(linkedExternal)
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
