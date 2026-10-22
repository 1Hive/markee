import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { kv } from '@vercel/kv';
import { type Hex } from 'viem';
import { getEnvPublicClient } from './chains';
import { SDKError } from './validation';
import { invalidateVerifiedDisplay } from './cached-display';

interface Operation {
  id: string; status: 'working' | 'submitted' | 'complete' | 'failed';
  result?: Record<string, unknown>; error?: string; createdAt: number;
}
const memory = new Map<string, { value: unknown; expires: number }>();
function durable() {
  const configured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!configured && process.env.NODE_ENV === 'production') throw new SDKError('STORE_UNAVAILABLE', 'Community operation storage is unavailable.', 503);
  return configured;
}
async function get<T>(key: string): Promise<T | null> {
  if (durable()) return kv.get<T>(key);
  const stored = memory.get(key);
  if (!stored || stored.expires < Date.now()) { memory.delete(key); return null; }
  return stored.value as T;
}
async function set(key: string, value: unknown, nx = false, ttl = 86400): Promise<boolean> {
  if (durable()) return (await kv.set(key, value, nx ? { ex: ttl, nx: true } : { ex: ttl })) === 'OK';
  const previous = memory.get(key);
  if (nx && previous && previous.expires > Date.now()) return false;
  memory.set(key, { value, expires: Date.now() + ttl * 1000 }); return true;
}
const key = (id: string) => `sdk:v1:operation:${id}`;
const context = new AsyncLocalStorage<string>();
/** Save the broadcast hash before waiting for a receipt, so network timeouts are recoverable. */
export async function recordAdminBroadcast(result: Record<string, unknown>) {
  const id = context.getStore();
  if (!id) return;
  const old = await get<Operation>(key(id));
  if (old) await set(key(id), { ...old, status: 'submitted', result });
}
export async function operationStatus(id: string): Promise<Operation> {
  if (!/^[\da-f]{64}$/.test(id)) throw new SDKError('INVALID_OPERATION', 'Invalid operation identifier.');
  const op = await get<Operation>(key(id));
  if (!op) throw new SDKError('OPERATION_NOT_FOUND', 'This operation is unavailable or expired. Check the community state before trying again.', 404);
  if (op.status === 'submitted' && op.result) {
    try {
      const receipt = await getEnvPublicClient(Number(op.result.markeeChainId)).getTransactionReceipt({ hash: op.result.transactionHash as Hex });
      op.status = receipt.status === 'success' ? 'complete' : 'failed';
      if (op.status === 'failed') op.error = 'The community transaction reverted.';
      await set(key(id), op);
    } catch (error) { if ((error as Error).name !== 'TransactionReceiptNotFoundError') throw error; }
  }
  // An interrupted process without a saved broadcast stays unknown. Never execute it again.
  if (op.status === 'complete' && typeof op.result?.transactionHash === 'string') {
    await invalidateVerifiedDisplay(Number(op.result.markeeChainId || 8453), op.result.transactionHash);
  }
  return op;
}
export async function executeAdmin(kind: string, request: Request, body: { nonce: string; signature: string }, handler: (request: Request) => Promise<Response>) {
  const id = createHash('sha256').update(`${kind}:${body.nonce}:${body.signature}`).digest('hex');
  const existing = await get<Operation>(key(id));
  if (existing) return Response.json(await operationStatus(id));
  // Both admin routes use the same keeper. Serialize submissions across serverless
  // instances to avoid racing the signer's nonce. A crashed worker's lease expires.
  const lease = randomUUID();
  const lock = 'sdk:v1:keeper-lock';
  if (!await set(lock, lease, true, 120)) throw new SDKError('KEEPER_BUSY', 'Another community action is processing. Try again shortly.', 409);
  try {
    const op: Operation = { id, status: 'working', createdAt: Date.now() };
    if (!await set(key(id), op, true)) return Response.json(await operationStatus(id));
    return await context.run(id, async () => {
      try {
        const response = await handler(request);
        const result = await response.json();
        const current = await get<Operation>(key(id));
        if (response.ok) await set(key(id), { ...op, status: 'complete', result });
        else if (current?.status !== 'submitted') await set(key(id), { ...op, status: 'failed', error: result.error || 'Community authorization failed.' });
      } catch {
        // Preserve a submitted hash even when waiting for its receipt failed.
        const current = await get<Operation>(key(id));
        if (current?.status !== 'submitted') await set(key(id), { ...op, status: 'failed', error: 'The community action could not complete. Check community state before retrying.' });
      }
      return Response.json(await operationStatus(id));
    });
  } finally {
    if (durable()) await kv.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end', [lock], [lease]);
    else if (await get(lock) === lease) memory.delete(lock);
  }
}
