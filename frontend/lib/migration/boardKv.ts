import { createPublicClient, http, parseAbi, parseAbiItem, type Address } from 'viem'
import { base } from 'viem/chains'
import { BOARD_MIGRATORS, V14_FACTORIES_DEPLOY_BLOCK } from '@/lib/contracts/addresses'

export const MIGRATION_OPERATOR = '0x2677759f547fb4fcbcf1be70c7ac280b1d9b4ca1'
export const MERGE_LEDGER_KEY = 'migration:board-kv:v14:merged'
export const COPIED_BOARDS_KEY = 'migration:board-kv:v14:copied'
export const LOG_CURSOR_KEY = 'migration:board-kv:v14:logs'
const MIGRATION_FINISHED = 2
const ADDRESS = /0x[0-9a-fA-F]{40}/g
const READ_BATCH = 200
const WRITE_BATCH = 200
const SCAN_COUNT = 1000
const LOG_RANGE = 10_000n

export const MIGRATION_STARTED = parseAbiItem('event MigrationStarted(address indexed legacyBoard, address indexed successor)')
export const MARKEE_COPIED = parseAbiItem('event MarkeeCopied(address indexed legacyBoard, address indexed legacyMarkee, address indexed successorMarkee, uint256 totalFundsAdded)')
export const BOARD_MIGRATED = parseAbiItem('event BoardMigrated(address indexed legacyBoard, address indexed successor, address indexed admin)')
const MIGRATOR_ABI = parseAbi(['function status(address) view returns (uint8)'])

export const CAS_SCRIPT = "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end return 0"
export const MERGE_COUNTER_SCRIPT = "if redis.call('SADD', KEYS[2], ARGV[1]) == 1 then return redis.call('INCRBY', KEYS[1], ARGV[2]) end return 0"
export const MERGE_HASH_SCRIPT = "if redis.call('SADD', KEYS[2], ARGV[1]) == 1 then for i = 2, #ARGV, 2 do redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1]) end return 1 end return 0"

export type Command = (string | number)[]

export interface KvStore {
  exec(commands: Command[]): Promise<unknown[]>
}

export interface BoardMigration {
  legacy: string
  successor: string
  migrator: string
  startedBlock: bigint
  migratedBlock: bigint
  migratedAt?: number
}

export interface MigrationMap {
  boards: Map<string, BoardMigration>
  markees: Map<string, string>
  markeeBoard: Map<string, string>
}

export type MigrationLog =
  | { eventName: 'MigrationStarted'; migrator: string; blockNumber: bigint; legacyBoard: string; successor: string }
  | { eventName: 'MarkeeCopied'; migrator: string; blockNumber: bigint; legacyBoard: string; legacyMarkee: string; successorMarkee: string }
  | { eventName: 'BoardMigrated'; migrator: string; blockNumber: bigint; legacyBoard: string; successor: string }

export function buildMigrationMap(logs: MigrationLog[], finished: (legacyBoard: string) => boolean): MigrationMap {
  const started = new Map<string, bigint>()
  const boards = new Map<string, BoardMigration>()
  const copies: { legacyBoard: string; legacyMarkee: string; successorMarkee: string }[] = []
  for (const log of logs) {
    const legacyBoard = log.legacyBoard.toLowerCase()
    if (log.eventName === 'MigrationStarted') started.set(legacyBoard, log.blockNumber)
    else if (log.eventName === 'MarkeeCopied') copies.push({ legacyBoard, legacyMarkee: log.legacyMarkee.toLowerCase(), successorMarkee: log.successorMarkee.toLowerCase() })
    else if (finished(legacyBoard)) {
      boards.set(legacyBoard, {
        legacy: legacyBoard,
        successor: log.successor.toLowerCase(),
        migrator: log.migrator.toLowerCase(),
        startedBlock: 0n,
        migratedBlock: log.blockNumber,
      })
    }
  }
  for (const board of boards.values()) board.startedBlock = started.get(board.legacy) ?? board.migratedBlock
  const markees = new Map<string, string>()
  const markeeBoard = new Map<string, string>()
  for (const copy of copies) {
    if (!boards.has(copy.legacyBoard)) continue
    markees.set(copy.legacyMarkee, copy.successorMarkee)
    markeeBoard.set(copy.legacyMarkee, copy.legacyBoard)
  }
  return { boards, markees, markeeBoard }
}

