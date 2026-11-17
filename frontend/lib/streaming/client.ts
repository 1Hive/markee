import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

// Server reads use the server-only ALCHEMY_BASE_URL key. NEXT_PUBLIC_BASE_RPC_URL ships in the
// browser bundle (and may be domain-restricted), so it is only a fallback; both must point at the
// chain NEXT_PUBLIC_STREAMING_FACTORY was deployed to.
export function createStreamingClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
      { batch: true, fetchOptions: { cache: 'no-store' } },
    ),
  })
}
