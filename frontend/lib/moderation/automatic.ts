import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { kv } from '@vercel/kv'
import { Profanity } from '@2toad/profanity'
import { parseAbi, type Address } from 'viem'
import { underRateLimit } from '../rate-limit'
import { trustedMembership } from './membership'
import { getModerationClient, readAllFlagged, flagKey, authorizedScopes } from './server'

export const AUTO_POLICY = 'profanity-3.3.0-v1'
export const AUTO_LANGUAGES = ['ar', 'zh', 'en', 'fr', 'de', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'es']
export const AUTO_REASON = 'This message matched the profanity filter.'
export const autoEnabled = () => process.env.FLAG_AUTO_MODERATION === 'true'
export const contentHash = (message: string) => createHash('sha256').update(message, 'utf8').digest('hex')
export type AutoVerdict = { enabled: boolean; state: 'pass' | 'soft-flagged' | 'unavailable'; contentHash: string; engine: string; policyVersion: string; reason?: string }
export type Visibility = 'visible' | 'manual-flagged' | 'soft-flagged' | 'unavailable'
export type PublishedModeration = { markee: string; board?: string; contentHash: string; state: Visibility; siteState: Visibility; reason?: string; policyVersion: string }
export interface ModerationEngine { check(message: string): boolean }
let filter: Profanity | undefined
export const automaticAuthDeps = { authorizedScopes, underRateLimit }
export const automaticDeps = {
  engine: { check(message: string) { filter ??= new Profanity({ languages: AUTO_LANGUAGES, wholeWord: true, unicodeWordBoundaries: true }); return filter.exists(message.normalize('NFKC')) } } as ModerationEngine,
  get: <T>(key: string) => kv.get<T>(key),
  set: (key: string, value: unknown) => kv.set(key, value),
  pipeline: () => kv.pipeline(),
  flags: readAllFlagged,
  membership: trustedMembership,
  client: getModerationClient,
  members: () => kv.smembers<string[]>(SOFT_INDEX),
  mget: (...keys: string[]) => kv.mget<(PublishedModeration | null)[]>(...keys),
  read: async (ids: string[]) => {
    const client = automaticDeps.client()
    const abi = parseAbi(['function message() view returns (string)', 'function pricingStrategy() view returns (address)'])
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
    const reads = await client.multicall({ blockNumber, contracts: ids.flatMap(id => [
      { address: id as Address, abi, functionName: 'message' as const },
      { address: id as Address, abi, functionName: 'pricingStrategy' as const },
    ]) })
    const observations = ids.flatMap((markee, i) => {
      const message = reads[i * 2], board = reads[i * 2 + 1]
      if (message.status !== 'success' || board.status !== 'success' || typeof message.result !== 'string' || typeof board.result !== 'string') return []
      return [{ markee: markee.toLowerCase(), message: message.result, board: board.result.toLowerCase() }]
    })
    const members = await automaticDeps.membership(observations, client, blockNumber)
    return observations.filter((_, i) => members[i] === true)
  },
}
const verdictCache = new Map<string, AutoVerdict>()
export function checkDraft(message: string): AutoVerdict {
  const hash = contentHash(message)
  const base = { enabled: autoEnabled(), contentHash: hash, engine: '@2toad/profanity', policyVersion: AUTO_POLICY }
  if (!base.enabled) return { ...base, state: 'pass' }
  const key = `${AUTO_POLICY}:${hash}`
  const cached = verdictCache.get(key)
  if (cached) return cached
  try {
    const flagged = automaticDeps.engine.check(message)
    const result: AutoVerdict = { ...base, state: flagged ? 'soft-flagged' : 'pass', ...(flagged ? { reason: AUTO_REASON } : {}) }
    if (verdictCache.size >= 2000) verdictCache.delete(verdictCache.keys().next().value!)
    verdictCache.set(key, result)
    return result
  } catch { return { ...base, state: 'unavailable', reason: 'Moderation check unavailable' } }
}
export const softKey = (id: string) => `moderation:auto:8453:${id.toLowerCase()}`
export const overrideKey = (id: string, hash: string) => `moderation:auto:site-override:8453:${id.toLowerCase()}:${hash}`
export const SOFT_INDEX = 'moderation:auto:soft:8453'

// Call only with text read by our server (never a browser-provided published message).
type Observation = { markee: string; message: string; board: string }
const unavailable = (markee: string): PublishedModeration => ({ markee: markee.toLowerCase(), contentHash: '', state: 'unavailable', siteState: 'unavailable', reason: 'Moderation check unavailable', policyVersion: AUTO_POLICY })

