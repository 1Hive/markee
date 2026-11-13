import { kv } from '@vercel/kv'
import type { EmailIndexStore } from './emailIndex'

const CLAIM = `local cur = redis.call('GET', KEYS[1])
if cur and cur ~= ARGV[1] then return cur end
if ARGV[2] == 'PERSIST' then redis.call('SET', KEYS[1], ARGV[1]) else redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) end
return ARGV[1]`

const RELEASE_IF_HELD = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`

export function kvEmailIndexStore(notifyKey: (wallet: string) => string): EmailIndexStore {
  return {
    claim: async (key, wallet, ttlSeconds) => String(await kv.eval(CLAIM, [key], [wallet, ttlSeconds === null ? 'PERSIST' : String(ttlSeconds)])),
    releaseIfHeld: async (key, wallet) => { await kv.eval(RELEASE_IF_HELD, [key], [wallet]) },
    currentEmail: async wallet => (await kv.get<{ email?: string }>(notifyKey(wallet)))?.email ?? null,
  }
}
