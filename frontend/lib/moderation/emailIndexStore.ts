import { kv } from '@vercel/kv'
import { IN_FLIGHT_TTL, type EmailIndexStore } from './emailIndex'

const CLAIM = `local cur = redis.call('GET', KEYS[1])
if cur and cur ~= ARGV[1] then return cur end
if ARGV[2] == 'PERSIST' then redis.call('SET', KEYS[1], ARGV[1]) else redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) end
return ARGV[1]`

const EVICT_IF_STALE = `local cur = redis.call('GET', KEYS[1])
if cur ~= ARGV[1] then return 1 end
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local state = redis.call('GET', KEYS[3])
if state and string.find(state, ARGV[2], 1, true) then return 0 end
redis.call('DEL', KEYS[1])
return 1`

const inFlightKey = (wallet: string) => `moderation:notify-email-inflight:${wallet.toLowerCase()}`

const RELEASE_IF_HELD = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`

export function kvEmailIndexStore(notifyKey: (wallet: string) => string): EmailIndexStore {
  return {
    claim: async (key, wallet, ttlSeconds) => String(await kv.eval(CLAIM, [key], [wallet, ttlSeconds === null ? 'PERSIST' : String(ttlSeconds)])),
    releaseIfHeld: async (key, wallet) => { await kv.eval(RELEASE_IF_HELD, [key], [wallet]) },
    evictIfStale: async (key, holder, email) =>
      Number(await kv.eval(EVICT_IF_STALE, [key, inFlightKey(holder), notifyKey(holder)], [holder, `"email":${JSON.stringify(email)}`])) === 1,
    markInFlight: async wallet => { await kv.set(inFlightKey(wallet), 1, { ex: IN_FLIGHT_TTL }) },
    clearInFlight: async wallet => { await kv.del(inFlightKey(wallet)) },
  }
}
