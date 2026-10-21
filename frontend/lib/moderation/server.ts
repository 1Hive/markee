import 'server-only'
import { kv } from '@vercel/kv'
import { createPublicClient, getAddress, http } from 'viem'
import { base } from 'viem/chains'
import { ADMIN_ADDRESSES } from '@/lib/moderation/config'
import { internalHeaders, internalOrigin } from '@/lib/internal-origin'
import { normalizeItem, notifyEventsOf, type EmailFrequency, type ModerationItem, type ModerationScope, type ModeratorEntry, type NotifyEvents } from '@/lib/moderation/queue'

export const BASELINE_KEY = 'moderation:baseline'
export const SCAN_LOCK_KEY = 'moderation:scan:lock'
const BOARDS_CACHE_KEY = 'cache:moderation:boards'
const BOARDS_CACHE_TTL = 60

// Board flags are the ones embeds and integrations honour, so they keep the original key.
export const FLAGGED_KEYS: Record<ModerationScope, string> = {
  board: 'moderation:flagged',
  site: 'moderation:flagged:site',
}
export const PENDING_SITE_KEY = 'moderation:pending:site'
const READ_CHUNK = 500

export const itemKey = (markee: string) => `moderation:item:${base.id}:${markee.toLowerCase()}`
export const moderatorsKey = (board: string) => `moderation:moderators:${board.toLowerCase()}`
// Per-moderator notification state (email set by board admin, frequency set by the moderator).
export const notifyStateKey = (wallet: string) => `moderation:notify:${wallet.toLowerCase()}`
// One-time verification tokens sent to moderator emails.
export const verifyTokenKey = (token: string) => `moderation:verify:${token}`

export interface ModeratorNotifyState {
  email: string
  verified: boolean
  verifiedAt?: number
  // Default 'every' for moderators added with an email; they can change it from /account.
  frequency: EmailFrequency
  // Absent means every event is on (see notifyEventsOf).
  events?: Partial<NotifyEvents>
  setAt: number
}

export interface VerifyToken {
  wallet: string
  email: string
  board: string
  boardName: string
  expiresAt: number
}

export async function readModeratorNotifyStates(
  wallets: string[],
): Promise<Array<{ wallet: string; email: string; verified: boolean; frequency: EmailFrequency; events: NotifyEvents }>> {
  if (wallets.length === 0) return []
  const rows = await kv.mget<(ModeratorNotifyState | null)[]>(...wallets.map(notifyStateKey))
  return wallets.flatMap((wallet, i) => {
    const state = rows[i]
    if (!state?.email) return []
    return [{ wallet, email: state.email, verified: state.verified, frequency: state.frequency, events: notifyEventsOf(state) }]
  })
}
// Board reviews are indexed per board, site reviews in one index across every board.
export const pendingKey = (scope: ModerationScope, board: string) =>
  scope === 'site' ? PENDING_SITE_KEY : `moderation:pending:${board.toLowerCase()}`

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const CREATOR_PLATFORMS = ['sf', 'gh', 'oi', 'fs'] as const

