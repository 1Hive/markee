import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { kv } from '@vercel/kv'
import { Profanity } from '@2toad/profanity'
import { checkRules, checkStrictRules, checkSelectedRules, type RuleMatch } from './rules'
import { isCustomPolicy, moderationRules, type ModerationSeverity } from './severity'
import { parseAbi, type Address } from 'viem'
import { underRateLimit } from '../rate-limit'
import { trustedMembership } from './membership'
import { getModerationClient, readAllFlagged, flagKey, authorizedScopes, readItems } from './server'

// `+names-v1`: the same rules also judge the author's display name, so records judged on the message alone
// get rechecked.
export const AUTO_POLICY = 'website-rules-v1+profanity-3.3.0-en-v2+names-v1'
// English only: the package's other lists are machine-translated and flag everyday words (Portuguese
// "no" and "t", which matches don't/can't; French "les"; Chinese 中国 and 爱; Russian вес). A new
// policy version makes indexed flags from the old lists get rechecked rather than kept.
export const AUTO_LANGUAGES = ['en']
export const AUTO_REASON = 'This message matched the profanity filter.'
export const autoEnabled = () => process.env.FLAG_AUTO_MODERATION?.trim().toLowerCase() !== 'false'
export const contentHash = (message: string) => createHash('sha256').update(message, 'utf8').digest('hex')
// `contentHash` stays the hash of the message alone: published SDK clients compare it with the text they show.
// `nameFlagged` is set when the display name matched a rule, so an approval must cover that exact name too.
export type AutoVerdict = { enabled: boolean; state: 'pass' | 'soft-flagged' | 'unavailable'; contentHash: string; engine: string; policyVersion: string; reason?: string; reasonCodes?: string[]; nameFlagged?: boolean }
export type Visibility = 'visible' | 'manual-flagged' | 'soft-flagged' | 'unavailable'
export type PublishedModeration = { markee: string; board?: string; contentHash: string; nameHash?: string; state: Visibility; siteState: Visibility; reason?: string; reasonCodes?: string[]; policyVersion: string }
export interface ModerationEngine { check(message: string): boolean }
let filter: Profanity | undefined
export const automaticAuthDeps = { authorizedScopes, underRateLimit, readItems }
export const automaticDeps = {
  engine: { check(message: string) { filter ??= new Profanity({ languages: AUTO_LANGUAGES, wholeWord: true, unicodeWordBoundaries: true }); return filter.exists(message.normalize('NFKC')) } } as ModerationEngine,
  rules: checkRules,
  get: <T>(key: string) => kv.get<T>(key),
  set: (key: string, value: unknown) => kv.set(key, value),
  pipeline: () => kv.pipeline(),
  flags: readAllFlagged,
  membership: trustedMembership,
  client: getModerationClient,
  members: () => kv.smembers<string[]>(SOFT_INDEX),
  mget: (...keys: string[]) => kv.mget<(PublishedModeration | null)[]>(...keys),
  readDisplayCache: async (keys: string[]) => kv.mget<(Observation | null)[]>(...keys),
  writeDisplayCache: async (observations: Observation[]) => {
    const pipeline = kv.pipeline()
    for (const observation of observations) pipeline.set(displayObservationKey(observation.markee), observation, { ex: 60 })
    await pipeline.exec()
  },
  read: async (ids: string[]): Promise<Observation[]> => {
    const client = automaticDeps.client()
    const abi = parseAbi(['function message() view returns (string)', 'function pricingStrategy() view returns (address)', 'function name() view returns (string)'])
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
    const reads = await client.multicall({ blockNumber, contracts: ids.flatMap(id => [
      { address: id as Address, abi, functionName: 'message' as const },
      { address: id as Address, abi, functionName: 'pricingStrategy' as const },
      { address: id as Address, abi, functionName: 'name' as const },
    ]) })
    // A failed name read is judged as an empty name, so the message is still moderated; the verdict's
    // nameHash then covers '' and a surface that did read a name waits for the next check.
    const observations = ids.flatMap((markee, i) => {
      const message = reads[i * 3], board = reads[i * 3 + 1], read = reads[i * 3 + 2]
      if (message.status !== 'success' || board.status !== 'success' || typeof message.result !== 'string' || typeof board.result !== 'string') return []
      const name = read.status === 'success' && typeof read.result === 'string' ? read.result : undefined
      return [{ markee: markee.toLowerCase(), message: message.result, name, board: board.result.toLowerCase(), blockNumber: blockNumber.toString() }]
    })
    const members = await automaticDeps.membership(observations, client, blockNumber)
    return observations.filter((_, i) => members[i] === true)
  },
}
const verdictCache = new Map<string, AutoVerdict>()
function ruleMatches(text: string, severity: ModerationSeverity): RuleMatch[] {
  const matches = [...automaticDeps.rules(text)]
  const rules = moderationRules(severity)
  if (rules.profanity && automaticDeps.engine.check(text)) matches.push({ code: 'PROFANITY', reason: AUTO_REASON })
  if (severity === 'strict') matches.push(...checkStrictRules(text))
  else if (isCustomPolicy(severity)) matches.push(...checkSelectedRules(text, rules))
  return matches
}
// A display name gets the same rules except the address and ENS restrictions: an address or ENS name in a
// name is withheld from display instead (impersonatesWallet), leaving the message visible. Strict's link
// rule still applies, without counting ENS names as links.
function nameRuleMatches(name: string, severity: ModerationSeverity): RuleMatch[] {
  const matches = [...automaticDeps.rules(name)]
  const rules = moderationRules(severity)
  if (rules.profanity && automaticDeps.engine.check(name)) matches.push({ code: 'PROFANITY', reason: AUTO_REASON })
  if (rules.links) matches.push(...checkSelectedRules(name, { links: true, addresses: false, ens: false }))
  return matches
}
// Rule reasons describe a message; a match in the display name says so instead.
const nameReason = (reason: string) => reason.replace(/^This message\b/, 'The display name')
/** Judges a message and its author's display name with the same rules. Either one matching flags both. */
export function checkDraft(message: string, severity: ModerationSeverity = 'standard', name = ''): AutoVerdict {
  const hash = contentHash(message)
  const base = { enabled: autoEnabled(), contentHash: hash, engine: 'markee-rules+@2toad/profanity', policyVersion: severity === 'standard' ? AUTO_POLICY : `${AUTO_POLICY}:${severity}-v1` }
  if (!base.enabled) return { ...base, state: 'pass' }
  const key = `${base.policyVersion}:${hash}:${name ? contentHash(name) : ''}`
  const cached = verdictCache.get(key)
  if (cached) return cached
  try {
    const nameMatches = name.trim() ? nameRuleMatches(name, severity).map(m => ({ code: m.code, reason: nameReason(m.reason) })) : []
    const matches = [...ruleMatches(message, severity), ...nameMatches]
    const result: AutoVerdict = { ...base, state: matches.length ? 'soft-flagged' : 'pass', ...(matches.length ? { reason: matches.map(m => m.reason).join(' '), reasonCodes: [...new Set(matches.map(m => m.code))] } : {}), ...(nameMatches.length ? { nameFlagged: true } : {}) }
    if (verdictCache.size >= 2000) verdictCache.delete(verdictCache.keys().next().value!)
    verdictCache.set(key, result)
    return result
  } catch { return { ...base, state: 'unavailable', reason: 'Moderation check unavailable' } }
}
export const softKey = (id: string) => `moderation:auto:8453:${id.toLowerCase()}`
export const overrideKey = (id: string, hash: string) => `moderation:auto:site-override:8453:${id.toLowerCase()}:${hash}`
export const sharedOverrideKey = (id: string, hash: string) => `moderation:auto:all-override:8453:${id.toLowerCase()}:${hash}`
export const SOFT_INDEX = 'moderation:auto:soft:8453'

