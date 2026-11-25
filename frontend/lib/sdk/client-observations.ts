import { kv } from '@vercel/kv';
import type { Address } from 'viem';

const WINDOW_MS = 30 * 60_000;
const RETENTION_SECONDS = 90 * 86400;
const FIELD_LIMIT = 32;
const recent = new Map<string, number>();

// An old SDK and a custom client are both unattributed. The marker is useful
// for integration diagnostics, but a custom caller can claim any version.
export function clientLabel(value: string | null): string {
  return value && /^markee-sdk@\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value) && value.length <= 64
    ? value : 'unattributed';
}

export function originHost(value: string | null): string {
  if (!value || value.length > 300) return 'unknown-origin';
  try {
    const url = new URL(value);
    if (url.origin.toLowerCase() !== value.toLowerCase() || !['https:', 'http:'].includes(url.protocol) || !url.hostname) return 'unknown-origin';
    return url.host.toLowerCase();
  } catch { return 'unknown-origin'; }
}

export const observationDeps = {
  now: () => Date.now(),
  write: (key: string, field: string, timestamp: number) => kv.eval(
    `if redis.call('HEXISTS',KEYS[1],ARGV[1]) == 1 or redis.call('HLEN',KEYS[1]) < tonumber(ARGV[3]) then
       redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); redis.call('EXPIRE',KEYS[1],ARGV[4]); return 1
     end; return 0`,
    [key], [field, String(timestamp), String(FIELD_LIMIT), String(RETENTION_SECONDS)]),
};

/** Best-effort, bounded board-level observations. No wallet, IP, or page path is stored. */
export async function observeSdkClient(board: Address | null, marker: string | null, origin: string | null): Promise<void> {
  if (!board || !/^0x[0-9a-f]{40}$/i.test(board)) return;
  const key = `sdk:client-observations:v1:8453:${board.toLowerCase()}`;
  const field = `${clientLabel(marker)}|${originHost(origin)}`;
  const memoryKey = `${key}:${field}`;
  const now = observationDeps.now();
  const last = recent.get(memoryKey);
  if (last !== undefined && last + WINDOW_MS > now) return;
  if (recent.size > 10_000) recent.clear();
  recent.set(memoryKey, now);
  try { await observationDeps.write(key, field, now); }
  catch { recent.delete(memoryKey); /* Diagnostics must never block a snapshot. */ }
}

export function clearClientObservationsForTests() { recent.clear(); }
