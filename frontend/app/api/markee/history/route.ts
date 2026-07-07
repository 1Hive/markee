import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, isAddress, parseAbiItem } from 'viem'
import { base } from 'viem/chains'

export const dynamic = 'force-dynamic'

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

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

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
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

  try {
    const [createdLogs, migratedLogs, fundsLogs, messageLogs, nameLogs] = await Promise.all([
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_MARKEE_CREATED,
        args: { markeeAddress: markee },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_MARKEE_MIGRATED,
        args: { newMarkeeAddress: markee },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_FUNDS_ADDED,
        args: { markeeAddress: markee },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_MESSAGE_UPDATED,
        args: { markeeAddress: markee },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: leaderboard,
        event: LEADERBOARD_NAME_UPDATED,
        args: { markeeAddress: markee },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
    ])

    const allLogs = [...createdLogs, ...migratedLogs, ...fundsLogs, ...messageLogs, ...nameLogs]
    const blockNumbers = allLogs.map(log => log.blockNumber).filter((n): n is bigint => n !== null)
    const uniqueBlocks = [...new Set(blockNumbers.map(String))].map(BigInt)
    const blocks = await Promise.all(uniqueBlocks.map(blockNumber => client.getBlock({ blockNumber })))
    const timestamps = new Map(blocks.map(block => [block.number.toString(), Number(block.timestamp)]))
    const ts = (blockNumber: bigint | null) => blockNumber ? timestamps.get(blockNumber.toString()) ?? 0 : 0

    const history = [
      ...createdLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'funds' as const,
        amount: log.args.amount?.toString() ?? '0',
        newTotal: log.args.amount?.toString() ?? '0',
        actor: log.args.owner ?? '',
        timestamp: ts(log.blockNumber),
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...migratedLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'funds' as const,
        amount: log.args.historicalFunds?.toString() ?? '0',
        newTotal: log.args.historicalFunds?.toString() ?? '0',
        actor: log.args.owner ?? '',
        timestamp: ts(log.blockNumber),
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...fundsLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'funds' as const,
        amount: log.args.amount?.toString() ?? '0',
        newTotal: log.args.newMarkeeTotal?.toString() ?? '0',
        actor: log.args.addedBy ?? '',
        timestamp: ts(log.blockNumber),
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...messageLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'message' as const,
        message: log.args.newMessage ?? '',
        actor: log.args.updatedBy ?? '',
        timestamp: ts(log.blockNumber),
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
      ...nameLogs.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        kind: 'name' as const,
        name: log.args.newName ?? '',
        actor: log.args.updatedBy ?? '',
        timestamp: ts(log.blockNumber),
        blockNumber: (log.blockNumber ?? 0n).toString(),
        logIndex: Number(log.logIndex ?? 0),
        transactionHash: log.transactionHash ?? '',
      })),
    ].sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex
      return BigInt(b.blockNumber) > BigInt(a.blockNumber) ? 1 : -1
    })

    return NextResponse.json({ history }, { headers: NO_CACHE })
  } catch (error) {
    console.error('[markee-history] failed to load history', error)
    return NextResponse.json(
      { error: 'Unable to load transaction history' },
      { status: 500, headers: NO_CACHE },
    )
  }
}
