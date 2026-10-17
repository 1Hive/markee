import type { Entry, Snapshot } from './types';

export const MONTH = 2628000n;
const INCREMENT = 10n ** 15n; // 0.001 ETH, or ETH/month, above the loaded ranking.
const max = (...values: bigint[]) => values.reduce((a, b) => a > b ? a : b, 0n);

/** Input suggestions only. The API still validates and simulates the final action. */
export function fundingPresets(snapshot: Snapshot, entry?: Entry) {
  const rent = snapshot.strategy === 'rent';
  const minimum = rent ? ((BigInt(snapshot.minimum) + INCREMENT - 1n) / INCREMENT) * INCREMENT : entry ? 1n : BigInt(snapshot.minimum);
  const competitors = snapshot.entries.filter(item => item.address.toLowerCase() !== entry?.address.toLowerCase());
  const leader = max(...competitors.map(item => BigInt(item.score)));
  const promoted = !!entry && entry.address.toLowerCase() === snapshot.top?.toLowerCase();
  if (!rent) {
    const funded = BigInt(entry?.totalFunds ?? '0');
    return { minimum, boost: max(minimum, leader + INCREMENT - funded, promoted ? funded : 0n), double: promoted && funded > 0n };
  }
  const backing = !!entry && snapshot.wallet?.backedMarkee?.toLowerCase() === entry.address.toLowerCase();
  const current = backing ? BigInt(snapshot.wallet!.flowRate) : 0n;
  // Updating a stream replaces the wallet's rate; other backers keep theirs.
  // Legacy floors are not spendable contributions to the new live aggregate.
  const otherBackers = max(BigInt(entry?.aggregateRate ?? '0') - current);
  return { minimum, boost: max(minimum, (leader - otherBackers) * MONTH + INCREMENT, promoted ? current * MONTH * 2n : 0n), double: promoted && current > 0n };
}
