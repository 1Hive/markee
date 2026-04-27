'use client'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApolloProvider } from '@apollo/client'
import { apolloClient } from '@/lib/apollo-client'
import { config } from '@/lib/config/wagmi'
import { ModerationProvider } from '@/components/moderation'
import { ReactNode, useState } from 'react'
import { base } from 'viem/chains'

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ApolloProvider client={apolloClient}>
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
        config={{
          loginMethods: ['email', 'wallet', 'google', 'apple', 'farcaster'],
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'all-users',
            },
          },
          defaultChain: base,
          supportedChains: [base],
          appearance: {
            theme: 'dark',
            accentColor: '#7C9CFF',
            logo: '/markee-logo.png',
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={config}>
            <ModerationProvider>
              {children}
            </ModerationProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </ApolloProvider>
  )
}