export function restrictMap(map: MigrationMap, { board, only, limit }: { board?: string; only?: ReadonlySet<string>; limit?: number }): MigrationMap {
  let selected = [...map.boards.values()].sort((a, b) => (a.migratedBlock < b.migratedBlock ? -1 : a.migratedBlock > b.migratedBlock ? 1 : a.legacy.localeCompare(b.legacy)))
  if (board) selected = selected.filter(b => b.legacy === board.toLowerCase())
  if (only) selected = selected.filter(b => only.has(b.legacy))
  if (limit !== undefined) selected = selected.slice(0, limit)
  const boards = new Map(selected.map(b => [b.legacy, b]))
  const markees = new Map([...map.markees].filter(([legacy]) => boards.has(map.markeeBoard.get(legacy) ?? '')))
  const markeeBoard = new Map([...map.markeeBoard].filter(([legacy]) => markees.has(legacy)))
  return { boards, markees, markeeBoard }
}

export type Role = 'board' | 'markee' | 'any'
type Action = 'copy' | 'counter' | 'hash-counter' | 'hash-fields' | 'zset-members' | 'creator' | 'skip'

export interface RewriteContext {
  map: MigrationMap
  legacy: string
  successor: string
  board?: BoardMigration
}

type Rewritten = { value: string } | { skip: string }
type StringRewrite = (raw: string, ctx: RewriteContext) => Rewritten
type FieldRewrite = (field: string, raw: string, ctx: RewriteContext) => Rewritten

export interface KeyRule {
  name: string
  pattern: RegExp
  role: Role
  action: Action
  reason?: string
  rewrite?: StringRewrite
  rewriteField?: FieldRewrite
}

const A = '(0x[0-9a-fA-F]{40})'
const rule = (name: string, pattern: string, role: Role, action: Action, extra: Partial<KeyRule> = {}): KeyRule =>
  ({ name, pattern: new RegExp(`^${pattern}$`), role, action, ...extra })

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return undefined }
}

const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '')

export function mapAddresses(text: string, lookup: (address: string) => string | undefined): string | null {
  let mapped = false
  const next = text.replace(ADDRESS, match => {
    const successor = lookup(match.toLowerCase())
    if (!successor) return match
    mapped = true
    return successor
  })
  return mapped ? next : null
}

export const rewriteModerationRecord: StringRewrite = (raw, ctx) => {
  const record = parseJson(raw) as Record<string, unknown> | undefined
  if (!record || typeof record !== 'object') return { skip: 'value is not JSON' }
  if (lower(record.markee) !== ctx.legacy) return { skip: 'record markee does not match its key' }
  const legacyBoard = lower(record.board) || ctx.map.markeeBoard.get(ctx.legacy)
  const successorBoard = legacyBoard ? ctx.map.boards.get(legacyBoard)?.successor : undefined
  const next: Record<string, unknown> = { ...record, markee: ctx.successor }
  if (record.board !== undefined) {
    if (!successorBoard) return { skip: 'record board is not migrated' }
    next.board = successorBoard
  }
  return { value: JSON.stringify(next) }
}

export const rewriteReaction: FieldRewrite = (_field, raw, ctx) => {
  const reaction = parseJson(raw) as Record<string, unknown> | undefined
  if (!reaction || typeof reaction !== 'object') return { skip: 'reaction is not JSON' }
  const id = typeof reaction.id === 'string' ? mapAddresses(reaction.id, a => (a === ctx.legacy ? ctx.successor : undefined)) ?? reaction.id : reaction.id
  return { value: JSON.stringify({ ...reaction, id, markeeAddress: ctx.successor }) }
}

export interface TopSpan { markee: string; from: number; to: number | null }

export function truncateSpans(spans: TopSpan[], at: number): TopSpan[] {
  const kept = spans.filter(span => span.from <= at).map(span => ({ ...span }))
  const last = kept[kept.length - 1]
  if (last && (last.to === null || last.to > at)) last.to = null
  return kept
}

export const rewriteTopHistory: StringRewrite = (raw, ctx) => {
  const stored = parseJson(raw) as { spans?: TopSpan[]; scannedTo?: string; totals?: [string, string][] } | undefined
  if (!stored || !Array.isArray(stored.spans) || typeof stored.scannedTo !== 'string') return { skip: 'value is not a top history' }
  if (!ctx.board) return { skip: 'no board migration context' }
  const scannedTo = BigInt(stored.scannedTo)
  const pastMigration = scannedTo > ctx.board.migratedBlock
  if (pastMigration && ctx.board.migratedAt === undefined) return { skip: 'migration block timestamp unknown' }
  const spans = (pastMigration ? truncateSpans(stored.spans, ctx.board.migratedAt!) : stored.spans)
    .map(span => ({ ...span, markee: ctx.map.markees.get(span.markee.toLowerCase()) ?? span.markee }))
  const next: Record<string, unknown> = { ...stored, spans, scannedTo: (pastMigration ? ctx.board.migratedBlock : scannedTo).toString() }
  if (stored.totals) {
    next.totals = stored.totals.flatMap(([markee, total]) => {
      const successor = ctx.map.markees.get(markee.toLowerCase())
      return successor ? [[successor, total]] : []
    })
  }
  return { value: JSON.stringify(next) }
}

