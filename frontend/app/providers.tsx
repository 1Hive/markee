'use client'

import { ApolloProvider } from '@apollo/client'
import { apolloClient } from '@/lib/apollo-client'
// ... other imports

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider client={apolloClient}>
      <Web3Provider>
        {/* ... other providers */}
        {children}
      </Web3Provider>
    </ApolloProvider>
  )
}
