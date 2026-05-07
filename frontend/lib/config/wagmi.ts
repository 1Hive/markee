import { createConfig } from '@privy-io/wagmi'
import { base } from 'viem/chains'
import { http } from 'wagmi'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'
    ),
  },
})
