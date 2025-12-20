'use client'

import { ApolloProvider } from '@apollo/client'
import { apolloClient } from '@/lib/apollo-client'
import { Web3Provider } from '@/lib/web3provider'
import { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApolloProvider client={apolloClient}>
      <Web3Provider>
        {children}
      </Web3Provider>
    </ApolloProvider>
  )
}
