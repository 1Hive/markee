import { http, createConfig } from 'wagmi'
import { base, optimism, arbitrum, mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  autoConnect: true,
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
    }),
  ],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
      { batch: true, retryCount: 3, retryDelay: 1000 }
    ),
    [optimism.id]: http(
      process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL || 'https://opt-mainnet.g.alchemy.com/v2/MfatE-JTmlEIgHxhW40pO',
      { batch: true, retryCount: 3, retryDelay: 1000 }
    ),
    [arbitrum.id]: http(
      process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      { batch: true, retryCount: 3, retryDelay: 1000 }
    ),
    [mainnet.id]: http(
      process.env.NEXT_PUBLIC_MAINNET_RPC_URL || 'https://eth.llamarpc.com',
      { batch: true, retryCount: 3, retryDelay: 1000 }
    ),
  },
})