export const rewriteBackingHistory: StringRewrite = (raw, ctx) => {
  const stored = parseJson(raw) as { backers?: Record<string, string[]>; scannedTo?: string } | undefined
  if (!stored || typeof stored.backers !== 'object' || stored.backers === null) return { skip: 'value is not a backing history' }
  if (!ctx.board) return { skip: 'no board migration context' }
  const backers = Object.fromEntries(Object.entries(stored.backers).flatMap(([backer, markees]) => {
    const mapped = [...new Set(markees.flatMap(m => ctx.map.markees.get(m.toLowerCase()) ?? []))]
    return mapped.length ? [[backer, mapped]] : []
  }))
  if (Object.keys(backers).length === 0) return { skip: 'no backed markee was copied' }
  return { value: JSON.stringify({ backers, scannedTo: (ctx.board.startedBlock - 1n).toString() }) }
}

export const rewriteTopSince: StringRewrite = (raw, ctx) => {
  const stored = parseJson(raw) as { address?: string; since?: number } | undefined
  if (!stored || typeof stored.address !== 'string') return { skip: 'value is not a top-since record' }
  const successor = ctx.map.markees.get(stored.address.toLowerCase())
  if (!successor) return { skip: 'top markee was not copied' }
  return { value: JSON.stringify({ ...stored, address: successor }) }
}

const CACHE_REASON = 'cache or short-lived entry, rebuilt on demand'

export const KEY_RULES: KeyRule[] = [
  rule('cache', `(cache|dedup|balance|sdk|listings|ratelimit|rental-lifetime):.*`, 'any', 'skip', { reason: CACHE_REASON }),
  rule('views:total', `views:total:${A}`, 'any', 'counter'),
  rule('views:msg', `views:msg:${A}:[^:]+`, 'any', 'counter'),
  rule('views:url:last', `views:url:last:${A}:.+`, 'any', 'copy'),
  rule('views:url', `views:url:${A}:.+`, 'any', 'counter'),
  rule('views:daily', `views:daily:${A}`, 'any', 'hash-counter'),
  rule('views:github:last', `views:github:last:${A}`, 'board', 'copy'),
  rule('views:github:credited', `views:github:credited:${A}`, 'board', 'copy'),
  rule('views:github', `views:github:${A}`, 'board', 'skip', { reason: 'one-hour GitHub traffic cache' }),
  rule('moderation:item', `moderation:item:8453:${A}`, 'markee', 'copy', { rewrite: rewriteModerationRecord }),
  rule('moderation:pending', `moderation:pending:${A}`, 'board', 'zset-members'),
  rule('moderation:moderators', `moderation:moderators:${A}`, 'board', 'copy'),
  rule('moderation:board-policy', `moderation:board-policy:8453:${A}`, 'board', 'copy'),
  rule('moderation:auto:site-override', `moderation:auto:site-override:8453:${A}:[0-9a-f]+`, 'markee', 'copy'),
  rule('moderation:auto:all-override', `moderation:auto:all-override:8453:${A}:[0-9a-f]+`, 'markee', 'copy'),
  rule('moderation:auto', `moderation:auto:8453:${A}`, 'markee', 'copy', { rewrite: rewriteModerationRecord }),
  rule('moderation:scan', `moderation:scan:v2:${A}`, 'board', 'skip', { reason: 'scan checkpoint of the legacy markeeCount and ids; the successor builds its own and the copied items keep its messages from re-queueing' }),
  rule('creator', `creator:(?:sf|gh|oi|fs):${A}`, 'board', 'creator'),
  rule('github:markee', `github:markee:${A}`, 'board', 'copy'),
  rule('github:contract', `github:contract:${A}`, 'board', 'copy'),
  rule('github:synced', `github:synced:${A}`, 'board', 'skip', { reason: 'sync signature; the successor must resync so its own delimiters are written' }),
  rule('oi:meta', `oi:meta:${A}`, 'board', 'copy'),
  rule('board:featured', `board:featured:${A}`, 'board', 'copy'),
  rule('board:tophistory', `board:tophistory:${A}`, 'board', 'copy', { rewrite: rewriteTopHistory }),
  rule('streaming:board', `streaming:board:${A}`, 'board', 'copy'),
  rule('streaming:backing', `streaming:backing:${A}`, 'board', 'copy', { rewrite: rewriteBackingHistory }),
  rule('streaming:topsince', `streaming:topsince:${A}`, 'board', 'copy', { rewrite: rewriteTopSince }),
  rule('streaming:lifetime', `streaming:lifetime:${A}:${A}:${A}`, 'board', 'skip', { reason: 'per-stream replay checkpoint; streams stay on the legacy board' }),
  rule('superfluid:s6:baseline', `superfluid:s6:baseline:${A}`, 'board', 'copy'),
  rule('stats:raised', `stats:raised:${A}`, 'board', 'hash-fields'),
  rule('reactions:v2', `reactions:v2:${A}`, 'markee', 'hash-fields', { rewriteField: rewriteReaction }),
]

