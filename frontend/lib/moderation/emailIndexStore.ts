import { kv } from '@vercel/kv'
import type { EmailIndexStore } from './emailIndex'

const CLAIM = `local cur = redis.call('GET', KEYS[1])
if cur and cur ~= ARGV[1] then return cur end
redis.call('SET', KEYS[1], ARGV[1])
return ARGV[1]`

// A claim is live only while its holder's notify state still names the email and is verified.
const EVICT_IF_STALE = `local cur = redis.call('GET', KEYS[1])
if cur ~= ARGV[1] then return 1 end
local state = redis.call('GET', KEYS[2])
if state and string.find(state, ARGV[2], 1, true) and string.find(state, '"verified":true', 1, true) then return 0 end
redis.call('DEL', KEYS[1])
return 1`

const RELEASE_IF_HELD = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`

export function kvEmailIndexStore(notifyKey: (wallet: string) => string): EmailIndexStore {
  return {
    claim: async (key, wallet) => String(await kv.eval(CLAIM, [key], [wallet])),
    holder: async key => {
      const cur = await kv.eval(`return redis.call('GET', KEYS[1])`, [key], [])
      return cur ? String(cur) : null
    },
    releaseIfHeld: async (key, wallet) => { await kv.eval(RELEASE_IF_HELD, [key], [wallet]) },
    evictIfStale: async (key, holder, email) =>
      Number(await kv.eval(EVICT_IF_STALE, [key, notifyKey(holder)], [holder, `"email":${JSON.stringify(email)}`])) === 1,
  }
}
