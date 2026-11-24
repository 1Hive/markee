import { parseAbi, zeroAddress, type Address, type PublicClient } from 'viem';

const routerABI = parseAbi(['function streamingLeaderboardFactory() view returns (address)']);
const factoryABI = parseAbi(['function defaultMinimumMonthlyRate() view returns (uint256)']);

/** Monthly wei, matching the board getter. Zero retains v1's unavailable preview state. */
export async function communityMinimumMonthlyRate(
  client: Pick<PublicClient, 'readContract'>,
  router: Address | null,
  existingMinimum?: bigint,
): Promise<bigint> {
  if (existingMinimum !== undefined) return existingMinimum;
  if (!router) return 0n;
  try {
    // Follow the router's actual factory, rather than guessing from a UI constant
    // or a potentially stale environment factory address.
    const factory = await client.readContract({ address: router, abi: routerABI, functionName: 'streamingLeaderboardFactory' });
    if (factory === zeroAddress) return 0n;
    return await client.readContract({ address: factory, abi: factoryABI, functionName: 'defaultMinimumMonthlyRate' });
  } catch {
    // Missing display data must not break status/recovery for older v1 clients.
    return 0n;
  }
}