export interface Classified {
  rule: KeyRule
  legacy: string
  successor: string
  successorKey: string
  board?: BoardMigration
}

export type Classification = Classified | { unclassified: string } | { mismatch: string } | null

export function classifyKey(key: string, map: MigrationMap, rules: KeyRule[] = KEY_RULES): Classification {
  const legacyAddress = (key.match(ADDRESS) ?? []).map(a => a.toLowerCase()).find(a => map.boards.has(a) || map.markees.has(a))
  if (!legacyAddress) return null
  const matched = rules.find(r => r.pattern.test(key))
  if (!matched) return { unclassified: key }
  const captured = key.match(matched.pattern)?.[1]?.toLowerCase() ?? legacyAddress
  const board = map.boards.get(captured)
  const markee = map.markees.get(captured)
  const successor = matched.role === 'board' ? board?.successor : matched.role === 'markee' ? markee : board?.successor ?? markee
  if (!successor) return matched.action === 'skip' ? { rule: matched, legacy: captured, successor: '', successorKey: '' } : { mismatch: key }
  const at = key.toLowerCase().indexOf(captured)
  const successorKey = key.slice(0, at) + successor + key.slice(at + captured.length)
  const boardContext = board ?? map.boards.get(map.markeeBoard.get(captured) ?? '')
  return { rule: matched, legacy: captured, successor, successorKey, board: boardContext }
}

export type Snapshot =
  | { type: 'none' }
  | { type: 'string'; value: string; pttl: number }
  | { type: 'hash'; value: Record<string, string> }
  | { type: 'zset'; value: { member: string; score: string }[] }
  | { type: 'set'; value: string[] }
  | { type: 'other'; redisType: string }

export type Status = 'write' | 'merge' | 'replace' | 'exists' | 'done' | 'skip'

export interface PlanEntry {
  rule: string
  legacyKey: string
  successorKey: string
  status: Status
  detail?: string
  commands: Command[]
}

const unquote = (value: string) => value.replace(/^"|"$/g, '').toLowerCase()

function isInteger(value: string): boolean {
  return /^-?\d+$/.test(value)
}

function setCommand(key: string, value: string, pttl: number): Command {
  return pttl > 0 ? ['SET', key, value, 'NX', 'PX', pttl] : ['SET', key, value, 'NX']
}

