import { http, createConfig } from 'wagmi'
import { base, optimism, arbitrum, mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base, optimism, arbitrum, mainnet],
  connectors: [
    injected(),
    walletConnect({ 
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '' 
    }),
  ],
  transports: {
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [mainnet.id]: http(),
  },
})