// Call only with text read by our server (never a browser-provided published message).
type Observation = { markee: string; message: string; name?: string; board: string; blockNumber?: string }
const displayObservationKey = (id: string) => `moderation:display-observation:v1:8453:${id.toLowerCase()}`

const unavailable = (markee: string): PublishedModeration => ({ markee: markee.toLowerCase(), contentHash: '', state: 'unavailable', siteState: 'unavailable', reason: 'Moderation check unavailable', policyVersion: AUTO_POLICY })

export async function evaluateObserved(id: string, message: string, board: string, manual: { board: boolean; site: boolean }, name = ''): Promise<PublishedModeration> {
  const [trusted] = await automaticDeps.membership([{ markee: id, board }])
  return trusted === true ? evaluateTrusted(id, message, board, manual, 'standard', name) : unavailable(id)
}
export async function evaluateObservedBatch(
  observations: Observation[],
  flags: { board: string[]; site: string[] },
  severity: ModerationSeverity = 'standard',
  context?: { client: ReturnType<typeof getModerationClient>; blockNumber: bigint },
): Promise<PublishedModeration[]> {
  // Only a server-created context can reuse a scan's pinned block. The optional
  // blockNumber carried in an observation is never used as a trust context.
  const trusted = await automaticDeps.membership(observations, context?.client, context?.blockNumber)
  if (context && trusted.some(value => value === null)) throw new Error('Moderation membership read failed; retaining checkpoints')
  const results: PublishedModeration[] = []
  const boardFlags = new Set(flags.board), siteFlags = new Set(flags.site)
  // Validate the whole scan once, but retain the former 25-item write concurrency.
  for (let start = 0; start < observations.length; start += 25) {
    results.push(...await Promise.all(observations.slice(start, start + 25).map((o, i) => trusted[start + i] === true
      ? evaluateTrusted(o.markee, o.message, o.board, { board: boardFlags.has(flagKey(o.markee)), site: siteFlags.has(flagKey(o.markee)) }, severity, o.name ?? '')
      : unavailable(o.markee))))
  }
  return results
}
type Override = { contentHash?: string; nameHash?: string; scope?: string }
async function evaluateTrusted(id: string, message: string, board: string, manual: { board: boolean; site: boolean }, severity: ModerationSeverity = 'standard', name = '', publish = true): Promise<PublishedModeration> {
  const hash = contentHash(message), nameHash = contentHash(name)
  const base = { markee: id.toLowerCase(), board, contentHash: hash, nameHash, policyVersion: AUTO_POLICY }
  if (manual.board) return { ...base, state: 'manual-flagged', siteState: 'manual-flagged' }
  const verdict = checkDraft(message, severity, name)
  // Overrides stay keyed by the message hash. One recorded before names were judged (no nameHash) still
  // covers the message, but a flagged name is only cleared by an approval of that exact name.
  const covers = (o: Override | null) => !!o && (!verdict.nameFlagged || o.nameHash === nameHash)
  base.policyVersion = verdict.policyVersion
  if (!verdict.enabled) return { ...base, state: 'visible', siteState: manual.site ? 'manual-flagged' : 'visible' }
  let state: Visibility = verdict.state === 'pass' ? 'visible' : verdict.state
  try {
    const [siteOverride, sharedOverride, previous] = await Promise.all([
      verdict.state === 'soft-flagged' ? automaticDeps.get<Override>(overrideKey(id, hash)) : null,
      verdict.state === 'soft-flagged' ? automaticDeps.get<Override>(sharedOverrideKey(id, hash)) : null,
      publish && severity === 'standard' ? automaticDeps.get<PublishedModeration>(softKey(id)) : null,
    ])
    if (sharedOverride?.scope === 'all' && sharedOverride.contentHash === hash && covers(sharedOverride)) state = 'visible'
    const override = covers(siteOverride)
    const result: PublishedModeration = { ...base, state, siteState: manual.site ? 'manual-flagged' : override ? 'visible' : state, ...(verdict.reason ? { reason: verdict.reason, reasonCodes: verdict.reasonCodes } : {}) }
    // Per-integration presets never mutate the global Standard moderation queue/index.
    if (!publish || severity !== 'standard') return result
    if (previous?.contentHash === hash && previous?.nameHash === nameHash && previous?.state === state && previous?.siteState === result.siteState && previous?.policyVersion === AUTO_POLICY) return result
    const pipeline = automaticDeps.pipeline()
    pipeline.set(softKey(id), result)
    if (state !== 'visible') pipeline.sadd(SOFT_INDEX, id.toLowerCase())
    else pipeline.srem(SOFT_INDEX, id.toLowerCase())
    if (previous?.contentHash !== hash || previous?.nameHash !== nameHash || previous?.state !== state || previous?.siteState !== result.siteState || previous?.policyVersion !== AUTO_POLICY) pipeline.set('sdk:snapshots:generation', randomUUID())
    await pipeline.exec()
    return result
  } catch {
    return { ...base, state: 'unavailable', siteState: manual.site ? 'manual-flagged' : 'unavailable', reason: 'Moderation check unavailable' }
  }
}
async function readPublishedDisplay(ids: string[], cachedIds: Set<string>): Promise<Observation[]> {
  const hits = await automaticDeps.readDisplayCache(ids.map(displayObservationKey)).catch(() => [])
  const cached: Observation[] = []
  const missing = ids.filter((id, i) => {
    const hit = hits[i]
    if (!hit || hit.markee !== id || typeof hit.name !== 'string') return true
    cached.push(hit)
    cachedIds.add(id)
    return false
  })
  if (!missing.length) return cached
  const fresh = await automaticDeps.read(missing)
  const complete = fresh.filter(observation => typeof observation.name === 'string')
  if (complete.length) await automaticDeps.writeDisplayCache(complete).catch(() => {})
  return [...cached, ...fresh]
}