export function planClassified(c: Classified, legacyKey: string, source: Snapshot, target: Snapshot, merged: boolean, map: MigrationMap): PlanEntry {
  const entry = (status: Status, commands: Command[] = [], detail?: string): PlanEntry =>
    ({ rule: c.rule.name, legacyKey, successorKey: c.successorKey, status, commands, ...(detail ? { detail } : {}) })
  const ctx: RewriteContext = { map, legacy: c.legacy, successor: c.successor, board: c.board }
  const { rule: r } = c
  if (r.action === 'skip') return entry('skip', [], r.reason)
  if (source.type === 'none') return entry('skip', [], 'legacy key vanished')
  const expected = r.action === 'copy' || r.action === 'counter' || r.action === 'creator' ? 'string'
    : r.action === 'zset-members' ? 'zset' : 'hash'
  if (source.type !== expected) return entry('skip', [], `unexpected type ${source.type === 'other' ? source.redisType : source.type}`)
  if (target.type !== 'none' && target.type !== expected) return entry('skip', [], `successor holds a ${target.type === 'other' ? target.redisType : target.type}`)

  if (source.type === 'string') {
    if (r.action === 'counter') {
      if (!isInteger(source.value) || BigInt(source.value) <= 0n) return entry('skip', [], 'nothing to add')
      if (merged) return entry('done')
      return entry(target.type === 'none' ? 'write' : 'merge', [['EVAL', MERGE_COUNTER_SCRIPT, 2, c.successorKey, MERGE_LEDGER_KEY, legacyKey, source.value]], `+${source.value}`)
    }
    if (r.action === 'creator') {
      const creator = unquote(source.value)
      if (target.type === 'none') return entry('write', [setCommand(c.successorKey, source.value, source.pttl)])
      const current = (target as { value: string }).value
      if (unquote(current) === creator) return entry('done')
      if (unquote(current) !== MIGRATION_OPERATOR) return entry('exists', [], `successor creator ${unquote(current)} kept`)
      if (creator === MIGRATION_OPERATOR) return entry('skip', [], 'legacy creator is the migration operator too')
      return entry('replace', [['EVAL', CAS_SCRIPT, 1, c.successorKey, current, source.value]], `operator -> ${creator}`)
    }
    const rewritten = r.rewrite ? r.rewrite(source.value, ctx) : { value: source.value }
    if ('skip' in rewritten) return entry('skip', [], rewritten.skip)
    if (target.type === 'none') return entry('write', [setCommand(c.successorKey, rewritten.value, source.pttl)])
    return (target as { value: string }).value === rewritten.value ? entry('done') : entry('exists', [], 'successor value kept')
  }

  if (source.type === 'hash') {
    const current = target.type === 'hash' ? target.value : {}
    if (r.action === 'hash-counter') {
      const fields = Object.entries(source.value).filter(([, v]) => isInteger(v) && BigInt(v) > 0n)
      if (fields.length === 0) return entry('skip', [], 'nothing to add')
      if (merged) return entry('done')
      return entry(target.type === 'none' ? 'write' : 'merge', [['EVAL', MERGE_HASH_SCRIPT, 2, c.successorKey, MERGE_LEDGER_KEY, legacyKey, ...fields.flat()]], `${fields.length} fields`)
    }
    const commands: Command[] = []
    const skipped: string[] = []
    for (const [field, value] of Object.entries(source.value)) {
      if (field in current) continue
      const rewritten = r.rewriteField ? r.rewriteField(field, value, ctx) : { value }
      if ('skip' in rewritten) skipped.push(`${field}: ${rewritten.skip}`)
      else commands.push(['HSETNX', c.successorKey, field, rewritten.value])
    }
    const detail = [commands.length ? `${commands.length} fields` : '', skipped.length ? `skipped ${skipped.join('; ')}` : ''].filter(Boolean).join(', ')
    if (commands.length === 0) return entry(skipped.length ? 'skip' : 'done', [], detail || undefined)
    return entry(target.type === 'none' ? 'write' : 'merge', commands, detail)
  }

  if (source.type === 'zset') {
    const present = new Set(target.type === 'zset' ? target.value.map(m => m.member.toLowerCase()) : [])
    const additions = source.value.flatMap(({ member, score }) => {
      const successor = ctx.map.markees.get(member.toLowerCase())
      return successor && !present.has(successor) ? [[score, successor]] : []
    })
    if (additions.length === 0) return entry('done')
    return entry(target.type === 'none' ? 'write' : 'merge', [['ZADD', c.successorKey, 'NX', ...additions.flat()]], `${additions.length} members`)
  }

  return entry('skip', [], 'unsupported type')
}

export function planMemberSet(key: string, members: string[], map: MigrationMap): PlanEntry {
  const present = new Set(members.map(m => m.toLowerCase()))
  const additions = [...new Set(members.flatMap(member => {
    const mapped = mapAddresses(member.toLowerCase(), a => map.markees.get(a))
    return mapped && !present.has(mapped) ? [mapped] : []
  }))]
  return { rule: key, legacyKey: key, successorKey: key, status: additions.length ? 'merge' : 'done', commands: additions.length ? [['SADD', key, ...additions]] : [], ...(additions.length ? { detail: `${additions.length} members` } : {}) }
}

export function planMemberZset(key: string, members: { member: string; score: string }[], map: MigrationMap): PlanEntry {
  const present = new Set(members.map(m => m.member.toLowerCase()))
  const additions = members.flatMap(({ member, score }) => {
    const mapped = map.markees.get(member.toLowerCase())
    return mapped && !present.has(mapped) ? [[score, mapped]] : []
  })
  return { rule: key, legacyKey: key, successorKey: key, status: additions.length ? 'merge' : 'done', commands: additions.length ? [['ZADD', key, 'NX', ...additions.flat()]] : [], ...(additions.length ? { detail: `${additions.length} members` } : {}) }
}

