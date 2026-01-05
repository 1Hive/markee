'use client'
import '@rainbow-me/rainbowkit/styles.css'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApolloProvider } from '@apollo/client'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { apolloClient } from '@/lib/apollo-client'
import { config } from '@/lib/config/wagmi'
import { ReactNode, useState } from 'react'

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  
  return (
    <ApolloProvider client={apolloClient}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: '#7C9CFF',
              accentColorForeground: '#060A2A',
              borderRadius: 'large',
              overlayBlur: 'small',
            })}
            modalSize="compact"
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ApolloProvider>
  )
}
