import { http, createConfig } from 'wagmi'
import { base, optimism, arbitrum, mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base, optimism, arbitrum, mainnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
    }),
  ],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL ||
        'https://mainnet.base.org', // Official Base public RPC
      {
        batch: true,
        retryCount: 3,
        retryDelay: 1000,
      }
    ),
    [optimism.id]: http(
      process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL ||
        'https://opt-mainnet.g.alchemy.com/v2/MfatE-JTmlEIgHxhW40pO', // Your Alchemy Optimism endpoint
      {
        batch: true, // Enable request batching to reduce number of calls
        retryCount: 3, // Limit retries to prevent infinite loops
        retryDelay: 1000, // 1 second delay between retries
      }
    ),
    [arbitrum.id]: http(
      process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ||
        'https://arb1.arbitrum.io/rpc', // Official Arbitrum public RPC
      {
        batch: true,
        retryCount: 3,
        retryDelay: 1000,
      }
    ),
    [mainnet.id]: http(
      process.env.NEXT_PUBLIC_MAINNET_RPC_URL ||
        'https://eth.llamarpc.com', // Public Ethereum RPC
      {
        batch: true,
        retryCount: 3,
        retryDelay: 1000,
      }
    ),
  },
})
