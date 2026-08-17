import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, isAddress, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { BASE_MARKEE_EVENTS_FROM_BLOCK } from '@/lib/contracts/addresses'

export const dynamic = 'force-dynamic'

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}
const MAX_HISTORY_EVENTS = 50

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

// StreamingLeaderboard variants: its MarkeeCreated has no trailing amount (different topic0 than the
// lump-sum event above), funding history lives in BackerUpdated (stream rate changes), and message
// edits go through Markee.setMessage directly, which emits MessageChanged/NameChanged on the markee
// contract itself rather than through the leaderboard.
const STREAMING_MARKEE_CREATED = parseAbiItem(
  'event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name)'
)
const STREAMING_BACKER_UPDATED = parseAbiItem(
  'event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)'
)
const MARKEE_MESSAGE_CHANGED = parseAbiItem(
  'event MessageChanged(string newMessage, address indexed changedBy)'
)
const MARKEE_NAME_CHANGED = parseAbiItem(
  'event NameChanged(string newName, address indexed changedBy)'
)

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const leaderboardAddress = searchParams.get('leaderboardAddress')
  const markeeAddress = searchParams.get('markeeAddress')

  if (!leaderboardAddress || !markeeAddress || !isAddress(leaderboardAddress) || !isAddress(markeeAddress)) {
    return NextResponse.json(
      { error: 'Valid leaderboardAddress and markeeAddress are required' },
      { status: 400, headers: NO_CACHE },
    )
  }

  const client = getClient()
  const leaderboard = leaderboardAddress as `0x${string}`
  const markee = markeeAddress as `0x${string}`
  const isStreaming = searchParams.get('strategy') === 'streaming'

  try {
    if (isStreaming) {
      const [createdLogs, backerLogs, messageLogs, nameLogs] = await Promise.all([
        client.getLogs({
          address: leaderboard,
          event: STREAMING_MARKEE_CREATED,
          args: { markeeAddress: markee },
          fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
          toBlock: 'latest',
        }),
        client.getLogs({
          address: leaderboard,
          event: STREAMING_BACKER_UPDATED,
          args: { markee },
          fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
          toBlock: 'latest',
        }),
        client.getLogs({
          address: markee,
          event: MARKEE_MESSAGE_CHANGED,
          fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
          toBlock: 'latest',
        }),
        client.getLogs({
          address: markee,
          event: MARKEE_NAME_CHANGED,
          fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
          toBlock: 'latest',
        }),
      ])

      const streamingEvents = [
        ...createdLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          kind: 'funds' as const,
          subKind: 'created' as const,
          amount: '0',
          newTotal: '0',
          actor: log.args.owner ?? '',
          blockNumber: (log.blockNumber ?? 0n).toString(),
          logIndex: Number(log.logIndex ?? 0),
          transactionHash: log.transactionHash ?? '',
        })),
        ...backerLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          kind: 'stream' as const,
          rate: (log.args.flowRate ?? 0n).toString(),
          actor: log.args.backer ?? '',
          blockNumber: (log.blockNumber ?? 0n).toString(),
          logIndex: Number(log.logIndex ?? 0),
          transactionHash: log.transactionHash ?? '',
        })),
        ...messageLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          kind: 'message' as const,
          message: log.args.newMessage ?? '',
          actor: log.args.changedBy ?? '',
          blockNumber: (log.blockNumber ?? 0n).toString(),
          logIndex: Number(log.logIndex ?? 0),
          transactionHash: log.transactionHash ?? '',
        })),
        ...nameLogs.map(log => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          kind: 'name' as const,
          name: log.args.newName ?? '',
          actor: log.args.changedBy ?? '',
          blockNumber: (log.blockNumber ?? 0n).toString(),
          logIndex: Number(log.logIndex ?? 0),
          transactionHash: log.transactionHash ?? '',
        })),
      ].sort((a, b) => {
        if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex
        return BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1
      }).slice(0, MAX_HISTORY_EVENTS)

      const streamingBlockNumbers = [...new Set(streamingEvents.map(e => e.blockNumber).filter(bn => bn !== '0'))].map(BigInt)
      const streamingBlocks = await Promise.all(streamingBlockNumbers.map(blockNumber => client.getBlock({ blockNumber })))
      const streamingTimestamps = new Map(streamingBlocks.map(block => [block.number.toString(), Number(block.timestamp)]))
      const history = streamingEvents.map(event => ({
        ...event,
        timestamp: streamingTimestamps.get(event.blockNumber) ?? 0,
      }))

      return NextResponse.json({ history, limit: MAX_HISTORY_EVENTS }, { headers: NO_CACHE })
    }

    const [createdLogs, migratedLogs, fundsLogs, messageLogs, nameLogs] = await Promise.all([
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_MARKEE_CREATED,
        args: { markeeAddress: markee },
        fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_MARKEE_MIGRATED,
        args: { newMarkeeAddress: markee },
        fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_FUNDS_ADDED,
        args: { markeeAddress: markee },
        fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_MESSAGE_UPDATED,
        args: { markeeAddress: markee },
        fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_NAME_UPDATED,
        args: { markeeAddress: markee },
        fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK,
        toBlock: 'latest',
      }),
    ])

    const eventsWithoutTimestamps = [
      ...createdLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'funds' as const,
        subKind: 'created' as const,
        amount: log.args.amount?.toString() ?? '0',
        newTotal: log.args.amount?.toString() ?? '0',
        actor: log.args.owner ?? '',
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...migratedLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'funds' as const,
        subKind: 'migrated' as const,
        amount: log.args.historicalFunds?.toString() ?? '0',
        newTotal: log.args.historicalFunds?.toString() ?? '0',
        actor: log.args.owner ?? '',
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...fundsLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'funds' as const,
        subKind: 'added' as const,
        amount: log.args.amount?.toString() ?? '0',
        newTotal: log.args.newMarkeeTotal?.toString() ?? '0',
        actor: log.args.addedBy ?? '',
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...messageLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'message' as const,
        message: log.args.newMessage ?? '',
        actor: log.args.updatedBy ?? '',
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...nameLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'name' as const,
        name: log.args.newName ?? '',
        actor: log.args.updatedBy ?? '',
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
    ].sort((a, b) => {
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

    return NextResponse.json({ history, limit: MAX_HISTORY_EVENTS }, { headers: NO_CACHE })
  } catch (error) {
    console.error('[markee-history] failed to load history', error)
    return NextResponse.json(
      { error: 'Unable to load transaction history' },
      { status: 500, headers: NO_CACHE },
    )
  }
}