export async function checkPublished(ids: string[], severity: ModerationSeverity | ((board: string) => Promise<ModerationSeverity>) = 'standard', options?: { displayCache: boolean }): Promise<PublishedModeration[]> {
  const cachedIds = new Set<string>()
  const [observations, flags] = await Promise.all([
    options?.displayCache ? readPublishedDisplay(ids, cachedIds) : automaticDeps.read(ids),
    automaticDeps.flags(),
  ])
  const boardFlags = new Set(flags.board), siteFlags = new Set(flags.site)
  const byId = new Map(observations.map(o => [o.markee.toLowerCase(), o]))
  return Promise.all(ids.map(async id => {
    const o = byId.get(id.toLowerCase())
    return o ? evaluateTrusted(o.markee, o.message, o.board, { board: boardFlags.has(flagKey(o.markee)), site: siteFlags.has(flagKey(o.markee)) }, typeof severity === 'function' ? await severity(o.board) : severity, o.name ?? '', !cachedIds.has(o.markee)) : unavailable(id)
  }))
}
export async function softRecords(): Promise<PublishedModeration[]> {
  if (!autoEnabled()) return []
  const ids = await automaticDeps.members()
  if (!ids.length) return []
  const records = await automaticDeps.mget(...ids.map(softKey))
  const valid = records.filter((r): r is PublishedModeration => !!r && r.state !== 'visible' && typeof r.board === 'string')
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
    const accepted = batch.filter((_, i) => trusted[i] === true)
    const stale = accepted.filter(r => r.policyVersion !== AUTO_POLICY)
    const refreshed = stale.length ? await checkPublished(stale.map(r => r.markee)) : []
    if (refreshed.some(r => r.state === 'unavailable')) throw new Error('Moderation policy refresh unavailable')
    output.push(...accepted.filter(r => r.policyVersion === AUTO_POLICY), ...refreshed.filter(r => r.state !== 'visible'))
  }
  return output
}
