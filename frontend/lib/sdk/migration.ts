import { zeroAddress, type Address } from 'viem';
import { finishedBoardSuccessor, finishedMarkeeSuccessor } from '../contracts/migration';
import { getEnvPublicClient } from './chains';
import { displayCacheConfigured, snapshotStorage } from './cached-display';

export const MIGRATION_CHAIN_ID = 8453;
const PENDING_SECONDS = 60;
const FINISHED_SECONDS = 5 * 365 * 86400;
const MEMORY_LIMIT = 10_000;

type MigrationClient = Parameters<typeof finishedBoardSuccessor>[0];
const migrationClient = () => getEnvPublicClient(MIGRATION_CHAIN_ID) as unknown as MigrationClient;

export const migrationDeps = {
  boardSuccessor: (board: Address) => finishedBoardSuccessor(migrationClient(), board),
  markeeSuccessor: (markee: Address) => finishedMarkeeSuccessor(migrationClient(), markee),
  now: () => Date.now(),
};

const migrated = (resolved: Address, address: Address) => resolved.toLowerCase() !== address.toLowerCase();
const memory = new Map<string, { current: Address; expires: number }>();
export function clearMigrationMemoryForTests() { memory.clear(); }

async function current(kind: 'board' | 'markee', address: Address, lookup: (address: Address) => Promise<Address | null>): Promise<Address> {
  const key = `sdk:migration:v1:${kind}:${address.toLowerCase()}`;
  const hit = memory.get(key);
  if (hit && hit.expires > migrationDeps.now()) return hit.current;
  const durable = displayCacheConfigured();
  let resolved = durable ? await snapshotStorage.get().get<Address>(key).catch(() => null) : null;
  if (!resolved) {
    const successor = await lookup(address);
    resolved = successor && successor !== zeroAddress ? successor : address;
    if (durable) await snapshotStorage.get().set(key, resolved, { ex: migrated(resolved, address) ? FINISHED_SECONDS : PENDING_SECONDS }).catch(() => undefined);
  }
  if (memory.size >= MEMORY_LIMIT) for (const oldest of [...memory.keys()].slice(0, MEMORY_LIMIT / 5)) memory.delete(oldest);
  memory.set(key, { current: resolved, expires: migrated(resolved, address) ? Infinity : migrationDeps.now() + PENDING_SECONDS * 1000 });
  return resolved;
}

/** Finished migrations are permanent, so their successors are cached indefinitely. */
export function currentSdkBoard(chainId: number, board: Address): Promise<Address> {
  return chainId === MIGRATION_CHAIN_ID ? current('board', board, migrationDeps.boardSuccessor) : Promise.resolve(board);
}

export function currentSdkMarkee(chainId: number, markee: Address): Promise<Address> {
  return chainId === MIGRATION_CHAIN_ID ? current('markee', markee, migrationDeps.markeeSuccessor) : Promise.resolve(markee);
}
