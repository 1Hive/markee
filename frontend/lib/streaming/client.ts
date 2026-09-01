import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

// The streaming factory lives on whatever chain NEXT_PUBLIC_STREAMING_FACTORY was deployed to, which
// is the chain NEXT_PUBLIC_BASE_RPC_URL points at (the same RPC every client-side streaming hook
// reads). Prefer it so server-side reads see the same factory; fall back to Alchemy, then public Base.
export function createStreamingClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org',
      { batch: true, fetchOptions: { cache: 'no-store' } },
    ),
  })
}
