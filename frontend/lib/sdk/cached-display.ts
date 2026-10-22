import { randomUUID } from 'node:crypto';
import { createClient } from '@vercel/kv';
import type { Placement } from '../../../packages/sdk/src/types';
import { createSnapshotCache, type SnapshotStore } from './snapshot-cache';

const generationKey = 'sdk:snapshots:generation';
// A global generation also invalidates other boards affected by the same wallet's
// ETHx balance. Old in-flight loaders can only publish into the obsolete namespace.
export const INVALIDATE = `if redis.call('exists', KEYS[2]) == 1 then return 0 end
redis.call('set', KEYS[1], ARGV[1])
redis.call('set', KEYS[2], '1', 'EX', 604800)
return 1`;

export function displayCacheConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function displayKey(placement: Placement, account?: string, offset?: number) {
  return JSON.stringify([placement.kind, placement.chainId,
    (placement.kind === 'board' ? placement.address : placement.community).toLowerCase(),
    account?.toLowerCase() || null, offset ?? null]);
}

export function createDisplayCache(store: SnapshotStore, now = Date.now) {
  const cache = createSnapshotCache(store, now);
  return {
    async read<T>(key: string, load: () => Promise<T>, wallet = false) {
      const generation = await store.get<string>(generationKey) || 'initial';
      return cache(`${generation}:${key}`, load, wallet ? 20 : 30, wallet ? 60 : 300);
    },
    async invalidate(verifiedReceipt: string) {
      return store.eval(INVALIDATE, [generationKey, `sdk:snapshots:receipt:${verifiedReceipt.toLowerCase()}`], [randomUUID()]);
    },
  };
}

export const snapshotStorage = {
  get: (): SnapshotStore => createClient({
    url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN!,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(3000),
  }) as unknown as SnapshotStore,
};
export const displayCache = () => createDisplayCache(snapshotStorage.get());

/** Only call after the SDK has verified the exact transaction or admin operation. */
export async function invalidateVerifiedDisplay(chainId: number, hash: string) {
  if (!displayCacheConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('SDK snapshot storage is not configured');
    return; // Local development without KV deliberately runs uncached.
  }
  await displayCache().invalidate(`${chainId}:${hash}`);
}
