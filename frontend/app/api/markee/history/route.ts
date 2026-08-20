import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, isAddress, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'

export const dynamic = 'force-dynamic'

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}
const MAX_HISTORY_EVENTS = 50

// ── Fixed ("For Sale") leaderboard events ───────────────────────────────────
const LEADERBOARD_MARKEE_CREATED = parseAbiItem(
  'event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name, uint256 amount)'
)
const LEADERBOARD_MARKEE_MIGRATED = parseAbiItem(
  'event MarkeeMigratedFromLegacy(address indexed newMarkeeAddress, address indexed oldMarkeeAddress, address indexed owner, uint256 historicalFunds)'
)
const LEADERBOARD_FUNDS_ADDED = parseAbiItem(
  'event FundsAdded(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 newMarkeeTotal)'
)
const LEADERBOARD_MESSAGE_UPDATED = parseAbiItem(
  'event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage)'
)
const LEADERBOARD_NAME_UPDATED = parseAbiItem(
  'event NameUpdated(address indexed markeeAddress, address indexed updatedBy, string newName)'
)

// ── Streaming ("For Rent") leaderboard events ───────────────────────────────
// Deliberately different shape from the fixed events above -- streaming funding is a continuous
// flow rate, not a one-time amount, so StreamingLeaderboard.sol's MarkeeCreated has no `amount` at
// all (a different signature/topic hash from the fixed version) and there's no FundsAdded/
// MarkeeMigratedFromLegacy equivalent. DepositAdded/DepositWithdrawn/Settled are backer-level (not
// indexed by markee) so they don't have a natural place in a single markee's history and are skipped.
// Message/name edits go through Markee.setMessage/setName directly (not the leaderboard's
// updateMessage/updateName wrapper), so they emit MessageChanged/NameChanged on the markee contract
// itself, not MessageUpdated/NameUpdated on the leaderboard.
const STREAM_MARKEE_CREATED = parseAbiItem(
  'event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name)'
)
const STREAM_BACKER_UPDATED = parseAbiItem(
  'event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)'
)
const MARKEE_MESSAGE_CHANGED = parseAbiItem(
  'event MessageChanged(string newMessage, address indexed changedBy)'
)
const MARKEE_NAME_CHANGED = parseAbiItem(
  'event NameChanged(string newName, address indexed changedBy)'
)
const VERSION_ABI = [
  { inputs: [], name: 'VERSION', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

function getClient() {
  // Prefer the RPC the rest of the app reads from, so this server-side scan sees the same chain
  // the client-side hooks do; fall back to Alchemy/default.
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.ALCHEMY_BASE_URL || 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

type RawEvent = {
  id: string
  kind: 'funds' | 'message' | 'name' | 'bought' | 'rate'
  blockNumber: string
  logIndex: number
  transactionHash: string
  [key: string]: unknown
}

async function fetchFixedHistory(client: ReturnType<typeof getClient>, leaderboard: `0x${string}`, markee: `0x${string}`): Promise<RawEvent[]> {
  const [createdLogs, migratedLogs, fundsLogs, messageLogs, nameLogs] = await Promise.all([
    client.getLogs({ address: leaderboard, event: LEADERBOARD_MARKEE_CREATED, args: { markeeAddress: markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: leaderboard, event: LEADERBOARD_MARKEE_MIGRATED, args: { newMarkeeAddress: markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: leaderboard, event: LEADERBOARD_FUNDS_ADDED, args: { markeeAddress: markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: leaderboard, event: LEADERBOARD_MESSAGE_UPDATED, args: { markeeAddress: markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: leaderboard, event: LEADERBOARD_NAME_UPDATED, args: { markeeAddress: markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
  ])

  return [
    ...createdLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'funds' as const, subKind: 'created' as const,
      amount: log.args.amount?.toString() ?? '0', newTotal: log.args.amount?.toString() ?? '0',
      actor: log.args.owner ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
    ...migratedLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'funds' as const, subKind: 'migrated' as const,
      amount: log.args.historicalFunds?.toString() ?? '0', newTotal: log.args.historicalFunds?.toString() ?? '0',
      actor: log.args.owner ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
    ...fundsLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'funds' as const, subKind: 'added' as const,
      amount: log.args.amount?.toString() ?? '0', newTotal: log.args.newMarkeeTotal?.toString() ?? '0',
      actor: log.args.addedBy ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
    ...messageLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'message' as const,
      message: log.args.newMessage ?? '', actor: log.args.updatedBy ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
    ...nameLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'name' as const,
      name: log.args.newName ?? '', actor: log.args.updatedBy ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
  ]
}

async function fetchStreamingHistory(client: ReturnType<typeof getClient>, leaderboard: `0x${string}`, markee: `0x${string}`): Promise<{
  events: RawEvent[]
  bidders: { address: string; flowRateRaw: string }[]
}> {
  const [createdLogs, backerLogsRaw, messageLogs, nameLogs] = await Promise.all([
    client.getLogs({ address: leaderboard, event: STREAM_MARKEE_CREATED, args: { markeeAddress: markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: leaderboard, event: STREAM_BACKER_UPDATED, args: { markee }, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: markee, event: MARKEE_MESSAGE_CHANGED, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address: markee, event: MARKEE_NAME_CHANGED, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
  ])

  // Chronological ascending -- needed to find each actor's *first* BackerUpdated (to tell "opened a
  // brand new stream" from "changed an existing one") and each actor's *latest* one (their current
  // bid, for the bidders list). getLogs is normally already in this order; sort defensively.
  const backerLogs = [...backerLogsRaw].sort((a, b) => {
    const bn = (a.blockNumber ?? 0n) === (b.blockNumber ?? 0n) ? 0 : (a.blockNumber ?? 0n) > (b.blockNumber ?? 0n) ? 1 : -1
    return bn !== 0 ? bn : (a.logIndex ?? 0) - (b.logIndex ?? 0)
  })

  const createdLog = createdLogs[0]
  const creatorAddr = createdLog?.args.owner?.toLowerCase()

  // The creator's own first stream-open is a separate on-chain tx from MarkeeCreated, but from the
  // user's perspective it's one "Bought Message" action -- merge them into a single entry instead of
  // showing both.
  const boughtPairLog = createdLog && creatorAddr
    ? backerLogs.find(log => (log.args.backer ?? '').toLowerCase() === creatorAddr) ?? null
    : null

  const seenActors = new Set<string>()
  if (boughtPairLog && creatorAddr) seenActors.add(creatorAddr)

  const rateEvents: RawEvent[] = []
  for (const log of backerLogs) {
    if (log === boughtPairLog) continue
    const actor = (log.args.backer ?? '').toLowerCase()
    const flowRate = log.args.flowRate ?? 0n
    const subKind = flowRate === 0n ? 'stopped' : seenActors.has(actor) ? 'changed' : 'added'
    seenActors.add(actor)
    rateEvents.push({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'rate', subKind,
      flowRate: flowRate.toString(), newAggregate: (log.args.newAggregate ?? 0n).toString(),
      actor: log.args.backer ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })
  }

  const boughtEvents: RawEvent[] = createdLog ? [{
    id: `${createdLog.transactionHash}-${createdLog.logIndex}`, kind: 'bought',
    flowRate: (boughtPairLog?.args.flowRate ?? 0n).toString(),
    actor: createdLog.args.owner ?? '', blockNumber: (createdLog.blockNumber ?? 0n).toString(), logIndex: Number(createdLog.logIndex ?? 0), transactionHash: createdLog.transactionHash ?? '',
  }] : []

  // Current bidders: each actor's most recent rate, active ones only, richest first.
  const latestByActor = new Map<string, bigint>()
  for (const log of backerLogs) latestByActor.set((log.args.backer ?? '').toLowerCase(), log.args.flowRate ?? 0n)
  const bidders = [...latestByActor.entries()]
    .filter(([, rate]) => rate > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([address, flowRateRaw]) => ({ address, flowRateRaw: flowRateRaw.toString() }))

  const events = [
    ...boughtEvents,
    ...rateEvents,
    ...messageLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'message' as const,
      message: log.args.newMessage ?? '', actor: log.args.changedBy ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
    ...nameLogs.map(log => ({
      id: `${log.transactionHash}-${log.logIndex}`, kind: 'name' as const,
      name: log.args.newName ?? '', actor: log.args.changedBy ?? '', blockNumber: (log.blockNumber ?? 0n).toString(), logIndex: Number(log.logIndex ?? 0), transactionHash: log.transactionHash ?? '',
    })),
  ]

  return { events, bidders }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const leaderboardAddress = searchParams.get('leaderboardAddress')
  const markeeAddress = searchParams.get('markeeAddress')
  const strategyParam = searchParams.get('strategy')

  if (!leaderboardAddress || !markeeAddress || !isAddress(leaderboardAddress) || !isAddress(markeeAddress)) {
    return NextResponse.json(
      { error: 'Valid leaderboardAddress and markeeAddress are required' },
      { status: 400, headers: NO_CACHE },
    )
  }

  const client = getClient()
  const leaderboard = leaderboardAddress as `0x${string}`
  const markee = markeeAddress as `0x${string}`

  try {
    // A board's VERSION discriminates the strategy: streaming boards report "streaming-*", fixed
    // report "1.3.0" (see StreamingBoardDetail.tsx) -- only read on-chain when the caller doesn't
    // already know (e.g. the For Sale page never passes ?strategy, the For Rent page always does).
    let isStreaming = strategyParam === 'streaming'
    if (!strategyParam) {
      try {
        const version = await client.readContract({ address: leaderboard, abi: VERSION_ABI, functionName: 'VERSION' })
        isStreaming = version.startsWith('streaming')
      } catch {
        isStreaming = false
      }
    }

    const bidders: { address: string; flowRateRaw: string }[] = []
    let rawEvents: RawEvent[]
    if (isStreaming) {
      const result = await fetchStreamingHistory(client, leaderboard, markee)
      rawEvents = result.events
      bidders.push(...result.bidders)
    } else {
      rawEvents = await fetchFixedHistory(client, leaderboard, markee)
    }

    const eventsWithoutTimestamps = rawEvents.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex
      return BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1
    }).slice(0, MAX_HISTORY_EVENTS)

    const blockNumbers = eventsWithoutTimestamps.map(event => event.blockNumber).filter(blockNumber => blockNumber !== '0')
    const uniqueBlocks = [...new Set(blockNumbers)].map(BigInt)
    const blocks = await Promise.all(uniqueBlocks.map(blockNumber => client.getBlock({ blockNumber })))
    const timestamps = new Map(blocks.map(block => [block.number.toString(), Number(block.timestamp)]))
    const history = eventsWithoutTimestamps.map(event => ({
      ...event,
      timestamp: timestamps.get(event.blockNumber) ?? 0,
    }))

    return NextResponse.json({ history, limit: MAX_HISTORY_EVENTS, bidders }, { headers: NO_CACHE })
  } catch (error) {
    console.error('[markee-history] failed to load history', error)
    return NextResponse.json(
      { error: 'Unable to load transaction history' },
      { status: 500, headers: NO_CACHE },
    )
  }
}