export async function evaluateObserved(id: string, message: string, board: string, manual: { board: boolean; site: boolean }): Promise<PublishedModeration> {
  const [trusted] = await automaticDeps.membership([{ markee: id, board }])
  return trusted === true ? evaluateTrusted(id, message, board, manual) : unavailable(id)
}
export async function evaluateObservedBatch(observations: Observation[], flags: { board: string[]; site: string[] }): Promise<PublishedModeration[]> {
  const trusted = await automaticDeps.membership(observations)
  return Promise.all(observations.map((o, i) => trusted[i] === true ? evaluateTrusted(o.markee, o.message, o.board, { board: flags.board.includes(flagKey(o.markee)), site: flags.site.includes(flagKey(o.markee)) }) : unavailable(o.markee)))
}
async function evaluateTrusted(id: string, message: string, board: string, manual: { board: boolean; site: boolean }): Promise<PublishedModeration> {
  const hash = contentHash(message)
  const base = { markee: id.toLowerCase(), board, contentHash: hash, policyVersion: AUTO_POLICY }
  if (manual.board) return { ...base, state: 'manual-flagged', siteState: 'manual-flagged' }
  const verdict = checkDraft(message)
  if (!verdict.enabled) return { ...base, state: 'visible', siteState: manual.site ? 'manual-flagged' : 'visible' }
  const state: Visibility = verdict.state === 'pass' ? 'visible' : verdict.state
  let override = false
  try {
    override = verdict.state === 'soft-flagged' && !!await automaticDeps.get(overrideKey(id, hash))
    const previous = await automaticDeps.get<PublishedModeration>(softKey(id))
    const result: PublishedModeration = { ...base, state, siteState: manual.site ? 'manual-flagged' : override ? 'visible' : state, ...(verdict.reason ? { reason: verdict.reason } : {}) }
    if (previous?.contentHash === hash && previous?.state === state && previous?.siteState === result.siteState && previous?.policyVersion === AUTO_POLICY) return result
    const pipeline = automaticDeps.pipeline()
    pipeline.set(softKey(id), result)
    if (state !== 'visible') pipeline.sadd(SOFT_INDEX, id.toLowerCase())
    else pipeline.srem(SOFT_INDEX, id.toLowerCase())
    if (previous?.contentHash !== hash || previous?.state !== state || previous?.siteState !== result.siteState) pipeline.set('sdk:snapshots:generation', randomUUID())
    await pipeline.exec()
    return result
  } catch {
    return { ...base, state: 'unavailable', siteState: manual.site ? 'manual-flagged' : 'unavailable', reason: 'Moderation check unavailable' }
  }
}
export async function checkPublished(ids: string[]): Promise<PublishedModeration[]> {
  const [observations, flags] = await Promise.all([automaticDeps.read(ids), automaticDeps.flags()])
  const boardFlags = new Set(flags.board), siteFlags = new Set(flags.site)
  const byId = new Map(observations.map(o => [o.markee.toLowerCase(), o]))
  return Promise.all(ids.map(id => {
    const o = byId.get(id.toLowerCase())
    return o ? evaluateTrusted(o.markee, o.message, o.board, { board: boardFlags.has(flagKey(o.markee)), site: siteFlags.has(flagKey(o.markee)) }) : unavailable(id)
  }))
}
export async function softRecords(): Promise<PublishedModeration[]> {
  if (!autoEnabled()) return []
  const ids = await automaticDeps.members()
  if (!ids.length) return []
  const records = await automaticDeps.mget(...ids.map(softKey))
  const valid = records.filter((r): r is PublishedModeration => !!r && r.state !== 'visible' && r.policyVersion === AUTO_POLICY && typeof r.board === 'string')
  const output: PublishedModeration[] = []
  for (let start = 0; start < valid.length; start += 50) {
    const batch = valid.slice(start, start + 50)
    const trusted = await automaticDeps.membership(batch as (PublishedModeration & { board: string })[])
    if (trusted.some(value => value === null)) throw new Error('Moderation membership unavailable')
    const rejected = batch.filter((_, i) => trusted[i] === false)
    if (rejected.length) {
      const pipeline = automaticDeps.pipeline()
      rejected.forEach(r => { pipeline.srem(SOFT_INDEX, r.markee); pipeline.del(softKey(r.markee)) })
      pipeline.set('sdk:snapshots:generation', randomUUID())
      await pipeline.exec()
    }
    output.push(...batch.filter((_, i) => trusted[i] === true))
  }
  return output
}