export function planTopsHash(key: string, tops: Record<string, string>, map: MigrationMap): PlanEntry {
  const commands: Command[] = []
  for (const [board, markee] of Object.entries(tops)) {
    const successorBoard = map.boards.get(board.toLowerCase())?.successor
    const successorMarkee = map.markees.get(markee.toLowerCase())
    if (!successorBoard || !successorMarkee || successorBoard in tops) continue
    commands.push(['HSETNX', key, successorBoard, successorMarkee])
  }
  return { rule: key, legacyKey: key, successorKey: key, status: commands.length ? 'merge' : 'done', commands, ...(commands.length ? { detail: `${commands.length} boards` } : {}) }
}

export function rewriteBoostedList(raw: string, map: MigrationMap): string | null {
  const list = parseJson(raw)
  if (!Array.isArray(list)) return null
  const present = new Set(list.map(entry => lower(entry?.address)))
  const additions = list.flatMap(entry => {
    const successor = map.boards.get(lower(entry?.address))?.successor
    if (!successor || present.has(successor)) return []
    present.add(successor)
    return [{ ...entry, address: successor }]
  })
  return additions.length ? JSON.stringify([...list, ...additions]) : null
}

export function rewriteBoostHistory(raw: string, map: MigrationMap): string | null {
  const history = parseJson(raw)
  if (!Array.isArray(history)) return null
  let changed = false
  const next = history.map(version => {
    const multipliers: Record<string, number> = { ...(version?.multipliers ?? {}) }
    for (const [board, multiplier] of Object.entries(multipliers)) {
      const successor = map.boards.get(board.toLowerCase())?.successor
      if (!successor || successor in multipliers) continue
      multipliers[successor] = multiplier
      changed = true
    }
    return { ...version, multipliers }
  })
  return changed ? JSON.stringify(next) : null
}

export function planJsonRewrite(key: string, raw: string | null, rewrite: (raw: string, map: MigrationMap) => string | null, map: MigrationMap): PlanEntry {
  const next = raw === null ? null : rewrite(raw, map)
  return { rule: key, legacyKey: key, successorKey: key, status: next === null ? 'done' : 'merge', commands: next === null ? [] : [['EVAL', CAS_SCRIPT, 1, key, raw!, next]] }
}

async function execChunked(store: KvStore, commands: Command[], size: number): Promise<unknown[]> {
  const out: unknown[] = []
  for (let i = 0; i < commands.length; i += size) out.push(...await store.exec(commands.slice(i, i + size)))
  return out
}

function pairs(flat: unknown): [string, string][] {
  if (!Array.isArray(flat)) return []
  const out: [string, string][] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([String(flat[i]), String(flat[i + 1])])
  return out
}

export async function readSnapshots(store: KvStore, keys: string[]): Promise<Snapshot[]> {
  if (keys.length === 0) return []
  const meta = await execChunked(store, keys.flatMap(k => [['TYPE', k], ['PTTL', k]]), READ_BATCH * 2)
  const types = keys.map((_, i) => String(meta[i * 2]))
  const ttls = keys.map((_, i) => Number(meta[i * 2 + 1]))
  const valueCommands: Command[] = keys.map((k, i) => {
    const type = types[i]
    if (type === 'string') return ['GET', k]
    if (type === 'hash') return ['HGETALL', k]
    if (type === 'zset') return ['ZRANGE', k, 0, -1, 'WITHSCORES']
    if (type === 'set') return ['SMEMBERS', k]
    return ['EXISTS', k]
  })
  const values = await execChunked(store, valueCommands, READ_BATCH)
  return keys.map((_, i): Snapshot => {
    const type = types[i]
    const value = values[i]
    if (type === 'none') return { type: 'none' }
    if (type === 'string') return value === null ? { type: 'none' } : { type: 'string', value: String(value), pttl: ttls[i] }
    if (type === 'hash') return { type: 'hash', value: Object.fromEntries(pairs(value)) }
    if (type === 'zset') return { type: 'zset', value: pairs(value).map(([member, score]) => ({ member, score })) }
    if (type === 'set') return { type: 'set', value: Array.isArray(value) ? value.map(String) : [] }
    return { type: 'other', redisType: type }
  })
}

