import { randomUUID } from 'node:crypto';
import { createClient } from '@vercel/kv';
import type { Placement, Snapshot } from '../../../packages/sdk/src/types';
import { createSnapshotCache, SnapshotUnavailable, type SnapshotStore } from './snapshot-cache';
import { SDKError } from './validation';

const generationKey = 'sdk:snapshots:generation';
// v1 retained records could include account-selected off-page rent messages.
// Do not read them after tightening retention to accountless pages.
const retainedPrefix = 'sdk:snapshots:v2:retained:';
// Accountless reads are shared by every embedded sign polling a board, so each
// refresh costs one chain read per board and page. Verified SDK transactions
// invalidate immediately; this only bounds how long off-SDK changes take to show.
export const PUBLIC_FRESH_SECONDS = 60;
export const RETAIN_SECONDS = 35 * 24 * 60 * 60;
type Retained = { data: Snapshot; updatedAt: number };
// A late response from an older chain read cannot replace a newer observed board.
export const RETAIN = `local previous = redis.call('get', KEYS[1])
if previous then
  local saved = cjson.decode(previous)
  local incoming = cjson.decode(ARGV[1])
  if saved.updatedAt >= tonumber(ARGV[2]) or tonumber(saved.data.blockNumber) > tonumber(incoming.data.blockNumber) then return 0 end
end
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[3])
return 1`;
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
    placement.kind === 'platform-community' ? placement.platformId : null,
    (placement.kind === 'board' ? placement.address : placement.kind === 'gardens-community' ? placement.community : placement.communityId).toLowerCase(),
    account?.toLowerCase() || null, offset ?? null]);
}

export function stableDisplayKey(placement: Placement, offset?: number) {
  return displayKey(placement, undefined, offset);
}

export function createDisplayCache(store: SnapshotStore, now = Date.now) {
  const cache = createSnapshotCache(store, now);
  const retained = async (key: string) => {
    const saved = await store.get<Retained>(`${retainedPrefix}${key}`);
    if (!saved || !saved.data || !Number.isFinite(saved.updatedAt)) return null;
    return { data: saved.data, updatedAt: saved.updatedAt,
      freshUntil: saved.updatedAt, staleUntil: saved.updatedAt + RETAIN_SECONDS * 1000,
      stale: true, refreshing: false, retained: true };
  };
  return {
    async read<T>(key: string, load: () => Promise<T>, wallet = false) {
      const generation = await store.get<string>(generationKey) || 'initial';
      let loaded = false;
      try {
        const result = await cache(`${generation}:${key}`, async () => { const value = await load(); loaded = true; return value; },
          wallet ? 20 : PUBLIC_FRESH_SECONDS, wallet ? 60 : 300, false, error => !(error instanceof SDKError && error.status < 500));
        // Only accountless board reads have public pagination. Account-scoped
        // rent reads can add the backer's message outside that public page.
        // Retain only data this request loaded, or a stale short-lived snapshot
        // that may predate retention; a fresh cache hit was already retained.
        const data = result.data as Snapshot;
        if ((loaded || result.stale) && !wallet && data && data.apiVersion === 1 && data.board && data.placement.kind === 'board') {
          const publicData = { ...data, wallet: null };
          try { await store.eval(RETAIN, [`${retainedPrefix}${key}`],
            [JSON.stringify({ data: publicData, updatedAt: result.updatedAt }), result.updatedAt, RETAIN_SECONDS]); }
          catch { /* The ordinary snapshot remains usable if retention fails. */ }
        }
        return result;
      } catch (error) {
        if (!wallet && error instanceof SnapshotUnavailable) {
          const saved = await retained(key);
          if (saved) return saved as Awaited<ReturnType<typeof cache<T>>>;
        }
        throw error;
      }
    },
    retained,
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
