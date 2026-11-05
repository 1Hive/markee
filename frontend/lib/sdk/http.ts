import { kv } from '@vercel/kv';
import { SDKError } from './validation';

const windows = new Map<string, { count: number; expiry: number }>();
export async function rateLimit(request: Request) {
  const bucket = Math.floor(Date.now() / 60_000);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const key = `sdk:v1:rate:${ip}:${bucket}`;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const hits = await kv.incr(key);
    if (hits === 1) await kv.expire(key, 120);
    if (hits > 120) throw new SDKError('RATE_LIMITED', 'Too many requests; try again in a minute.', 429);
  } else {
    if (process.env.NODE_ENV === 'production') throw new SDKError('NOT_CONFIGURED', 'Markee API storage is not configured.', 503);
    for (const [k, v] of windows) if (v.expiry < Date.now()) windows.delete(k);
    const current = windows.get(key) || { count: 0, expiry: Date.now() + 120_000 };
    current.count++; windows.set(key, current);
    if (current.count > 120) throw new SDKError('RATE_LIMITED', 'Too many requests; try again in a minute.', 429);
  }
}
export function cors(response: Response, request: Request): Response {
  const configured = process.env.MARKEE_SDK_ALLOWED_ORIGINS?.split(',').map(s => s.trim());
  const origin = request.headers.get('origin');
  response.headers.set('Vary', 'Origin');
  if (!configured?.length) response.headers.set('Access-Control-Allow-Origin', '*');
  else if (origin && configured.includes(origin)) response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