export async function scanKeys(store: KvStore, match: string): Promise<string[]> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [result] = await store.exec([['SCAN', cursor, 'MATCH', match, 'COUNT', SCAN_COUNT]])
    const [next, batch] = result as [string | number, string[]]
    cursor = String(next)
    keys.push(...batch)
  } while (cursor !== '0')
  return [...new Set(keys)]
}

export const MEMBER_SET_KEYS = ['reactions:markees', 'moderation:flagged', 'moderation:flagged:site', 'moderation:auto:soft:8453']
export const MEMBER_ZSET_KEYS = ['moderation:pending:site']
export const TOPS_HASH_KEY = 'activity:tops:8453'
export const BOOSTED_KEY = 'superfluid:s6:boosted'
export const BOOST_HISTORY_MATCH = 'superfluid:streaming-campaign:*:boost-history'

export interface Plan {
  entries: PlanEntry[]
  unclassified: string[]
  mismatched: string[]
  scanned: number
}

export async function buildPlan(store: KvStore, map: MigrationMap): Promise<Plan> {
  const scanned = await scanKeys(store, '*0x*')
  const unclassified: string[] = []
  const mismatched: string[] = []
  const work: { key: string; classified: Classified }[] = []
  for (const key of scanned) {
    const result = classifyKey(key, map)
    if (!result) continue
    if ('unclassified' in result) unclassified.push(result.unclassified)
    else if ('mismatch' in result) mismatched.push(result.mismatch)
    else work.push({ key, classified: result })
  }
  const live = work.filter(w => w.classified.rule.action !== 'skip')
  const [sources, targets, mergedFlags] = await Promise.all([
    readSnapshots(store, live.map(w => w.key)),
    readSnapshots(store, live.map(w => w.classified.successorKey)),
    execChunked(store, live.map(w => ['SISMEMBER', MERGE_LEDGER_KEY, w.key]), READ_BATCH),
  ])
  const entries: PlanEntry[] = work
    .filter(w => w.classified.rule.action === 'skip')
    .map(w => ({ rule: w.classified.rule.name, legacyKey: w.key, successorKey: w.classified.successorKey, status: 'skip' as const, commands: [], detail: w.classified.rule.reason }))
  live.forEach((w, i) => entries.push(planClassified(w.classified, w.key, sources[i], targets[i], Number(mergedFlags[i]) === 1, map)))

  const globals = await readSnapshots(store, [...MEMBER_SET_KEYS, ...MEMBER_ZSET_KEYS, TOPS_HASH_KEY, BOOSTED_KEY])
  MEMBER_SET_KEYS.forEach((key, i) => {
    const snap = globals[i]
    if (snap.type === 'set') entries.push(planMemberSet(key, snap.value, map))
  })
  MEMBER_ZSET_KEYS.forEach((key, i) => {
    const snap = globals[MEMBER_SET_KEYS.length + i]
    if (snap.type === 'zset') entries.push(planMemberZset(key, snap.value, map))
  })
  const tops = globals[MEMBER_SET_KEYS.length + MEMBER_ZSET_KEYS.length]
  if (tops.type === 'hash') entries.push(planTopsHash(TOPS_HASH_KEY, tops.value, map))
  const boosted = globals[MEMBER_SET_KEYS.length + MEMBER_ZSET_KEYS.length + 1]
  if (boosted.type === 'string') entries.push(planJsonRewrite(BOOSTED_KEY, boosted.value, rewriteBoostedList, map))
  const historyKeys = await scanKeys(store, BOOST_HISTORY_MATCH)
  const histories = await readSnapshots(store, historyKeys)
  historyKeys.forEach((key, i) => {
    const snap = histories[i]
    if (snap.type === 'string') entries.push(planJsonRewrite(key, snap.value, rewriteBoostHistory, map))
  })
  return { entries, unclassified, mismatched, scanned: scanned.length }
}

export async function executePlan(store: KvStore, plan: Plan): Promise<number> {
  const commands = plan.entries.flatMap(e => e.commands)
  await execChunked(store, commands, WRITE_BATCH)
  return commands.length
}

const READ_COMMANDS = new Set(['SCAN', 'TYPE', 'PTTL', 'GET', 'HGETALL', 'ZRANGE', 'SMEMBERS', 'SISMEMBER', 'EXISTS'])

export function readOnly(store: KvStore): KvStore {
  return {
    exec(commands) {
      const write = commands.find(c => !READ_COMMANDS.has(String(c[0]).toUpperCase()))
      if (write) return Promise.reject(new Error(`dry run refused ${write[0]}`))
      return store.exec(commands)
    },
  }
}