const PRICING_STRATEGY_ABI = [
  { inputs: [], name: 'pricingStrategy', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const
// Same selector on fixed and streaming boards alike.
const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

export interface BoardModerators {
  // Stored as ModeratorEntry[] in new writes; old writes used string[]. normalizeBoardModerators handles both.
  moderators: ModeratorEntry[]
  updatedAt: number
  updatedBy: string
}

function normalizeBoardModerators(raw: BoardModerators): BoardModerators {
  return {
    ...raw,
    moderators: (raw.moderators ?? []).map(m =>
      typeof m === 'string' ? { wallet: m as string } : m,
    ),
  }
}

export function getModerationClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

export function isGlobalAdmin(address: string | null | undefined): boolean {
  if (!address) return false
  return ADMIN_ADDRESSES.some(admin => admin.toLowerCase() === address.toLowerCase())
}

// Embeds match `8453:<lowercase address>`, while older site writes kept whatever case the listing
// API returned, so writes are lowercased and removals clear both spellings.
export function flagKey(markee: string): string {
  return `${base.id}:${markee.toLowerCase()}`
}

export function markeeOfFlagKey(key: string): string {
  return key.slice(key.indexOf(':') + 1)
}

export function flagKeyVariants(markee: string): string[] {
  const keys = [flagKey(markee)]
  try { keys.push(`${base.id}:${getAddress(markee)}`) } catch { /* not an address */ }
  keys.push(`${base.id}:${markee}`)
  return [...new Set(keys)]
}

export async function readFlagged(scope: ModerationScope): Promise<string[]> {
  const raw = (await kv.smembers(FLAGGED_KEYS[scope])) ?? []
  return [...new Set(raw.map(k => k.toLowerCase()))]
}

export async function readAllFlagged(): Promise<Record<ModerationScope, string[]>> {
  const [board, site] = await Promise.all([readFlagged('board'), readFlagged('site')])
  return { board, site }
}

export async function readBoardModerators(boards: string[]): Promise<BoardModerators[]> {
  if (boards.length === 0) return []
  const rows = await kv.mget<(BoardModerators | null)[]>(...boards.map(moderatorsKey))
  return rows.map(r => r ? normalizeBoardModerators(r) : { moderators: [], updatedAt: 0, updatedBy: '' })
}

// A board's owners are its on-chain admin() and its KV-cached creator. They always moderate the
// board and are the only wallets that can change its moderator list.
export async function readBoardOwners(boards: string[]): Promise<string[][]> {
  if (boards.length === 0) return []
  const [adminReads, creators] = await Promise.all([
    getModerationClient().multicall({
      contracts: boards.map(b => ({ address: b as `0x${string}`, abi: ADMIN_ABI, functionName: 'admin' as const })),
    }),
    kv.mget<(string | null)[]>(...boards.flatMap(b => CREATOR_PLATFORMS.map(p => `creator:${p}:${b.toLowerCase()}`))),
  ])
  return boards.map((_, i) => {
    const admin = adminReads[i]?.status === 'success' ? (adminReads[i].result as string) : null
    const boardCreators = creators.slice(i * CREATOR_PLATFORMS.length, (i + 1) * CREATOR_PLATFORMS.length)
    return [...new Set([admin, ...boardCreators].filter((a): a is string => !!a && a !== ZERO_ADDRESS).map(a => a.toLowerCase()))]
  })
}

// Derives each markee's board on-chain (never from the caller) and returns the scopes the moderator
// reviews it in: `board` where they own or were added as a moderator of that board, `site` for
// global admins. A markee missing from the map can't be reviewed by this moderator.
export async function authorizedScopes(moderator: string, markeeIds: string[]): Promise<{ scopes: Map<string, ModerationScope[]>; boardMap: Map<string, string> }> {
  const mod = moderator.toLowerCase()
  const strategyReads = await getModerationClient().multicall({
    contracts: markeeIds.map(id => ({ address: id as `0x${string}`, abi: PRICING_STRATEGY_ABI, functionName: 'pricingStrategy' as const })),
  })
  const boardOf = markeeIds.map((_, i) => {
    const b = strategyReads[i]?.status === 'success' ? (strategyReads[i].result as string) : null
    return b && b !== ZERO_ADDRESS ? b.toLowerCase() : null
  })

  const boards = [...new Set(boardOf.filter((b): b is string => !!b))]
  const [owners, added] = await Promise.all([readBoardOwners(boards), readBoardModerators(boards)])
  const moderatedBoards = new Set(boards.filter((_, i) => owners[i].includes(mod) || added[i].moderators.some(m => m.wallet === mod)))
  const global = isGlobalAdmin(mod)

  const scopes = new Map<string, ModerationScope[]>()
  const boardMap = new Map<string, string>()
  markeeIds.forEach((id, i) => {
    const s: ModerationScope[] = []
    if (boardOf[i] && moderatedBoards.has(boardOf[i]!)) s.push('board')
    if (global) s.push('site')
    if (s.length > 0) {
      scopes.set(id.toLowerCase(), s)
      if (boardOf[i]) boardMap.set(id.toLowerCase(), boardOf[i]!)
    }
  })
  return { scopes, boardMap }
}

export interface ModeratedBoard {
  address: string
  name: string
  platform: string | null
  strategy: 'fixed' | 'streaming'
  // Owners (admin and creator) plus the moderators they added.
  moderators: string[]
}

type ListedBoard = { address: string; name?: string; platform?: string; admin?: string | null; creator?: string | null; isLegacy?: boolean }

// Every v1.x fixed and streaming board, from the same listing routes /account reads, with added
// moderators merged in. Cached for a minute since every connected wallet polls the queue, and
// cleared when an owner saves moderators (see clearModeratedBoards). Legacy TopDawg strategies are
// excluded: they are not Leaderboard contracts, so the scan never reads them.
export async function listModeratedBoards(): Promise<ModeratedBoard[]> {
  const cached = await kv.get<ModeratedBoard[]>(BOARDS_CACHE_KEY).catch(() => null)
  if (cached) return cached

  const listed = await listBoardsUncached()
  const addresses = listed.map(b => b.address)
  // readBoardOwners reads creator:* KV keys for all platforms directly, covering Superfluid boards
  // where lb.creator is null until the creator visits /account (lb.admin is the beneficiary there).
  const [added, owners] = await Promise.all([readBoardModerators(addresses), readBoardOwners(addresses)])
  const boards = listed.map((b, i) => ({ ...b, moderators: [...new Set([...owners[i], ...b.moderators, ...added[i].moderators.map(m => m.wallet)])] }))
  await kv.set(BOARDS_CACHE_KEY, boards, { ex: BOARDS_CACHE_TTL }).catch(() => {})
  return boards
}

export async function clearModeratedBoards(): Promise<void> {
  await kv.del(BOARDS_CACHE_KEY).catch(() => {})
}

async function listBoardsUncached(): Promise<ModeratedBoard[]> {
  const origin = internalOrigin()
  const headers = internalHeaders()
  const get = (path: string) =>
    fetch(`${origin}${path}`, { headers, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => (d?.leaderboards ?? []) as ListedBoard[])
      .catch(() => [] as ListedBoard[])

  const [sf, gh, oi, fs, streaming] = await Promise.all([
    get('/api/superfluid/leaderboards'),
    get('/api/github/leaderboards'),
    get('/api/openinternet/leaderboards'),
    get('/api/forsale/leaderboards'),
    get('/api/streaming/leaderboards'),
  ])

  const boards = new Map<string, ModeratedBoard>()
  const add = (lb: ListedBoard, platform: string | null, strategy: ModeratedBoard['strategy']) => {
    if (lb.isLegacy || !lb.address) return
    const address = lb.address.toLowerCase()
    const moderators = [lb.admin, lb.creator].filter((a): a is string => !!a).map(a => a.toLowerCase())
    const existing = boards.get(address)
    if (existing) {
      existing.moderators = [...new Set([...existing.moderators, ...moderators])]
      return
    }
    boards.set(address, { address, name: lb.name || 'Untitled board', platform, strategy, moderators: [...new Set(moderators)] })
  }

  sf.forEach(lb => add(lb, 'superfluid', 'fixed'))
  gh.forEach(lb => add(lb, 'github', 'fixed'))
  oi.forEach(lb => add(lb, lb.platform ?? 'website', 'fixed'))
  fs.forEach(lb => add(lb, lb.platform ?? 'website', 'fixed'))
  streaming.forEach(lb => add(lb, lb.platform ?? null, 'streaming'))
  return [...boards.values()]
}

// Chunked so a full scan's read stays under Upstash's response size cap.
export async function readItems(markees: string[]): Promise<(ModerationItem | null)[]> {
  const chunks: string[][] = []
  for (let i = 0; i < markees.length; i += READ_CHUNK) chunks.push(markees.slice(i, i + READ_CHUNK))
  const rows = await Promise.all(chunks.map(c => kv.mget<(ModerationItem | null)[]>(...c.map(itemKey))))
  return rows.flat().map(normalizeItem)
}
