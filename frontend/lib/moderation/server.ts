import 'server-only'
import { kv } from '@vercel/kv'
import { createPublicClient, getAddress, http } from 'viem'
import { base } from 'viem/chains'
import { ADMIN_ADDRESSES } from '@/lib/moderation/config'
import { internalHeaders, internalOrigin } from '@/lib/internal-origin'
import type { ModerationItem } from '@/lib/moderation/queue'

export const FLAGGED_KEY = 'moderation:flagged'
export const CURSORS_KEY = 'moderation:cursors'
export const SCAN_LOCK_KEY = 'moderation:scan:lock'
export const itemKey = (markee: string) => `moderation:item:${base.id}:${markee.toLowerCase()}`
export const pendingKey = (board: string) => `moderation:pending:${board.toLowerCase()}`
export const boardMarkeesKey = (board: string) => `moderation:board:${board.toLowerCase()}:markees`

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const PRICING_STRATEGY_ABI = [
  { inputs: [], name: 'pricingStrategy', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const
// Same selector on fixed and streaming boards alike.
const ADMIN_ABI = [
  { inputs: [], name: 'admin', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

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

export function flagKeyVariants(markee: string): string[] {
  const keys = [flagKey(markee)]
  try { keys.push(`${base.id}:${getAddress(markee)}`) } catch { /* not an address */ }
  keys.push(`${base.id}:${markee}`)
  return [...new Set(keys)]
}

export async function readFlagged(): Promise<string[]> {
  const raw = (await kv.smembers(FLAGGED_KEY)) ?? []
  return [...new Set(raw.map(k => k.toLowerCase()))]
}

// Derives each markee's board on-chain (never from the caller) and allows the markee only where the
// moderator is a global admin, the board's on-chain admin(), or its KV-cached creator.
export async function authorizedMarkees(moderator: string, markeeIds: string[]): Promise<Set<string>> {
  const mod = moderator.toLowerCase()
  if (isGlobalAdmin(mod)) return new Set(markeeIds.map(id => id.toLowerCase()))
  const client = getModerationClient()

  const strategyReads = await client.multicall({
    contracts: markeeIds.map(id => ({ address: id as `0x${string}`, abi: PRICING_STRATEGY_ABI, functionName: 'pricingStrategy' as const })),
  })
  const boardOf = markeeIds.map((_, i) => {
    const b = strategyReads[i]?.result as string | undefined
    return b && b !== ZERO_ADDRESS ? b.toLowerCase() : null
  })

  const boards = [...new Set(boardOf.filter((b): b is string => !!b))]
  const allowed = new Set<string>()
  if (boards.length > 0) {
    const [adminReads, creators] = await Promise.all([
      client.multicall({
        contracts: boards.map(b => ({ address: b as `0x${string}`, abi: ADMIN_ABI, functionName: 'admin' as const })),
      }),
      kv.mget<(string | null)[]>(...boards.flatMap(b => [`creator:sf:${b}`, `creator:gh:${b}`, `creator:oi:${b}`, `creator:fs:${b}`])),
    ])
    boards.forEach((b, i) => {
      const admin = (adminReads[i]?.result as string | undefined)?.toLowerCase()
      const boardCreators = creators.slice(i * 4, i * 4 + 4)
      if (admin === mod || boardCreators.some(c => c?.toLowerCase() === mod)) allowed.add(b)
    })
  }

  return new Set(markeeIds.filter((_, i) => !!boardOf[i] && allowed.has(boardOf[i]!)).map(id => id.toLowerCase()))
}

export interface ModeratedBoard {
  address: string
  name: string
  platform: string | null
  strategy: 'fixed' | 'streaming'
  moderators: string[]
}

type ListedBoard = { address: string; name?: string; platform?: string; admin?: string | null; creator?: string | null; isLegacy?: boolean }

// Every v1.x fixed and streaming board, from the same listing routes /account reads. Legacy TopDawg
// strategies are excluded: they are not Leaderboard contracts and emit none of the scanned events.
export async function listModeratedBoards(): Promise<ModeratedBoard[]> {
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
    boards.set(address, { address, name: lb.name ?? 'Untitled board', platform, strategy, moderators: [...new Set(moderators)] })
  }

  sf.forEach(lb => add(lb, 'superfluid', 'fixed'))
  gh.forEach(lb => add(lb, 'github', 'fixed'))
  oi.forEach(lb => add(lb, lb.platform ?? 'website', 'fixed'))
  fs.forEach(lb => add(lb, lb.platform ?? 'website', 'fixed'))
  streaming.forEach(lb => add(lb, lb.platform ?? null, 'streaming'))
  return [...boards.values()]
}

export async function readItems(markees: string[]): Promise<(ModerationItem | null)[]> {
  if (markees.length === 0) return []
  return kv.mget<(ModerationItem | null)[]>(...markees.map(itemKey))
}
