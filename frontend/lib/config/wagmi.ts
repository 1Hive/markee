import { createConfig } from '@privy-io/wagmi'
import { http } from 'wagmi'
import { CANONICAL_CHAIN, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'

export const config = createConfig({
  chains: [CANONICAL_CHAIN],
  transports: {
    [CANONICAL_CHAIN_ID]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'
    ),
  },
})