export function restStore(url: string, token: string): KvStore {
  const endpoint = `${url.replace(/\/$/, '')}/pipeline`
  return {
    async exec(commands) {
      if (commands.length === 0) return []
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands.map(c => c.map(String))),
      })
      if (!res.ok) throw new Error(`KV request failed with HTTP ${res.status}`)
      const rows = await res.json() as { result?: unknown; error?: string }[]
      return rows.map((row, i) => {
        if (row.error) throw new Error(`${commands[i][0]} failed: ${row.error}`)
        return row.result
      })
    },
  }
}

export type Client = ReturnType<typeof createPublicClient>

const RATE_LIMITED = /429|rate|limit reached|too many|timed out|took too long/i
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function withRetry<T>(read: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      if (attempt >= attempts || !RATE_LIMITED.test(String(error instanceof Error ? error.message : error))) throw error
      await sleep(1000 * 2 ** attempt)
    }
  }
}

async function migratorLogs(client: Client, migrator: Address, fromBlock: bigint, toBlock: bigint): Promise<MigrationLog[]> {
  try {
    const logs = await withRetry(() => client.getLogs({ address: migrator, events: [MIGRATION_STARTED, MARKEE_COPIED, BOARD_MIGRATED], fromBlock, toBlock }))
    return logs.flatMap((log): MigrationLog[] => {
      const blockNumber = log.blockNumber ?? 0n
      const args = log.args as Record<string, string>
      if (log.eventName === 'MigrationStarted') return [{ eventName: 'MigrationStarted', migrator, blockNumber, legacyBoard: args.legacyBoard, successor: args.successor }]
      if (log.eventName === 'MarkeeCopied') return [{ eventName: 'MarkeeCopied', migrator, blockNumber, legacyBoard: args.legacyBoard, legacyMarkee: args.legacyMarkee, successorMarkee: args.successorMarkee }]
      if (log.eventName === 'BoardMigrated') return [{ eventName: 'BoardMigrated', migrator, blockNumber, legacyBoard: args.legacyBoard, successor: args.successor }]
      return []
    })
  } catch (error) {
    if (toBlock <= fromBlock || RATE_LIMITED.test(String(error instanceof Error ? error.message : error))) throw error
    const mid = fromBlock + (toBlock - fromBlock) / 2n
    return [...await migratorLogs(client, migrator, fromBlock, mid), ...await migratorLogs(client, migrator, mid + 1n, toBlock)]
  }
}

export async function fetchMigrationLogs(client: Client, fromBlock: bigint, toBlock: bigint): Promise<MigrationLog[]> {
  const logs: MigrationLog[] = []
  for (const migrator of Object.values(BOARD_MIGRATORS)) {
    for (let from = fromBlock; from <= toBlock; from += LOG_RANGE) {
      const to = from + LOG_RANGE - 1n < toBlock ? from + LOG_RANGE - 1n : toBlock
      logs.push(...await migratorLogs(client, migrator, from, to))
    }
  }
  return logs
}

export async function finishedMigrationMap(client: Client, logs: MigrationLog[]): Promise<MigrationMap> {
  const candidates = [...new Map(logs.filter(l => l.eventName === 'BoardMigrated').map(l => [l.legacyBoard.toLowerCase(), l.migrator])).entries()]
  const statuses = candidates.length === 0 ? [] : await withRetry(() => client.multicall({
    allowFailure: false,
    contracts: candidates.map(([board, migrator]) => ({ address: migrator as Address, abi: MIGRATOR_ABI, functionName: 'status' as const, args: [board as Address] })),
  }))
  const finished = new Set(candidates.filter((_, i) => Number(statuses[i]) === MIGRATION_FINISHED).map(([board]) => board))
  return buildMigrationMap(logs, board => finished.has(board))
}

export async function loadMigrationMap(client: Client, fromBlock: bigint = V14_FACTORIES_DEPLOY_BLOCK): Promise<MigrationMap> {
  const head = await withRetry(() => client.getBlockNumber())
  return finishedMigrationMap(client, await fetchMigrationLogs(client, fromBlock, head))
}

export async function attachTimestamps(client: Client, map: MigrationMap) {
  const blocks = [...new Set([...map.boards.values()].map(b => b.migratedBlock))]
  const times = new Map<bigint, number>()
  for (const blockNumber of blocks) times.set(blockNumber, Number((await withRetry(() => client.getBlock({ blockNumber }))).timestamp))
  for (const board of map.boards.values()) board.migratedAt = times.get(board.migratedBlock)
}
